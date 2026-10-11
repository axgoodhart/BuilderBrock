import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './sprites.css';
import { DownloadIcon, EditIcon, GridIcon, RefreshIcon, SparklesIcon, UploadIcon } from '../../components/Icons';
import { DragNumberField, FieldDropdown, PillButton, RangeSlider, SectionLabel, SegmentedToggle } from './controls';
import FrameEditor from './FrameEditor';
import { ANIMATIONS, BACKDROPS, Backdrop, FRAME_DELAY_MS, exportGif, exportSheet, readImageFile, storeFrame } from './engine';
import { renderTemplate } from '../../lib/promptStore';
import { SpriteSettings, generate, newAnim, patchAnim, setError, setSpriteSaver, updateDoc, useSpriteSession } from './store';

type PreviewBg = 'checker' | 'black' | 'white';

interface SpriteStudioProps {
    artifact: { id: string; html: string };
    apiKey: string;
    promptTemplate: string;
    promptOverridden: boolean;
    onUpdatePrompt: (value: string) => void;
    onResetPrompt: () => void;
    onPatchArtifact: (id: string, patch: Record<string, any>) => void;
}

const PLACEHOLDERS = ['animation', 'frame', 'total', 'backdrop'];

const SpriteStudio: React.FC<SpriteStudioProps> = ({ artifact, apiKey, promptTemplate, promptOverridden, onUpdatePrompt, onResetPrompt, onPatchArtifact }) => {
    const id = artifact.id;
    const { doc, generating, modelProgress, error } = useSpriteSession(id, artifact.html);
    const { settings, animations } = doc;
    const [previewBg, setPreviewBg] = useState<PreviewBg>('checker');
    const [cursors, setCursors] = useState<Record<string, number>>({});
    const [editing, setEditing] = useState<{ animId: string; frameIdx: number; src: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setSpriteSaver(onPatchArtifact); }, [onPatchArtifact]);

    useEffect(() => {
        const timer = setInterval(() => setCursors(prev => {
            const next: Record<string, number> = {};
            for (const a of animations) next[a.id] = (prev[a.id] ?? -1) + 1;
            return next;
        }), FRAME_DELAY_MS);
        return () => clearInterval(timer);
    }, [animations]);

    const frameIdx = (animId: string, len: number) => len ? (cursors[animId] ?? 0) % len : 0;
    const setSettings = (patch: Partial<SpriteSettings>) => updateDoc(id, d => ({ ...d, settings: { ...d.settings, ...patch } }));

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const source = await storeFrame(await readImageFile(file));
            updateDoc(id, d => ({ ...d, source }));
        } catch { setError(id, 'Failed to load character reference.'); }
    };

    const toggleAnimation = (name: string) => {
        const existing = animations.find(a => a.name === name);
        if (existing && existing.frames.length > 1 && !window.confirm(`Remove "${name}" and its generated frames?`)) return;
        updateDoc(id, d => ({ ...d, animations: existing ? d.animations.filter(a => a !== existing) : [...d.animations, newAnim(name)] }));
    };

    const saveEditedFrame = async (base64: string) => {
        if (!editing) return;
        const { animId, frameIdx: idx } = editing;
        setEditing(null);
        try {
            const url = await storeFrame({ base64, mimeType: 'image/png' });
            patchAnim(id, animId, a => ({ frames: a.frames.map((f, i) => i === idx ? url : f) }));
        } catch { setError(id, 'Saving the edited frame failed.'); }
    };

    const runExport = (task: () => Promise<void>, label: string) => task().catch(err => { console.error(err); setError(id, `${label} failed.`); });
    const hasFrames = animations.some(a => a.frames.length > 0);
    const examplePrompt = renderTemplate(promptTemplate, {
        animation: animations[0]?.name ?? ANIMATIONS[0], frame: '2', total: String(settings.frameCount + 2), backdrop: BACKDROPS[settings.backdrop],
    });

    return (
        <div className="sprite-studio">
            <div className="ss-layout">
            <aside className="ss-sidebar">
                <div className="ss-sidebar-scroll">
                    <section className="ss-section">
                        <SectionLabel>Character Input</SectionLabel>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
                        <button type="button" className={`ss-source checker ${doc.source ? 'has-image' : ''}`} disabled={generating} onClick={() => fileRef.current?.click()}>
                            {doc.source ? (
                                <>
                                    <img src={doc.source} alt="Character reference" className="pixelated" />
                                    <span className="ss-source-swap"><RefreshIcon /></span>
                                </>
                            ) : (
                                <span className="ss-source-empty"><UploadIcon /> Load Character</span>
                            )}
                        </button>
                    </section>

                    <section className="ss-section">
                        <SectionLabel>Cycle Geometry</SectionLabel>
                        <DragNumberField label="Loop Frames" value={settings.frameCount} min={2} max={12} onChange={frameCount => setSettings({ frameCount })} suffix=" in-betweens" />
                        <FieldDropdown label="Generation Backdrop" value={settings.backdrop} options={Object.keys(BACKDROPS)} onChange={v => setSettings({ backdrop: v as Backdrop })} />
                    </section>

                    <section className="ss-section">
                        <SectionLabel>Frame Prompt</SectionLabel>
                        <textarea className="ss-prompt" value={promptTemplate} rows={5} spellCheck={false}
                            onChange={e => onUpdatePrompt(e.target.value)} aria-label="Frame prompt template" />
                        <div className="ss-prompt-meta">
                            <span>{PLACEHOLDERS.map(p => `{${p}}`).join(' ')}</span>
                            {promptOverridden && <button type="button" className="ss-link" onClick={onResetPrompt}>Reset</button>}
                        </div>
                        <p className="ss-hint"><strong>Sends:</strong> {examplePrompt}</p>
                    </section>

                    <section className="ss-section">
                        <SectionLabel>Display &amp; Cutout</SectionLabel>
                        <div className="ss-card">
                            <SegmentedToggle value={previewBg} onChange={v => setPreviewBg(v as PreviewBg)} items={[
                                { value: 'checker', label: 'Check' },
                                { value: 'black', label: 'Dark' },
                                { value: 'white', label: 'Light' },
                            ]} />
                            <SegmentedToggle value={settings.cutout} onChange={v => setSettings({ cutout: v as SpriteSettings['cutout'] })} items={[
                                { value: 'Auto', label: 'Auto cutout' },
                                { value: 'Off', label: 'No cutout' },
                            ]} />
                            <RangeSlider label="Edge Trim" value={settings.threshold} min={0} max={100} onChange={threshold => setSettings({ threshold })} disabled={settings.cutout === 'Off'} />
                            <RangeSlider label="Alpha Gain" value={settings.alphaGain} min={1} max={3} step={0.1} onChange={alphaGain => setSettings({ alphaGain })} formatValue={v => `${v.toFixed(1)}x`} disabled={settings.cutout === 'Off'} />
                        </div>
                    </section>

                    <section className="ss-section">
                        <SectionLabel>Animations</SectionLabel>
                        <div className="ss-chips">
                            {ANIMATIONS.map(name => (
                                <button key={name} type="button" disabled={generating}
                                    className={`ss-chip ${animations.some(a => a.name === name) ? 'is-active' : ''}`}
                                    onClick={() => toggleAnimation(name)}>
                                    {name}
                                </button>
                            ))}
                        </div>
                    </section>

                    {generating && (
                        <div className="ss-progress">
                            <div className="ss-progress-head">
                                <span>{modelProgress !== null ? 'Loading cutout model' : 'Generating frames'}</span>
                                {modelProgress !== null && <span>{modelProgress}%</span>}
                            </div>
                            <div className="ss-progress-track">
                                <div className={`ss-progress-bar ${modelProgress !== null ? '' : 'is-pulsing'}`} style={{ width: modelProgress !== null ? `${modelProgress}%` : '100%' }} />
                            </div>
                        </div>
                    )}

                    {error && <p className="ss-error" role="alert">{error}</p>}
                </div>

                <footer className="ss-sidebar-foot">
                    <PillButton variant="solid" disabled={!doc.source || animations.length === 0 || generating} onClick={() => generate(id, apiKey)} icon={<SparklesIcon />}>
                        {generating ? 'Baking Frames…' : 'Generate All Sequences'}
                    </PillButton>
                </footer>
            </aside>

            <main className="ss-main">
                <header className="ss-main-head">
                    <span className="ss-title"><GridIcon /> Sprite Studio</span>
                    <PillButton variant="outline" disabled={!hasFrames}
                        onClick={() => runExport(() => exportSheet(animations.filter(a => a.frames.length).map(a => a.frames)), 'Sprite sheet export')}
                        icon={<DownloadIcon />}>
                        Atlas Export
                    </PillButton>
                </header>

                <div className="ss-workbench">
                    <div className="ss-grid">
                        {animations.map(anim => {
                            const idx = frameIdx(anim.id, anim.frames.length);
                            const total = Math.max(settings.frameCount + 1, anim.frames.length);
                            return (
                                <article key={anim.id} className="ss-anim">
                                    <div className={`ss-stage ${previewBg}`}>
                                        {anim.status === 'processing' && (
                                            <div className="ss-stage-busy">
                                                <div className="ss-spinner" />
                                                <span>Frame {anim.attempts.length + 2} / {settings.frameCount + 1}</span>
                                            </div>
                                        )}
                                        {anim.frames.length > 0 ? (
                                            <>
                                                <img src={anim.frames[idx]} alt={`${anim.name} frame ${idx + 1}`} className="pixelated" />
                                                <div className="ss-stage-tools">
                                                    <button type="button" className="ss-icon-btn" aria-label="Erase on this frame" title="Erase on this frame"
                                                        onClick={() => setEditing({ animId: anim.id, frameIdx: idx, src: anim.frames[idx] })}>
                                                        <EditIcon />
                                                    </button>
                                                    <button type="button" className="ss-icon-btn" aria-label="Download GIF" title="Download GIF"
                                                        onClick={() => runExport(() => exportGif(anim.frames, anim.name), 'GIF export')}>
                                                        <DownloadIcon />
                                                    </button>
                                                    {!generating && doc.source && (
                                                        <button type="button" className="ss-icon-btn" aria-label="Regenerate this animation" title="Regenerate this animation"
                                                            onClick={() => generate(id, apiKey, [anim.id])}>
                                                            <RefreshIcon />
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <span className="ss-stage-empty">{anim.status === 'error' ? 'Generation failed' : 'Idle sequence'}</span>
                                        )}
                                    </div>
                                    <div className="ss-anim-meta">
                                        <span className="ss-anim-name">{anim.name}</span>
                                        <span className="ss-anim-count">{anim.frames.length ? `${idx + 1} / ${anim.frames.length}` : '0F'}</span>
                                    </div>
                                    {anim.status === 'interrupted' && (
                                        <p className="ss-interrupted">
                                            Interrupted when the app closed.
                                            {!generating && doc.source && <button type="button" className="ss-link" onClick={() => generate(id, apiKey, [anim.id])}>Regenerate</button>}
                                        </p>
                                    )}
                                    {anim.frames.length > 0 && (
                                        <div className="ss-scrubber">
                                            {Array.from({ length: total }, (_, i) => (
                                                <button key={i} type="button" aria-label={`Frame ${i + 1}`} disabled={i >= anim.frames.length}
                                                    className={i === idx ? 'is-current' : i < anim.frames.length ? 'is-ready' : ''}
                                                    onClick={() => setCursors(prev => ({ ...prev, [anim.id]: i }))} />
                                            ))}
                                        </div>
                                    )}
                                    {anim.attempts.length > 0 && (
                                        <details className="ss-attempts">
                                            <summary>Prompts sent ({anim.attempts.length})</summary>
                                            <ol>
                                                {anim.attempts.map((a, i) => (
                                                    <li key={i} className={a.error ? 'is-failed' : ''}>
                                                        <span className="ss-attempt-head">Frame {i + 2}{a.error ? ` · failed: ${a.error}` : ''}</span>
                                                        {a.prompt}
                                                    </li>
                                                ))}
                                            </ol>
                                        </details>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </div>
            </main>
            </div>

            {editing && createPortal(<FrameEditor initialFrame={editing.src} onSave={saveEditedFrame} onClose={() => setEditing(null)} />, document.body)}
        </div>
    );
};

export default SpriteStudio;
