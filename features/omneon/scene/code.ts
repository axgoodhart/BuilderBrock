/**
 * Honest two-way code binding.
 *
 * generateSceneModule: deterministic managed TypeScript from a SceneDocument,
 * with stable IDs and parseable single-declaration-per-node structure.
 *
 * parseSceneModule: TypeScript-AST parse of SUPPORTED declarations (node
 * transform/name/geometry/material/world) back into SceneOperation[].
 * Anything unsupported is reported as an error — invalid code stays in the
 * editor and never damages the last working scene. Arbitrary custom JS is
 * preserved in Custom Script nodes, not decompiled.
 */
import ts from 'typescript';
import { SceneDocument, SceneNode } from './document';
import { SceneOperation } from './operations';

const f = (n: number) => Number(n.toFixed(4));

function vec(v: { x: number; y: number; z: number }): string {
    return `[${f(v.x)}, ${f(v.y)}, ${f(v.z)}]`;
}

function geometryLiteral(node: SceneNode): string {
    const g = node.geometry;
    if (!g) return 'null';
    const parts: string[] = [`type: '${g.type}'`];
    for (const [k, v] of Object.entries(g)) {
        if (k === 'type') continue;
        parts.push(`${k}: ${typeof v === 'number' ? f(v) : JSON.stringify(v)}`);
    }
    return `{ ${parts.join(', ')} }`;
}

export function generateSceneModule(document: SceneDocument): string {
    const lines: string[] = [
        '// ─── Omneon managed scene module ────────────────────────────────────',
        '// Generated from the SceneDocument. Supported edits (parsed back):',
        '//   name, transform position/rotation/scale, geometry, material refs,',
        '//   visible, world settings. Unsupported edits are rejected with an error.',
        '// ─────────────────────────────────────────────────────────────────────',
        '',
        'export const sceneVersion = 1;',
        '',
    ];

    // Deterministic ordering: roots first, then by id.
    const sorted = [...document.nodes].sort((a, b) =>
        (a.parentId || '').localeCompare(b.parentId || '') || a.id.localeCompare(b.id));

    for (const n of sorted) {
        const t = n.transform;
        lines.push(`defineNode('${n.id}', {`);
        lines.push(`  name: ${JSON.stringify(n.name)},`);
        lines.push(`  kind: '${n.kind}',`);
        lines.push(`  parent: ${n.parentId ? `'${n.parentId}'` : 'null'},`);
        lines.push(`  transform: {`);
        lines.push(`    position: ${vec(t.position)},`);
        lines.push(`    rotation: ${vec(t.rotation)},`);
        lines.push(`    scale: ${vec(t.scale)},`);
        lines.push(`  },`);
        lines.push(`  geometry: ${geometryLiteral(n)},`);
        lines.push(`  material: ${n.materialId ? `'${n.materialId}'` : 'null'},`);
        lines.push(`  visible: ${n.visible},`);
        lines.push(`});`);
        lines.push('');
    }

    const w = document.world;
    lines.push(`defineWorld({`);
    lines.push(`  backgroundColor: ${JSON.stringify(w.backgroundColor)},`);
    lines.push(`  toneMapping: '${w.toneMapping}',`);
    lines.push(`  toneMappingExposure: ${f(w.toneMappingExposure)},`);
    lines.push(`  fog: { enabled: ${w.fog.enabled}, color: ${JSON.stringify(w.fog.color)}, near: ${f(w.fog.near)}, far: ${f(w.fog.far)} },`);
    lines.push(`  ground: { enabled: ${w.ground.enabled}, size: ${f(w.ground.size)} },`);
    lines.push(`});`);
    lines.push('');
    return lines.join('\n');
}

/* ------------------------------ parsing ------------------------------ */

function literalToJs(node: ts.Expression, errors: string[]): any {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return parseFloat(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
        const inner = literalToJs(node.operand, errors);
        return typeof inner === 'number' ? -inner : NaN;
    }
    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.map(e => literalToJs(e, errors));
    }
    if (ts.isObjectLiteralExpression(node)) {
        const out: any = {};
        for (const prop of node.properties) {
            if (!ts.isPropertyAssignment(prop)) { errors.push('unsupported object member'); continue; }
            const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
            if (!key) { errors.push('unsupported property key'); continue; }
            out[key] = literalToJs(prop.initializer, errors);
        }
        return out;
    }
    errors.push(`unsupported expression: ${node.getText().slice(0, 40)}`);
    return undefined;
}

