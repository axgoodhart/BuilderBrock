/**
 * applySceneOperations — the single, all-or-nothing validated mutation for a
 * SceneDocument. On any failure the returned document is the untouched input
 * and `errors` explains why; callers (chat proposals, inspector fields,
 * gizmos, timeline, flowcharts) all funnel through here.
 */
import {
    SceneDocument, SceneNode, SceneNodeSchema, MaterialDefSchema,
    PhysicsComponentSchema, MaterialPropsSchema,
} from './document';
import { SceneOperation, SceneOperationSchema, parseSceneOperations } from './operations';

export interface ApplyResult {
    ok: boolean;
    document: SceneDocument;
    errors: string[];
    /** Operations that would have applied (only meaningful when ok). */
    applied: SceneOperation[];
}

let idCounter = 0;
function genId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function findNode(doc: SceneDocument, id: string): SceneNode | undefined {
    return doc.nodes.find(n => n.id === id);
}

function collectSubtreeIds(doc: SceneDocument, rootId: string): Set<string> {
    const out = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const n of doc.nodes) {
            if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
                out.add(n.id);
                changed = true;
            }
        }
    }
    return out;
}

function isDescendant(doc: SceneDocument, nodeId: string, maybeAncestorId: string): boolean {
    let cur = findNode(doc, nodeId);
    while (cur && cur.parentId) {
        if (cur.parentId === maybeAncestorId) return true;
        cur = findNode(doc, cur.parentId);
    }
    return false;
}

function merge<T>(base: T, patch: Partial<T> | undefined): T {
    if (!patch) return base;
    return { ...(base as any), ...(patch as any) };
}

