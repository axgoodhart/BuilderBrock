import React from 'react';
import { PhysicsComponent, SceneNode } from './scene/document';

interface PhysicsEditorProps {
    node: SceneNode;
    onCommitOps: (ops: any[], prompt?: string) => void;
}

const BODY_TYPES = ['dynamic', 'fixed', 'kinematic'] as const;
const COLLIDERS = ['box', 'sphere', 'capsule', 'convexHull', 'trimesh'] as const;

/** Per-node physics component editor; edits go through physics.configure. */
const PhysicsEditor: React.FC<PhysicsEditorProps> = ({ node, onCommitOps }) => {
    const pc = node.physics;

    const configure = (patch: Partial<PhysicsComponent> | null) => {
        onCommitOps([{ op: 'physics.configure', id: node.id, physics: patch }],
            patch === null ? `Remove physics from ${node.name}` : `Physics: ${node.name}`);
    };

    if (!pc) {
        return (
            <div className="omneon-physics">
                <button onClick={() => configure({ enabled: true, bodyType: 'dynamic' })}>+ Add physics</button>
            </div>
        );
    }

    const num = (v: string, fallback: number) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    };

    return (
        <div className="omneon-physics">
            <div className="omneon-physics-row">
                <label><input type="checkbox" checked={pc.enabled} onChange={e => configure({ enabled: e.target.checked })} /> enabled</label>
                <select value={pc.bodyType} onChange={e => configure({ bodyType: e.target.value as any })}>
                    {BODY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={pc.collider} onChange={e => configure({ collider: e.target.value as any })}>
                    {COLLIDERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="omneon-flow-del" title="Remove physics" onClick={() => configure(null)}>×</button>
            </div>
            <div className="omneon-physics-grid">
                <label>mass<input type="number" step={0.1} min={0.01} value={pc.mass} onChange={e => configure({ mass: Math.max(0.01, num(e.target.value, pc.mass)) })} /></label>
                <label>friction<input type="number" step={0.05} min={0} value={pc.friction} onChange={e => configure({ friction: Math.max(0, num(e.target.value, pc.friction)) })} /></label>
                <label>bounce<input type="number" step={0.05} min={0} max={1} value={pc.restitution} onChange={e => configure({ restitution: Math.min(1, Math.max(0, num(e.target.value, pc.restitution))) })} /></label>
                <label>gravity<input type="number" step={0.1} value={pc.gravityScale} onChange={e => configure({ gravityScale: num(e.target.value, pc.gravityScale) })} /></label>
            </div>
        </div>
    );
};

export default PhysicsEditor;
