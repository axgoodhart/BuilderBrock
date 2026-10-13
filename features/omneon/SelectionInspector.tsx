import React from 'react';
import { MaterialPropsSchema, SceneDocument, SceneNode } from './scene/document';
import PropertyField from './PropertyField';
import PhysicsEditor from './PhysicsEditor';

export default function SelectionInspector({ node, document, disabled, onCommitOps }: {
    node: SceneNode; document: SceneDocument; disabled: boolean; onCommitOps: (ops: any[], prompt?: string) => void;
}) {
    const commit = (op: any) => onCommitOps([{ ...op, id: node.id }], `Edit ${node.name}`);
    const material = { ...MaterialPropsSchema.parse({}), ...document.materials.find(m => m.id === node.materialId)?.props, ...node.materialOverride };
    const materialChange = (patch: object) => commit({ op: 'material.setOverride', props: { ...material, ...patch } });
    return <section className="omneon-inspector-card">
        <div className="omneon-inspector-name">{node.name}</div>
        <div className="omneon-inspector-id">{node.kind} · {node.id}</div>
        <div className="omneon-property-toggles">
            <label><input type="checkbox" checked={node.visible} disabled={node.locked || disabled} onChange={e => commit({ op: 'node.setVisible', visible: e.target.checked })} /> Visible</label>
            <label><input type="checkbox" checked={node.locked} disabled={disabled} onChange={e => commit({ op: 'node.setLocked', locked: e.target.checked })} /> Locked</label>
        </div>
        {node.locked && <p className="omneon-help">Unlock to edit this object.</p>}
        <fieldset disabled={node.locked || disabled} className="omneon-property-section">
            <PropertyField label="Name" type="text" value={node.name} onCommit={name => commit({ op: 'node.rename', name })} />
            {(['position', 'rotation', 'scale'] as const).map(property => <div key={property} className="omneon-transform-field">
                <h4>{property === 'rotation' ? 'Rotation (°)' : property === 'position' ? 'Position' : 'Scale'}</h4>
                <div className="omneon-vector-fields">
                    {(['x', 'y', 'z'] as const).map(axis => <PropertyField key={axis} label={axis.toUpperCase()}
                        value={Number((node.transform[property][axis] * (property === 'rotation' ? 180 / Math.PI : 1)).toFixed(5))}
                        step={property === 'rotation' ? 1 : 0.1}
                        onCommit={value => commit({ op: 'node.transform', [property]: { [axis]: property === 'rotation' ? value * Math.PI / 180 : value } })} />)}
                </div>
            </div>)}
            {node.kind === 'mesh' && <>
                <h4>Material</h4>
                <label className="omneon-property-field"><span>Library material</span>
                    <select value={node.materialId || ''} onChange={e => onCommitOps([
                        { op: 'material.assign', id: node.id, materialId: e.target.value || null },
                        { op: 'material.setOverride', id: node.id, props: null },
                    ], `Assign material to ${node.name}`)}>
                        <option value="">Default</option>
                        {document.materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                </label>
                <PropertyField label="Color (CSS)" type="text" validate={value => CSS.supports('color', value) ? null : 'Enter a CSS color, such as #88aaff.'} value={material.color} onCommit={color => materialChange({ color })} />
                <div className="omneon-vector-fields">
                    {(['opacity', 'roughness', 'metalness'] as const).map(property => <PropertyField key={property} label={property}
                        value={material[property]} min={0} max={1} step={0.05}
                        onCommit={value => materialChange({ [property]: value, ...(property === 'opacity' ? { transparent: value < 1 } : {}) })} />)}
                </div>
                <label><input type="checkbox" checked={material.wireframe} onChange={e => materialChange({ wireframe: e.target.checked })} /> Wireframe</label>
                {node.materialOverride && <button onClick={() => commit({ op: 'material.setOverride', props: null })}>Reset material overrides</button>}
                {node.geometry && node.geometry.type !== 'model' && <>
                    <h4>Shape · {node.geometry.type}</h4>
                    <div className="omneon-geometry-fields">{Object.entries(node.geometry).filter(([key, value]) => typeof value === 'number' && !key.toLowerCase().includes('segments')).map(([key, value]) =>
                        <PropertyField key={key} label={key} value={value as number} min={0.001} step={0.1}
                            onCommit={next => commit({ op: 'node.setGeometry', geometry: { ...node.geometry, [key]: next } })} />)}</div>
                </>}
                <h4>Physics</h4>
                <PhysicsEditor node={node} onCommitOps={onCommitOps} />
            </>}
            {node.kind === 'light' && node.light && <>
                <h4>Light</h4>
                <PropertyField label="Color (CSS)" type="text" validate={value => CSS.supports('color', value) ? null : 'Enter a CSS color, such as #88aaff.'} value={node.light.color} onCommit={color => commit({ op: 'node.setLight', light: { color } })} />
                <PropertyField label="Intensity" value={node.light.intensity} min={0} step={0.1} onCommit={intensity => commit({ op: 'node.setLight', light: { intensity } })} />
                <label><input type="checkbox" checked={node.light.castShadow} onChange={e => commit({ op: 'node.setLight', light: { castShadow: e.target.checked } })} /> Cast shadows</label>
            </>}
            {node.kind === 'camera' && node.camera && <>
                <h4>Camera</h4>
                <PropertyField label="Field of view (°)" value={node.camera.fov} min={1} max={179} onCommit={fov => commit({ op: 'node.setCamera', camera: { fov } })} />
                <button disabled={document.activeCameraId === node.id} onClick={() => commit({ op: 'camera.setActive' })}>{document.activeCameraId === node.id ? 'Active camera' : 'Use this camera'}</button>
            </>}
        </fieldset>
    </section>;
}