function applyOne(doc: SceneDocument, op: SceneOperation, errors: string[]): SceneDocument {
    switch (op.op) {
        case 'node.add': {
            if (op.node.id && findNode(doc, op.node.id)) {
                errors.push(`node.add: id "${op.node.id}" already exists`);
                return doc;
            }
            if (op.node.parentId && !findNode(doc, op.node.parentId)) {
                errors.push(`node.add: parent "${op.node.parentId}" not found`);
                return doc;
            }
            if (op.node.materialId && !doc.materials.some(m => m.id === op.node.materialId)) {
                errors.push(`node.add: material "${op.node.materialId}" not found`);
                return doc;
            }
            const node = SceneNodeSchema.parse({
                ...op.node,
                id: op.node.id || genId('node'),
                transform: {
                    position: { x: 0, y: 0, z: 0, ...op.node.transform?.position },
                    rotation: { x: 0, y: 0, z: 0, ...op.node.transform?.rotation },
                    scale: { x: 1, y: 1, z: 1, ...op.node.transform?.scale },
                },
                materialOverride: op.node.materialOverride
                    ? MaterialPropsSchema.parse(op.node.materialOverride)
                    : null,
            });
            return { ...doc, nodes: [...doc.nodes, node] };
        }
        case 'node.remove': {
            if (!findNode(doc, op.id)) { errors.push(`node.remove: "${op.id}" not found`); return doc; }
            const subtree = collectSubtreeIds(doc, op.id);
            const activeCameraRemoved = doc.activeCameraId && subtree.has(doc.activeCameraId);
            return {
                ...doc,
                nodes: doc.nodes.filter(n => !subtree.has(n.id)),
                activeCameraId: activeCameraRemoved ? null : doc.activeCameraId,
            };
        }
        case 'node.rename': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`node.rename: "${op.id}" not found`); return doc; }
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, name: op.name } : x) };
        }
        case 'node.reparent': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`node.reparent: "${op.id}" not found`); return doc; }
            if (op.parentId) {
                if (op.parentId === op.id) { errors.push(`node.reparent: cannot parent to self`); return doc; }
                if (!findNode(doc, op.parentId)) { errors.push(`node.reparent: parent "${op.parentId}" not found`); return doc; }
                if (isDescendant(doc, op.parentId, op.id)) { errors.push(`node.reparent: cycle detected`); return doc; }
            }
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, parentId: op.parentId } : x) };
        }
        case 'node.duplicate': {
            const src = findNode(doc, op.id);
            if (!src) { errors.push(`node.duplicate: "${op.id}" not found`); return doc; }
            const subtree = collectSubtreeIds(doc, op.id);
            const idMap = new Map<string, string>();
            for (const sid of subtree) idMap.set(sid, genId('node'));
            const clones: SceneNode[] = doc.nodes
                .filter(n => subtree.has(n.id))
                .map(n => ({
                    ...structuredClone(n),
                    id: idMap.get(n.id)!,
                    parentId: n.id === op.id ? n.parentId : idMap.get(n.parentId!)!,
                    name: n.id === op.id ? (op.newName || `${n.name} copy`) : n.name,
                }));
            return { ...doc, nodes: [...doc.nodes, ...clones] };
        }
        case 'node.setVisible':
        case 'node.setLocked': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`${op.op}: "${op.id}" not found`); return doc; }
            const key = op.op === 'node.setVisible' ? 'visible' : 'locked';
            const value = op.op === 'node.setVisible' ? op.visible : op.locked;
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, [key]: value } : x) };
        }
        case 'node.transform': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`node.transform: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`node.transform: "${op.id}" is locked`); return doc; }
            const t = {
                position: merge(n.transform.position, op.position),
                rotation: merge(n.transform.rotation, op.rotation),
                scale: merge(n.transform.scale, op.scale),
            };
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, transform: t } : x) };
        }
        case 'node.setGeometry': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`node.setGeometry: "${op.id}" not found`); return doc; }
            if (n.kind !== 'mesh') { errors.push(`node.setGeometry: "${op.id}" is not a mesh`); return doc; }
            if (n.locked) { errors.push(`node.setGeometry: "${op.id}" is locked`); return doc; }
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, geometry: op.geometry } : x) };
        }
        case 'node.setLight':
        case 'node.setCamera': {
            const node = findNode(doc, op.id);
            const kind = op.op === 'node.setLight' ? 'light' : 'camera';
            if (!node || node.kind !== kind || !node[kind]) { errors.push(`${op.op}: ${kind} "${op.id}" not found`); return doc; }
            if (node.locked) { errors.push(`${op.op}: "${op.id}" is locked`); return doc; }
            const patch = op.op === 'node.setLight' ? op.light : op.camera;
            return { ...doc, nodes: doc.nodes.map(n => n.id === op.id ? { ...n, [kind]: { ...n[kind], ...patch } } : n) };
        }
        case 'material.define': {
            if (op.material.id && doc.materials.some(m => m.id === op.material.id)) {
                errors.push(`material.define: id "${op.material.id}" already exists`);
                return doc;
            }
            const mat = MaterialDefSchema.parse({
                ...op.material,
                id: op.material.id || genId('mat'),
            });
            return { ...doc, materials: [...doc.materials, mat] };
        }
        case 'material.assign': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`material.assign: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`material.assign: "${op.id}" is locked`); return doc; }
            if (op.materialId && !doc.materials.some(m => m.id === op.materialId)) {
                errors.push(`material.assign: material "${op.materialId}" not found`);
                return doc;
            }
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, materialId: op.materialId } : x) };
        }
        case 'material.update': {
            const m = doc.materials.find(x => x.id === op.materialId);
            if (!m) { errors.push(`material.update: "${op.materialId}" not found`); return doc; }
            return {
                ...doc,
                materials: doc.materials.map(x => x.id === op.materialId
                    ? { ...x, props: { ...x.props, ...op.props } } : x),
            };
        }
        case 'material.setOverride': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`material.setOverride: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`material.setOverride: "${op.id}" is locked`); return doc; }
            const override = op.props ? MaterialPropsSchema.parse(op.props) : null;
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, materialOverride: override } : x) };
        }
        case 'animation.upsertClip': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`animation.upsertClip: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`animation.upsertClip: "${op.id}" is locked`); return doc; }
            const anims = n.animations.some(c => c.id === op.clip.id)
                ? n.animations.map(c => c.id === op.clip.id ? op.clip : c)
                : [...n.animations, op.clip];
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, animations: anims } : x) };
        }
        case 'animation.removeClip': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`animation.removeClip: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`animation.removeClip: "${op.id}" is locked`); return doc; }
            return {
                ...doc,
                nodes: doc.nodes.map(x => x.id === op.id
                    ? { ...x, animations: x.animations.filter(c => c.id !== op.clipId) } : x),
            };
        }
        case 'animation.keyframe': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`animation.keyframe: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`animation.keyframe: "${op.id}" is locked`); return doc; }
            const clip = n.animations.find(c => c.id === op.clipId);
            if (!clip) { errors.push(`animation.keyframe: clip "${op.clipId}" not found`); return doc; }
            const tracks = clip.tracks.some(t => t.path === op.path)
                ? clip.tracks.map(t => t.path === op.path
                    ? { ...t, keyframes: [...t.keyframes.filter(k => k.time !== op.time), { time: op.time, value: op.value, easing: op.easing }].sort((a, b) => a.time - b.time) }
                    : t)
                : [...clip.tracks, { path: op.path, keyframes: [{ time: op.time, value: op.value, easing: op.easing }] }];
            return {
                ...doc,
                nodes: doc.nodes.map(x => x.id === op.id
                    ? { ...x, animations: x.animations.map(c => c.id === op.clipId ? { ...c, tracks } : c) } : x),
            };
        }
        case 'animation.setKeyTime': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`animation.setKeyTime: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`animation.setKeyTime: "${op.id}" is locked`); return doc; }
            const clip = n.animations.find(c => c.id === op.clipId);
            if (!clip) { errors.push(`animation.setKeyTime: clip "${op.clipId}" not found`); return doc; }
            const track = clip.tracks.find(t => t.path === op.path);
            if (!track || !track.keyframes.some(k => k.time === op.fromTime)) {
                errors.push(`animation.setKeyTime: no key at t=${op.fromTime} on "${op.path}"`);
                return doc;
            }
            if (op.toTime > clip.duration || track.keyframes.some(k => k.time !== op.fromTime && Math.abs(k.time - op.toTime) < 1e-6)) {
                errors.push('Choose an unoccupied keyframe time within the clip.');
                return doc;
            }
            const tracks = clip.tracks.map(t => t.path === op.path
                ? { ...t, keyframes: t.keyframes.map(k => k.time === op.fromTime ? { ...k, time: op.toTime } : k).sort((a, b) => a.time - b.time) }
                : t);
            return {
                ...doc,
                nodes: doc.nodes.map(x => x.id === op.id
                    ? { ...x, animations: x.animations.map(c => c.id === op.clipId ? { ...c, tracks } : c) } : x),
            };
        }
        case 'interaction.connect': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`interaction.connect: "${op.id}" not found`); return doc; }
            const interactions = n.interactions.some(i => i.id === op.interaction.id)
                ? n.interactions.map(i => i.id === op.interaction.id ? op.interaction : i)
                : [...n.interactions, op.interaction];
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, interactions } : x) };
        }
        case 'interaction.disconnect': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`interaction.disconnect: "${op.id}" not found`); return doc; }
            return {
                ...doc,
                nodes: doc.nodes.map(x => x.id === op.id
                    ? { ...x, interactions: x.interactions.filter(i => i.id !== op.interactionId) } : x),
            };
        }
        case 'physics.configure': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`physics.configure: "${op.id}" not found`); return doc; }
            if (n.locked) { errors.push(`physics.configure: "${op.id}" is locked`); return doc; }
            const physics = op.physics === null
                ? null
                : PhysicsComponentSchema.parse(n.physics ? { ...n.physics, ...op.physics } : op.physics);
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, physics } : x) };
        }
        case 'world.update': {
            const w = op.world;
            const world = {
                ...doc.world,
                backgroundColor: w.backgroundColor ?? doc.world.backgroundColor,
                environmentAssetId: w.environmentAssetId !== undefined ? w.environmentAssetId : doc.world.environmentAssetId,
                environmentPreset: w.environmentPreset !== undefined ? w.environmentPreset : doc.world.environmentPreset,
                fog: { ...doc.world.fog, ...w.fog },
                ground: { ...doc.world.ground, ...w.ground },
                toneMapping: w.toneMapping ?? doc.world.toneMapping,
                toneMappingExposure: w.toneMappingExposure ?? doc.world.toneMappingExposure,
                cameraDefault: { ...doc.world.cameraDefault, ...w.cameraDefault },
            };
            return { ...doc, world };
        }
        case 'camera.setActive': {
            if (op.id) {
                const n = findNode(doc, op.id);
                if (!n) { errors.push(`camera.setActive: "${op.id}" not found`); return doc; }
                if (n.kind !== 'camera') { errors.push(`camera.setActive: "${op.id}" is not a camera`); return doc; }
            }
            return { ...doc, activeCameraId: op.id };
        }
        case 'script.set': {
            const n = findNode(doc, op.id);
            if (!n) { errors.push(`script.set: "${op.id}" not found`); return doc; }
            if (n.kind !== 'customScript') { errors.push(`script.set: "${op.id}" is not a customScript node`); return doc; }
            return { ...doc, nodes: doc.nodes.map(x => x.id === op.id ? { ...x, customScript: op.code } : x) };
        }
        default:
            errors.push(`Unknown operation: ${(op as any).op}`);
            return doc;
    }
}

/**
 * Apply operations to a cloned document. All-or-nothing: if any operation is
 * invalid, `ok` is false and `document` is the untouched input.
 */
export function applySceneOperations(document: SceneDocument, operations: unknown): ApplyResult {
    let ops: SceneOperation[];
    try {
        ops = parseSceneOperations(operations);
    } catch (e: any) {
        return { ok: false, document, errors: [`Invalid operations: ${e.message}`], applied: [] };
    }

    let doc: SceneDocument = structuredClone(document);
    const errors: string[] = [];
    const applied: SceneOperation[] = [];

    for (const op of ops) {
        const next = applyOne(doc, op, errors);
        if (errors.length > 0) {
            return { ok: false, document, errors, applied: [] };
        }
        doc = next;
        applied.push(op);
    }
    return { ok: true, document: doc, errors: [], applied };
}