function arrToVec(arr: any, errors: string[]): { x: number; y: number; z: number } {
    if (!Array.isArray(arr) || arr.length !== 3 || arr.some((v: any) => typeof v !== 'number')) {
        errors.push(`expected [x, y, z] number triple, got ${JSON.stringify(arr)}`);
        return { x: 0, y: 0, z: 0 };
    }
    return { x: arr[0], y: arr[1], z: arr[2] };
}

export interface ParseResult {
    ok: boolean;
    operations: SceneOperation[];
    errors: string[];
    /** True when the module differs from a pure regeneration (any edits). */
    changed: boolean;
}

/**
 * Parse supported declarations back into operations. Fails loudly on
 * unsupported constructs so bad edits never reach the scene.
 */
/** Build a full node-add payload from parsed defineNode props (migration path). */
function buildNodeFromProps(id: string, props: any, errors: string[]): any {
    const t = props.transform || {};
    const node: any = {
        id,
        name: typeof props.name === 'string' && props.name ? props.name : id,
        kind: ['mesh', 'group', 'light', 'camera', 'customScript'].includes(props.kind) ? props.kind : 'mesh',
        parentId: props.parent ?? null, // import.ts defers this into reparent ops
        transform: {
            position: t.position !== undefined ? arrToVec(t.position, errors) : { x: 0, y: 0, z: 0 },
            rotation: t.rotation !== undefined ? arrToVec(t.rotation, errors) : { x: 0, y: 0, z: 0 },
            scale: t.scale !== undefined ? arrToVec(t.scale, errors) : { x: 1, y: 1, z: 1 },
        },
        geometry: props.geometry ?? null,
        materialId: props.material ?? null,
        visible: props.visible !== false,
    };
    if (props.light) node.light = props.light;
    if (props.camera) node.camera = props.camera;
    return node;
}

