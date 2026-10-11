import { SceneDocument, createEmptyDocument, parseSceneDocument, MaterialDef, SceneNode } from './document';
import { SceneOperation } from './operations';
import { parseSceneModule } from './code';

export interface ImportResult {
    ok: boolean;
    errors: string[];
    /** Ops to apply to an empty/current document. */
    operations: SceneOperation[];
    /** Parsed document (JSON path only). */
    document: SceneDocument | null;
    detected: 'module' | 'json' | null;
}

/**
 * Migration (step 16): import an existing Omneon scene into the typed
 * SceneDocument world.
 *
 * Two accepted inputs:
 *  - Managed scene module (.ts/.js): the `defineNode`/`defineWorld` format —
 *    parsed with the TypeScript AST and emitted as SceneOperations.
 *  - SceneDocument JSON (.json): validated by the document schema.
 */
export function importSceneCode(code: string): ImportResult {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, errors: ['empty input'], operations: [], document: null, detected: null };

    // JSON path: starts with '{' and parses as a SceneDocument.
    if (trimmed.startsWith('{')) {
        try {
            const doc = parseSceneDocument(JSON.parse(trimmed));
            const operations: SceneOperation[] = [];
            if (doc.world) operations.push({ op: 'world.update', world: doc.world as any });
            for (const m of doc.materials) operations.push({ op: 'material.define', material: m as MaterialDef });
            for (const n of doc.nodes) operations.push({ op: 'node.add', node: n as SceneNode });
            return { ok: true, errors: [], operations, document: doc, detected: 'json' };
        } catch (e: any) {
            return { ok: false, errors: [`not valid SceneDocument JSON: ${e.message}`], operations: [], document: null, detected: null };
        }
    }

    // Managed module path.
    const result = parseSceneModule(code, createEmptyDocument(), { allowAdds: true });
    if (result.ok && result.operations.length) {
        // Defer parenting: adds arrive in source order, parents may come later.
        const deferred: SceneOperation[] = [];
        for (const op of result.operations) {
            if (op.op === 'node.add') {
                const { parentId, ...rest } = op.node as any;
                (op as any).node = rest;
                if (parentId) deferred.push({ op: 'node.reparent', id: op.node.id, parentId } as SceneOperation);
            }
        }
        const operations = [...result.operations, ...deferred];
        // The module format references materials by id only — synthesize
        // placeholders for any referenced material the module never defines.
        const defined = new Set(
            operations.filter(o => o.op === 'material.define').map(o => (o as any).material.id),
        );
        const placeholders: SceneOperation[] = [];
        for (const op of operations) {
            if (op.op === 'node.add' && op.node.materialId && !defined.has(op.node.materialId)) {
                defined.add(op.node.materialId);
                placeholders.push({
                    op: 'material.define',
                    material: { id: op.node.materialId, name: `Imported ${op.node.materialId}`, props: {} },
                } as SceneOperation);
            }
        }
        return { ok: true, errors: [], operations: [...placeholders, ...operations], document: null, detected: 'module' };
    }
    return {
        ok: false,
        errors: result.errors.length ? result.errors : ['no supported scene declarations found'],
        operations: [], document: null, detected: 'module',
    };
}
