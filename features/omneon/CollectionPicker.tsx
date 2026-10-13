import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SceneDocument, parseSceneDocument } from './scene/document';
import { applySceneOperations } from './scene/apply';
import { MATERIAL_COLLECTIONS, WORLD_COLLECTIONS, materialCollectionOps, worldCollectionOps } from './templates';
import ScenePreview from './ScenePreview';

export default function CollectionPicker({ kind, document, error, onApply, onClose }: {
    kind: 'materials' | 'worlds'; document: SceneDocument; error: string | null; onApply: (ops: any[], name: string) => Promise<unknown>; onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const collections = kind === 'materials' ? MATERIAL_COLLECTIONS : WORLD_COLLECTIONS;
    const [id, setId] = useState(collections[0].id);
    const [saving, setSaving] = useState(false);
    const collection = collections.find(c => c.id === id)!;
    const materialCollection = MATERIAL_COLLECTIONS.find(c => c.id === id);
    const ops = useMemo(() => kind === 'materials'
        ? materialCollectionOps(id).filter(op => !document.materials.some(m => m.id === op.material.id))
        : worldCollectionOps(id), [kind, id, document]);
    const preview = useMemo(() => {
        if (kind === 'worlds') return applySceneOperations(document, ops).document;
        return parseSceneDocument({ version: 1, materials: materialCollection!.materials,
            world: { backgroundColor: '#171923', ground: { enabled: true, size: 16 }, cameraDefault: { position: { x: 3, y: 2.5, z: 6 }, target: { x: 0, y: 0.7, z: 0 } } },
            nodes: [
                ...materialCollection!.materials.map((m, index) => ({ id: `sample_${index}`, name: m.name, kind: 'mesh', geometry: { type: 'sphere', radius: 0.6 }, materialId: m.id, transform: { position: { x: (index - 1) * 1.6, y: 0.7, z: 0 } } })),
                { id: 'sample_light', name: 'Studio light', kind: 'light', light: { type: 'directional', intensity: 3 }, transform: { position: { x: 2, y: 4, z: 3 } } },
            ],
        });
    }, [kind, document, ops, materialCollection]);
    useEffect(() => { dialog.current?.showModal(); }, []);
    return <dialog ref={dialog} className="omneon-collection-dialog" aria-labelledby="omneon-collection-title" onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}>
        <div className="omneon-panel-heading"><h3 id="omneon-collection-title">{kind === 'materials' ? 'Material collections' : 'World collections'}</h3><button disabled={saving} onClick={onClose}>Close</button></div>
        <div className="omneon-collection-options" role="group" aria-label="Collection">
            {collections.map(c => <button key={c.id} aria-pressed={id === c.id} className={id === c.id ? 'omneon-active' : ''} disabled={saving} onClick={() => setId(c.id)}>{c.name}</button>)}
        </div>
        <ScenePreview document={preview} label={`${collection.name} preview`} />
        <p>{collection.description}</p>
        {materialCollection && <p className="omneon-help">{materialCollection.materials.map(m => m.name).join(' · ')}<br />Adds materials to the library. Assign them to an object in the inspector.</p>}
        {kind === 'worlds' && <p className="omneon-help">Previewed on your scene. Applying changes the background, ground, fog, and exposure.</p>}
        {error && <p role="alert" className="omneon-field-error">{error}</p>}
        <div className="omneon-dialog-actions"><button disabled={saving} onClick={onClose}>Cancel</button><button className="omneon-primary" disabled={saving || !ops.length} onClick={async () => {
            setSaving(true);
            try { if (await onApply(ops, collection.name)) onClose(); } finally { setSaving(false); }
        }}>{saving ? 'Applying…' : !ops.length ? 'Already in library' : kind === 'materials' ? 'Add to library' : 'Apply world'}</button></div>
    </dialog>;
}
