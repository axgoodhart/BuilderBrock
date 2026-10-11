import React, { useMemo, useState } from 'react';
import { Interaction, SceneDocument } from './scene/document';

interface FlowPanelProps {
    document: SceneDocument;
    selection: string[];
    onCommitOps: (ops: any[], prompt?: string) => void;
}

const TRIGGERS = ['click', 'hover', 'timer', 'key', 'pointer', 'collision', 'custom'] as const;
const ACTIONS = ['playClip', 'setProperty', 'toggleVisibility', 'changeMaterial', 'switchCamera', 'applyImpulse', 'emitEvent'] as const;

const TRIGGER_ICON: Record<string, string> = {
    click: '👆', hover: '✋', timer: '⏱', key: '⌨', pointer: '⇖', collision: '💥', custom: '⚡',
};

/** Default params form fields per action type. */
function defaultParams(action: string): Record<string, unknown> {
    switch (action) {
        case 'playClip': return { clipId: '' };
        case 'setProperty': return { path: 'visible', value: 'true' };
        case 'toggleVisibility': return {};
        case 'changeMaterial': return { props: { color: '#ff8800' } };
        case 'switchCamera': return { cameraNodeId: '' };
        case 'applyImpulse': return { impulse: { x: 0, y: 5, z: 0 } };
        case 'emitEvent': return { event: 'ping' };
        default: return {};
    }
}

function defaultTriggerParams(trigger: string): Record<string, unknown> {
    if (trigger === 'timer') return { every: 2 };
    if (trigger === 'key') return { key: ' ' };
    return {};
}

/**
 * Interaction flowchart panel: a scene-wide flow list (trigger → action per node)
 * plus an editor for the selected node. Edits flow through interaction.* ops;
 * behaviors execute live in the runtime.
 */
const FlowPanel: React.FC<FlowPanelProps> = ({ document: doc, selection, onCommitOps }) => {
    const selected = useMemo(() => doc.nodes.find(n => n.id === selection[0]) || null, [doc, selection]);
    const [trigger, setTrigger] = useState<string>('click');
    const [action, setAction] = useState<string>('toggleVisibility');

    const wiredNodes = doc.nodes.filter(n => n.interactions.length > 0);

    const addInteraction = () => {
        if (!selected) return;
        const ix: Interaction = {
            id: `ix_${Math.random().toString(36).slice(2, 8)}`,
            trigger: trigger as Interaction['trigger'],
            triggerParams: defaultTriggerParams(trigger),
            action: action as Interaction['action'],
            actionParams: defaultParams(action),
        };
        onCommitOps([{ op: 'interaction.connect', id: selected.id, interaction: ix }],
            `When ${trigger} ${selected.name} → ${action}`);
    };

    const removeInteraction = (nodeId: string, interactionId: string) => {
        onCommitOps([{ op: 'interaction.disconnect', id: nodeId, interactionId }]);
    };

    const patchInteraction = (nodeId: string, ix: Interaction, patch: Partial<Interaction>) => {
        onCommitOps([{ op: 'interaction.connect', id: nodeId, interaction: { ...ix, ...patch } }]);
    };

    return (
        <div className="omneon-flow">
            <div className="omneon-inspector-title">Interactions</div>

            {/* Editor for the selected node */}
            {selected ? (
                <div className="omneon-flow-editor">
                    <div className="omneon-flow-editor-title">Add to “{selected.name}”</div>
                    <div className="omneon-flow-editor-row">
                        <span>When</span>
                        <select value={trigger} onChange={e => setTrigger(e.target.value)}>
                            {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span>→</span>
                        <select value={action} onChange={e => setAction(e.target.value)}>
                            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <button onClick={addInteraction}>+ Add</button>
                    </div>
                </div>
            ) : (
                <div className="omneon-inspector-empty">Select a node to attach an interaction.</div>
            )}

            {/* Scene-wide flow list */}
            {wiredNodes.length === 0 && (
                <div className="omneon-inspector-empty">
                    No interactions yet. Example: select a box, “When click → toggleVisibility”, then click it in the viewport.
                </div>
            )}
            {wiredNodes.map(node => (
                <div key={node.id} className="omneon-flow-node">
                    <div className="omneon-flow-node-name">{node.name}</div>
                    {node.interactions.map(ix => (
                        <div key={ix.id} className="omneon-flow-edge">
                            <span className="omneon-flow-trigger">
                                {TRIGGER_ICON[ix.trigger] || '⚡'} {ix.trigger}
                                {ix.trigger === 'timer' && <em> every {String(ix.triggerParams?.every ?? 1)}s</em>}
                                {ix.trigger === 'key' && <em> [{String(ix.triggerParams?.key ?? '?')}]</em>}
                            </span>
                            <span className="omneon-flow-arrow">→</span>
                            <span className="omneon-flow-action">
                                {ix.action}
                                {ix.action === 'playClip' && (
                                    <select
                                        value={String(ix.actionParams?.clipId || '')}
                                        onChange={e => patchInteraction(node.id, ix, { actionParams: { ...ix.actionParams, clipId: e.target.value } })}
                                    >
                                        <option value="">first clip</option>
                                        {node.animations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                )}
                                {ix.action === 'changeMaterial' && (
                                    <input
                                        type="color"
                                        value={String((ix.actionParams?.props as any)?.color || '#ff8800')}
                                        onChange={e => patchInteraction(node.id, ix, { actionParams: { props: { color: e.target.value } } })}
                                    />
                                )}
                                {ix.action === 'emitEvent' && (
                                    <input
                                        className="omneon-flow-mini"
                                        value={String(ix.actionParams?.event || '')}
                                        onChange={e => patchInteraction(node.id, ix, { actionParams: { event: e.target.value } })}
                                    />
                                )}
                            </span>
                            <button className="omneon-flow-del" onClick={() => removeInteraction(node.id, ix.id)}>×</button>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

export default FlowPanel;