export function parseSceneModule(code: string, document: SceneDocument, opts: { allowAdds?: boolean } = {}): ParseResult {
    const errors: string[] = [];
    const operations: SceneOperation[] = [];

    let sourceFile: ts.SourceFile;
    try {
        sourceFile = ts.createSourceFile('scene.ts', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    } catch (e: any) {
        return { ok: false, operations: [], errors: [`parse error: ${e.message}`], changed: false };
    }

    // Syntax diagnostics block everything.
    const syntaxErrors = (((sourceFile as any).parseDiagnostics) || [])
        .map(d => `syntax: ${typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText}`);
    if (syntaxErrors.length) {
        return { ok: false, operations: [], errors: syntaxErrors, changed: true };
    }

    const byId = new Map(document.nodes.map(n => [n.id, n]));
    const seen = new Set<string>();

    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const fn = node.expression.text;
            if (fn === 'defineNode') {
                const [idArg, objArg] = node.arguments;
                if (!idArg || !ts.isStringLiteral(idArg)) {
                    errors.push('defineNode: first argument must be a string id');
                } else if (!objArg || !ts.isObjectLiteralExpression(objArg)) {
                    errors.push(`defineNode('${idArg.text}'): second argument must be an object literal`);
                } else {
                    const id = idArg.text;
                    const existing = byId.get(id);
                    seen.add(id);
                    let props: any;
                    let propsErr = false;
                    const collect: string[] = [];
                    props = literalToJs(objArg, collect);
                    if (collect.length) { errors.push(...collect.map(e => `defineNode('${id}'): ${e}`)); propsErr = true; }

                    if (!existing) {
                        if (opts.allowAdds && !propsErr && props && typeof props === 'object') {
                            // Migration path (step 16): unknown ids become node.add ops.
                            operations.push({ op: 'node.add', node: buildNodeFromProps(id, props, errors) });
                        } else {
                            errors.push(`defineNode('${id}'): unknown node id — adding nodes in code is not supported; use the viewport or chat`);
                        }
                    } else if (!propsErr && props && typeof props === 'object') {
                        const supported = new Set(['name', 'kind', 'parent', 'transform', 'geometry', 'material', 'visible']);
                        for (const key of Object.keys(props)) {
                            if (!supported.has(key)) errors.push(`defineNode('${id}'): unsupported property "${key}"`);
                        }
                        if (props.name !== undefined && props.name !== existing.name) {
                            if (typeof props.name !== 'string' || !props.name) errors.push(`defineNode('${id}'): name must be a non-empty string`);
                            else operations.push({ op: 'node.rename', id, name: props.name });
                        }
                        if (props.parent !== undefined) {
                            if (props.parent !== existing.parentId) {
                                errors.push(`defineNode('${id}'): reparenting in code is not supported; use the scene tree`);
                            }
                        }
                        if (props.kind !== undefined && props.kind !== existing.kind) {
                            errors.push(`defineNode('${id}'): kind cannot be changed`);
                        }
                        if (props.transform !== undefined) {
                            const t = props.transform;
                            if (typeof t !== 'object' || t === null) {
                                errors.push(`defineNode('${id}'): transform must be an object`);
                            } else {
                                for (const key of Object.keys(t)) {
                                    if (!['position', 'rotation', 'scale'].includes(key)) errors.push(`defineNode('${id}'): unsupported transform field "${key}"`);
                                }
                                const pos = t.position !== undefined ? arrToVec(t.position, errors) : null;
                                const rot = t.rotation !== undefined ? arrToVec(t.rotation, errors) : null;
                                const scl = t.scale !== undefined ? arrToVec(t.scale, errors) : null;
                                const changed =
                                    (pos && (pos.x !== existing.transform.position.x || pos.y !== existing.transform.position.y || pos.z !== existing.transform.position.z)) ||
                                    (rot && (rot.x !== existing.transform.rotation.x || rot.y !== existing.transform.rotation.y || rot.z !== existing.transform.rotation.z)) ||
                                    (scl && (scl.x !== existing.transform.scale.x || scl.y !== existing.transform.scale.y || scl.z !== existing.transform.scale.z));
                                if (changed) {
                                    const patch: any = { op: 'node.transform', id };
                                    if (pos && (pos.x !== existing.transform.position.x || pos.y !== existing.transform.position.y || pos.z !== existing.transform.position.z)) patch.position = pos;
                                    if (rot && (rot.x !== existing.transform.rotation.x || rot.y !== existing.transform.rotation.y || rot.z !== existing.transform.rotation.z)) patch.rotation = rot;
                                    if (scl && (scl.x !== existing.transform.scale.x || scl.y !== existing.transform.scale.y || scl.z !== existing.transform.scale.z)) patch.scale = scl;
                                    operations.push(patch);
                                }
                            }
                        }
                        if (props.geometry !== undefined) {
                            const g = props.geometry;
                            if (g === null && existing.geometry !== null) {
                                errors.push(`defineNode('${id}'): removing geometry in code is not supported`);
                            } else if (g && typeof g === 'object') {
                                const cur = existing.geometry as any;
                                const same = cur && cur.type === g.type &&
                                    Object.entries(g).every(([k, v]) => k === 'type' || cur[k] === v);
                                if (!same) {
                                    const { type, ...rest } = g;
                                    operations.push({ op: 'node.setGeometry', id, geometry: { type, ...rest } as any });
                                }
                            }
                        }
                        if (props.material !== undefined && props.material !== existing.materialId) {
                            if (props.material !== null && !document.materials.some(m => m.id === props.material)) {
                                errors.push(`defineNode('${id}'): unknown material "${props.material}"`);
                            } else {
                                operations.push({ op: 'material.assign', id, materialId: props.material });
                            }
                        }
                        if (props.visible !== undefined && props.visible !== existing.visible) {
                            operations.push({ op: 'node.setVisible', id, visible: !!props.visible });
                        }
                    }
                }
            } else if (fn === 'defineWorld') {
                const [objArg] = node.arguments;
                if (!objArg || !ts.isObjectLiteralExpression(objArg)) {
                    errors.push('defineWorld: argument must be an object literal');
                } else {
                    const collect: string[] = [];
                    const w = literalToJs(objArg, collect);
                    if (collect.length) errors.push(...collect.map(e => `defineWorld: ${e}`));
                    else if (w && typeof w === 'object') {
                        const world: any = {};
                        const cur = document.world as any;
                        // Null-tolerant deep compare: generated literals omit null fields.
                        const norm = (v: any): any => {
                            if (v === null || v === undefined) return undefined;
                            if (Array.isArray(v)) return v.map(norm);
                            if (typeof v === 'object') {
                                const out: any = {};
                                for (const [k, val] of Object.entries(v)) {
                                    const n = norm(val);
                                    if (n !== undefined) out[k] = n;
                                }
                                return out;
                            }
                            return v;
                        };
                        for (const key of ['backgroundColor', 'toneMapping', 'toneMappingExposure', 'fog', 'ground']) {
                            if (w[key] === undefined) continue;
                            const a = norm(w[key]);
                            const b = norm(cur[key]);
                            if (JSON.stringify(a) !== JSON.stringify(b)) world[key] = w[key];
                        }
                        if (Object.keys(world).length) operations.push({ op: 'world.update', world });
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    // Missing declarations are fine (node removed elsewhere); we only parse
    // what's present. Unknown free-floating statements are ignored unless
    // they look like attempts to call define* with wrong arity.
    const changed = code.trim() !== generateSceneModule(document).trim();
    return { ok: errors.length === 0, operations, errors, changed };
}
