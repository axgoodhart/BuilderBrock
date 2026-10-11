import React, { useMemo, useState } from 'react';
import { AnimationClip, SceneDocument } from './scene/document';

interface TimelinePanelProps {
    document: SceneDocument;
    selection: string[];
    playing: boolean;
    time: number;
    duration: number;
    onPlay: (nodeId?: string, clipId?: string) => void;
    onPause: () => void;
    onSeek: (time: number) => void;
    onCommitOps: (ops: any[], prompt?: string) => void;
}

const PATHS = ['transform.position', 'transform.rotation', 'transform.scale', 'material.opacity', 'visible'] as const;
const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const;

function fmt(t: number) { return t.toFixed(2); }

/**
 * Timeline editor: clip list for the selected node, transport controls,
 * a scrubber, and per-track keyframe lanes. All edits flow through
 * animation.* SceneOperations.
 */
const TimelinePanel: React.FC<TimelinePanelProps> = ({
    document: doc, selection, playing, time, duration, onPlay, onPause, onSeek, onCommitOps,
}) => {
    const node = useMemo(() => doc.nodes.find(n => n.id === selection[0]) || null, [doc, selection]);
    const [clipId, setClipId] = useState<string | null>(null);
    const clip: AnimationClip | null = useMemo(() => {
        if (!node) return null;
        return node.animations.find(c => c.id === clipId) || node.animations[0] || null;
    }, [node, clipId]);
    const [newPath, setNewPath] = useState<string>('transform.position');

    if (!node) {
        return <div className="omneon-timeline omneon-timeline-empty">Select a node to edit its animation timeline.</div>;
    }

    const addClip = () => {
        const id = `clip_${Math.random().toString(36).slice(2, 8)}`;
        onCommitOps([{
            op: 'animation.upsertClip', id: node.id,
            clip: { id, name: `Clip ${node.animations.length + 1}`, duration: 2, loop: 'once', tracks: [] },
        }], `New clip on ${node.name}`);
        setClipId(id);
    };

    const setClipProp = (patch: Partial<AnimationClip>) => {
        if (!clip) return;
        onCommitOps([{ op: 'animation.upsertClip', id: node.id, clip: { ...clip, ...patch } }]);
    };

    /** Record the node's current transform as keyframes at the current time. */
    const keyNow = (path: string) => {
        if (!clip) return;
        const value = path === 'transform.position' ? node.transform.position
            : path === 'transform.rotation' ? node.transform.rotation
            : path === 'transform.scale' ? node.transform.scale
            : path === 'material.opacity' ? (node.materialOverride?.opacity ?? 1)
            : String(node.visible);
        onCommitOps([{ op: 'animation.keyframe', id: node.id, clipId: clip.id, path, time, value, easing: 'linear' }],
            `Key ${path} @ ${fmt(time)}s`);
    };

    const removeKey = (path: string, keyTime: number) => {
        if (!clip) return;
        const tracks = clip.tracks.map(t => t.path === path
            ? { ...t, keyframes: t.keyframes.filter(k => Math.abs(k.time - keyTime) > 1e-6) }
            : t).filter(t => t.keyframes.length > 0);
        onCommitOps([{ op: 'animation.upsertClip', id: node.id, clip: { ...clip, tracks } }], `Remove key @ ${fmt(keyTime)}s`);
    };

    const setKeyEasing = (path: string, keyTime: number, easing: string) => {
        if (!clip) return;
        const tracks = clip.tracks.map(t => t.path === path
            ? { ...t, keyframes: t.keyframes.map(k => Math.abs(k.time - keyTime) < 1e-6 ? { ...k, easing: easing as any } : k) }
            : t);
        onCommitOps([{ op: 'animation.upsertClip', id: node.id, clip: { ...clip, tracks } }]);
    };

    return (
        <div className="omneon-timeline">
            <div className="omneon-timeline-transport">
                <button title="Back to start" onClick={() => onSeek(0)}>⏮</button>
                {playing
                    ? <button title="Pause" onClick={onPause}>⏸</button>
                    : <button title="Play" disabled={!clip} onClick={() => onPlay(node.id, clip?.id)}>▶</button>}
                <span className="omneon-timeline-time">{fmt(time)} / {fmt(duration || clip?.duration || 0)}s</span>
                <input
                    className="omneon-timeline-scrub"
                    type="range" min={0} max={clip?.duration || 1} step={0.01} value={time}
                    onChange={e => onSeek(parseFloat(e.target.value))}
                    disabled={!clip}
                />
                <select
                    value={clip?.id || ''}
                    onChange={e => setClipId(e.target.value)}
                    disabled={node.animations.length === 0}
                >
                    {node.animations.length === 0 && <option value="">no clips</option>}
                    {node.animations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={addClip}>+ Clip</button>
                {clip && (
                    <>
                        <label>dur
                            <input
                                type="number" min={0.1} step={0.5} value={clip.duration}
                                onChange={e => setClipProp({ duration: Math.max(0.1, parseFloat(e.target.value) || 1) })}
                            />
                        </label>
                        <select value={clip.loop} onChange={e => setClipProp({ loop: e.target.value as any })}>
                            <option value="once">once</option>
                            <option value="repeat">repeat</option>
                            <option value="pingpong">pingpong</option>
                        </select>
                    </>
                )}
            </div>

            {clip && (
                <div className="omneon-timeline-tracks">
                    <div className="omneon-timeline-addtrack">
                        <select value={newPath} onChange={e => setNewPath(e.target.value)}>
                            {PATHS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button onClick={() => keyNow(newPath)} title="Record current value at the playhead">◉ Key here</button>
                    </div>
                    {clip.tracks.map(track => (
                        <div key={track.path} className="omneon-timeline-track">
                            <span className="omneon-timeline-track-name">{track.path}</span>
                            <div className="omneon-timeline-keys">
                                {track.keyframes.map(k => (
                                    <span key={k.time} className="omneon-timeline-key" style={{ left: `${(k.time / clip.duration) * 100}%` }}>
                                        <select
                                            value={k.easing}
                                            onChange={e => setKeyEasing(track.path, k.time, e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {EASINGS.map(ez => <option key={ez} value={ez}>{ez}</option>)}
                                        </select>
                                        <span className="omneon-timeline-key-time">{fmt(k.time)}s</span>
                                        <button className="omneon-timeline-key-del" onClick={() => removeKey(track.path, k.time)}>×</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {clip.tracks.length === 0 && (
                        <div className="omneon-inspector-empty">No tracks yet — pick a property and press ◉ Key here.</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TimelinePanel;
