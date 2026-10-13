import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimationClip, SceneDocument } from './scene/document';
import PropertyField from './PropertyField';

interface TimelinePanelProps {
    document: SceneDocument;
    selection: string[];
    playing: boolean;
    time: number;
    duration: number;
    disabled?: boolean;
    onPlay: (nodeId?: string, clipId?: string) => void;
    onPause: () => void;
    onSeek: (time: number, nodeId?: string, clipId?: string) => void;
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
    document: doc, selection, playing, time, duration, disabled = false, onPlay, onPause, onSeek, onCommitOps,
}) => {
    const node = useMemo(() => doc.nodes.find(n => n.id === selection[0]) || null, [doc, selection]);
    const [clipId, setClipId] = useState<string | null>(null);
    const clip: AnimationClip | null = useMemo(() => {
        if (!node) return null;
        return node.animations.find(c => c.id === clipId) || node.animations[0] || null;
    }, [node, clipId]);
    const [newPath, setNewPath] = useState<string>('transform.position');
    const [snap, setSnap] = useState(true);
    const [snapStep, setSnapStep] = useState(0.1);
    const [selectedKey, setSelectedKey] = useState<{ path: string; time: number } | null>(null);
    const [dragTime, setDragTime] = useState<number | null>(null);
    const [error, setError] = useState('');
    const drag = useRef<{ path: string; from: number; to: number; left: number; width: number } | null>(null);
    useEffect(() => { setSelectedKey(null); setError(''); setDragTime(null); drag.current = null; onPause(); onSeek(0, node?.id, clip?.id); }, [node?.id, clip?.id]);
    const boundedTime = (value: number, bypass = false) => Number(Math.max(0, Math.min(clip?.duration || 0,
        snap && !bypass ? Math.round(value / snapStep) * snapStep : value)).toFixed(5));
    const key = selectedKey && clip?.tracks.find(t => t.path === selectedKey.path)?.keyframes.find(k => k.time === selectedKey.time);
    const seek = (value: number) => { onPause(); onSeek(value, node?.id, clip?.id); };
    const moveKey = (path: string, fromTime: number, requested: number) => {
        if (!clip || !node || node.locked || disabled) return;
        const toTime = Number(Math.max(0, Math.min(clip.duration, requested)).toFixed(5));
        if (clip.tracks.find(t => t.path === path)?.keyframes.some(k => k.time !== fromTime && Math.abs(k.time - toTime) < 1e-6)) {
            setError('There is already a key here. Choose a different time.'); return;
        }
        setError('');
        if (toTime === fromTime) return;
        setSelectedKey({ path, time: toTime });
        onCommitOps([{ op: 'animation.setKeyTime', id: node.id, clipId: clip.id, path, fromTime, toTime }], `Move key to ${fmt(toTime)}s`);
        seek(toTime);
    };
    const editValue = (value: any) => {
        if (!clip || !node || !selectedKey || !key) return;
        onCommitOps([{ op: 'animation.keyframe', id: node.id, clipId: clip.id, path: selectedKey.path, time: key.time, value, easing: key.easing }], `Edit key at ${fmt(key.time)}s`);
    };

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
        const keyTime = boundedTime(time);
        if (clip.tracks.find(t => t.path === path)?.keyframes.some(k => Math.abs(k.time - keyTime) < 1e-6) && !window.confirm('Replace the keyframe at this time?')) return;
        const value = path === 'transform.position' ? node.transform.position
            : path === 'transform.rotation' ? node.transform.rotation
            : path === 'transform.scale' ? node.transform.scale
            : path === 'material.opacity' ? (node.materialOverride?.opacity ?? doc.materials.find(m => m.id === node.materialId)?.props.opacity ?? 1)
            : String(node.visible);
        onCommitOps([{ op: 'animation.keyframe', id: node.id, clipId: clip.id, path, time: keyTime, value, easing: 'linear' }],
            `Key ${path} @ ${fmt(keyTime)}s`);
    };

    const removeKey = (path: string, keyTime: number) => {
        if (!clip) return;
        if (!window.confirm('Delete this keyframe?')) return;
        setSelectedKey(null);
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
                <button title="Back to start" onClick={() => seek(0)}>Start</button>
                {playing
                    ? <button title="Pause" onClick={onPause}>Pause</button>
                    : <button title="Play" disabled={!clip} onClick={() => onPlay(node.id, clip?.id)}>Play</button>}
                <span className="omneon-timeline-time">{fmt(time)} / {fmt(clip?.duration || duration || 0)}s</span>
                <input
                    className="omneon-timeline-scrub"
                    aria-label="Playhead time" type="range" min={0} max={clip?.duration || 1} step={snap ? snapStep : 0.01} value={Math.min(time, clip?.duration || 1)}
                    onChange={e => seek(boundedTime(Number(e.target.value)))}
                    disabled={!clip}
                />
                <select
                    aria-label="Animation clip" value={clip?.id || ''}
                    onChange={e => { onPause(); setClipId(e.target.value); onSeek(0, node.id, e.target.value); }}
                    disabled={node.animations.length === 0}
                >
                    {node.animations.length === 0 && <option value="">no clips</option>}
                    {node.animations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button disabled={node.locked || disabled} onClick={addClip}>+ Clip</button>
                {clip && (
                    <>
                        <PropertyField label="Duration (s)" value={clip.duration} min={Math.max(0.1, ...clip.tracks.flatMap(t => t.keyframes.map(k => k.time)))} step={0.1} disabled={node.locked || disabled} onCommit={duration => setClipProp({ duration })} />
                        <select aria-label="Loop mode" disabled={node.locked || disabled} value={clip.loop} onChange={e => setClipProp({ loop: e.target.value as any })}>
                            <option value="once">once</option>
                            <option value="repeat">repeat</option>
                            <option value="pingpong">pingpong</option>
                        </select>
                    </>
                )}
            </div>

            {clip && (
                <div className="omneon-timeline-tracks">
                    {node.locked && <p className="omneon-help">Unlock {node.name} to edit keyframes.</p>}
                    <div className="omneon-timeline-options">
                        <PropertyField label="Clip name" type="text" value={clip.name} disabled={node.locked || disabled} onCommit={name => setClipProp({ name })} />
                        <label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap</label>
                        <select aria-label="Snap interval" value={snapStep} disabled={!snap} onChange={e => setSnapStep(Number(e.target.value))}>
                            <option value={0.01}>0.01s</option><option value={1 / 30}>1/30s</option><option value={0.1}>0.1s</option><option value={0.5}>0.5s</option><option value={1}>1s</option>
                        </select>
                    </div>
                    <div className="omneon-timeline-addtrack">
                        <select aria-label="Property to keyframe" value={newPath} onChange={e => setNewPath(e.target.value)}>
                            {PATHS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button disabled={node.locked || disabled} onClick={() => keyNow(newPath)} title="Record current value at the playhead">Key at playhead</button>
                    </div>
                    <div className="omneon-timeline-lanes">
                        <div className="omneon-timeline-track">
                            <span className="omneon-timeline-track-name">Time (seconds)</span>
                            <div className="omneon-time-ruler" onPointerDown={e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                seek(boundedTime((e.clientX - rect.left) / rect.width * clip.duration, e.shiftKey));
                            }}>
                                {Array.from({ length: 9 }, (_, i) => <span key={i} style={{ left: `${i * 12.5}%` }}>{Number((clip.duration * i / 8).toFixed(2))}</span>)}
                            </div>
                        </div>
                        {clip.tracks.map(track => (
                            <div key={track.path} className="omneon-timeline-track">
                                <span className="omneon-timeline-track-name">{track.path.replace('transform.', '')}</span>
                                <div className="omneon-timeline-keys" onPointerDown={e => {
                                    if (e.target !== e.currentTarget) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    seek(boundedTime((e.clientX - rect.left) / rect.width * clip.duration, e.shiftKey));
                                }}>
                                    <span className="omneon-playhead" style={{ left: `${Math.min(time / clip.duration, 1) * 100}%` }} />
                                    {track.keyframes.map(k => <button key={k.time}
                                        className={`omneon-key-marker ${selectedKey?.path === track.path && selectedKey.time === k.time ? 'selected' : ''}`}
                                        style={{ left: `${((drag.current?.path === track.path && drag.current.from === k.time && dragTime !== null ? dragTime : k.time) / clip.duration) * 100}%` }}
                                        aria-label={`${track.path} key at ${fmt(k.time)} seconds`}
                                        aria-pressed={selectedKey?.path === track.path && selectedKey.time === k.time}
                                        title={`${fmt(k.time)}s · Drag to move; arrow keys nudge`}
                                        onClick={e => { if (e.detail === 0) { setSelectedKey({ path: track.path, time: k.time }); seek(k.time); } }}
                                        onKeyDown={e => {
                                            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                                            e.preventDefault();
                                            moveKey(track.path, k.time, k.time + (e.key === 'ArrowRight' ? 1 : -1) * (snap ? snapStep : 0.01));
                                        }}
                                        onPointerDown={e => {
                                            e.stopPropagation();
                                            if (e.button !== 0) return;
                                            setSelectedKey({ path: track.path, time: k.time }); seek(k.time);
                                            if (node.locked || disabled) return;
                                            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                                            drag.current = { path: track.path, from: k.time, to: k.time, left: rect.left, width: rect.width };
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                        }}
                                        onPointerMove={e => {
                                            if (!drag.current) return;
                                            drag.current.to = boundedTime((e.clientX - drag.current.left) / drag.current.width * clip.duration, e.shiftKey);
                                            setDragTime(drag.current.to);
                                        }}
                                        onPointerUp={e => {
                                            const current = drag.current;
                                            drag.current = null; setDragTime(null);
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                                            if (current) moveKey(current.path, current.from, current.to);
                                        }}
                                        onPointerCancel={() => { drag.current = null; setDragTime(null); }}
                                        onLostPointerCapture={() => { drag.current = null; setDragTime(null); }}
                                    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 15 8 8 15 1 8Z" /></svg></button>)}
                                </div>
                            </div>
                        ))}
                    </div>
                    {key && selectedKey && <fieldset disabled={node.locked || disabled} className="omneon-key-editor">
                        <legend>{selectedKey.path.replace('transform.', '')} key</legend>
                        <PropertyField key={`time-${selectedKey.time}`} label="Time (s)" value={key.time} min={0} max={clip.duration} step={snap ? snapStep : 0.01} onCommit={value => moveKey(selectedKey.path, key.time, boundedTime(value))} />
                        {typeof key.value === 'object' ? (['x', 'y', 'z'] as const).map(axis => <PropertyField key={axis} label={`${axis.toUpperCase()}${selectedKey.path === 'transform.rotation' ? ' (°)' : ''}`}
                            value={Number((key.value[axis] * (selectedKey.path === 'transform.rotation' ? 180 / Math.PI : 1)).toFixed(5))} step={0.1}
                            onCommit={value => editValue({ ...(key.value as object), [axis]: selectedKey.path === 'transform.rotation' ? value * Math.PI / 180 : value })} />)
                            : selectedKey.path === 'visible' ? <label>Visible<select value={String(key.value)} onChange={e => editValue(e.target.value)}><option value="true">Yes</option><option value="false">No</option></select></label>
                            : <PropertyField label="Value" type={typeof key.value === 'number' ? 'number' : 'text'} value={key.value} min={selectedKey.path === 'material.opacity' ? 0 : undefined} max={selectedKey.path === 'material.opacity' ? 1 : undefined} onCommit={editValue} />}
                        <label>Easing<select value={key.easing} onChange={e => setKeyEasing(selectedKey.path, key.time, e.target.value)}>{EASINGS.map(easing => <option key={easing} value={easing}>{easing}</option>)}</select></label>
                        <button onClick={() => removeKey(selectedKey.path, key.time)}>Delete key</button>
                    </fieldset>}
                    {error && <p role="alert" className="omneon-field-error">{error}</p>}
                    <p className="omneon-help">Drag keys or use arrow keys to move them. Hold Shift while dragging to ignore snapping.</p>
                    {clip.tracks.length === 0 && (
                        <div className="omneon-inspector-empty">No tracks yet — pick a property and press Key at playhead.</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TimelinePanel;
