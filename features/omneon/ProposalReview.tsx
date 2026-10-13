import React, { useMemo, useState } from 'react';
import { SceneDocument } from './scene/document';
import { applySceneOperations } from './scene/apply';
import ScenePreview from './ScenePreview';

function differences(before: any, after: any, path = ''): { path: string; before: unknown; after: unknown }[] {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
        return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => differences(before[key], after[key], path ? `${path}.${key}` : key));
    }
    return [{ path, before, after }];
}
function format(value: unknown) {
    if (value === undefined) return '—';
    if (typeof value === 'number') return String(Number(value.toFixed(4)));
    return typeof value === 'string' ? value : JSON.stringify(value);
}

export default function ProposalReview({ document, operations, busy, open, onToggle, onApply, onBranch, onRevise, onDiscard }: {
    document: SceneDocument; operations: string; busy: boolean; open: boolean; onToggle: () => void;
    onApply: () => void; onBranch: () => void; onRevise: () => void; onDiscard: () => void;
}) {
    const [reviewed, setReviewed] = useState<SceneDocument | null>(null);
    const result = useMemo(() => {
        try { return applySceneOperations(document, JSON.parse(operations)); }
        catch { return { ok: false, document, errors: ['This proposal could not be read. Ask for a revised proposal.'] }; }
    }, [document, operations]);
    const changedNodes = useMemo(() => {
        const after = result.document;
        return [...new Set([...document.nodes.map(n => n.id), ...after.nodes.map(n => n.id)])].flatMap(id => {
            const beforeNode = document.nodes.find(n => n.id === id);
            const afterNode = after.nodes.find(n => n.id === id);
            const changes = differences(beforeNode, afterNode);
            const materialChanged = afterNode?.materialId && JSON.stringify(document.materials.find(m => m.id === afterNode.materialId)) !== JSON.stringify(after.materials.find(m => m.id === afterNode.materialId));
            let ancestor = afterNode?.parentId;
            let parentChanged = false;
            const visited = new Set<string>();
            while (ancestor && !visited.has(ancestor)) {
                visited.add(ancestor);
                const oldParent = document.nodes.find(n => n.id === ancestor);
                const newParent = after.nodes.find(n => n.id === ancestor);
                if (JSON.stringify(oldParent?.transform) !== JSON.stringify(newParent?.transform) || oldParent?.visible !== newParent?.visible || oldParent?.parentId !== newParent?.parentId) parentChanged = true;
                ancestor = newParent?.parentId;
            }
            return changes.length || materialChanged || parentChanged ? [{ id, name: afterNode?.name || beforeNode!.name, kind: !beforeNode ? 'Added' : !afterNode ? 'Removed' : 'Changed', changes, materialChanged, parentChanged }] : [];
        });
    }, [document, result]);
    const worldChanges = differences(document.world, result.document.world);
    const libraryChanges = differences(document.materials, result.document.materials, 'Materials');
    const cameraChanges = differences(document.activeCameraId, result.document.activeCameraId, 'Active camera');
    const ready = open && reviewed === document && result.ok;
    return <div className="omneon-proposal-review">
        <div className="omneon-proposal-summary">
            {changedNodes.map(node => <span key={node.id}>{node.kind}: {node.name}</span>)}
            {!!worldChanges.length && <span>World settings</span>}
            {!!libraryChanges.length && <span>Material library</span>}
            {!!cameraChanges.length && <span>Active camera</span>}
            {!changedNodes.length && !worldChanges.length && !libraryChanges.length && !cameraChanges.length && result.ok && <span>No scene changes</span>}
        </div>
        {!result.ok && <p role="alert" className="omneon-field-error">{result.errors.join(' ')}</p>}
        <button aria-expanded={open} disabled={!result.ok} onClick={() => { onToggle(); if (!open) setReviewed(document); }}>{open ? 'Hide preview' : 'Review before / after'}</button>
        {open && result.ok && <>
            <div className="omneon-proposal-previews"><ScenePreview document={document} label="Before" /><ScenePreview document={result.document} label="After applying" /></div>
            <p className="omneon-help">Static scene preview. Animation, physics, and script changes are listed below.</p>
            <div className="omneon-proposal-diff">
                {changedNodes.map(node => <details key={node.id}>
                    <summary>{node.kind} · {node.name}</summary>
                    {node.materialChanged && <p>Uses an updated library material.</p>}
                    {node.parentChanged && <p>A parent object's transform, visibility, or grouping changes.</p>}
                    {node.changes.map(change => <div className="omneon-diff-row" key={change.path}><strong>{change.path || 'Object'}</strong><del>{format(change.before)}</del><ins>{format(change.after)}</ins></div>)}
                </details>)}
                {[...worldChanges, ...libraryChanges, ...cameraChanges].map(change => <div className="omneon-diff-row" key={change.path}><strong>{change.path}</strong><del>{format(change.before)}</del><ins>{format(change.after)}</ins></div>)}
            </div>
            {reviewed !== document && <p role="status">The scene changed. <button onClick={() => setReviewed(document)}>Review updated preview</button></p>}
        </>}
        <div className="omneon-msg-actions">
            <button className="omneon-primary" onClick={onApply} disabled={busy || !ready}>Apply</button>
            <button onClick={onRevise} disabled={busy}>Revise</button>
            <button onClick={onBranch} disabled={busy || !ready}>Try on New Branch</button>
            <button onClick={onDiscard} disabled={busy}>Discard</button>
        </div>
    </div>;
}
