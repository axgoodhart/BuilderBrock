import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './omneon.css';
import { SceneDocument, parseSceneDocument, createEmptyDocument } from './scene/document';
import { applySceneOperations } from './scene/apply';
import { SceneOperation, parseSceneOperations } from './scene/operations';
import { RuntimeBridge } from './runtime/bridge';
import SceneGraph from './SceneGraph';
import CodePanel from './CodePanel';
import AssetPanel from './AssetPanel';
import TimelinePanel from './TimelinePanel';
import FlowPanel from './FlowPanel';
import PhysicsEditor from './PhysicsEditor';
import { MATERIAL_COLLECTIONS, WORLD_COLLECTIONS, materialCollectionOps, worldCollectionOps } from './templates';
import { AssetRecord } from '../../lib/api';
import { sceneSystemPrompt, buildSceneUserPrompt, extractJsonObject } from './scene/prompt';
import { importSceneCode } from './scene/import';
import * as api from '../../lib/api';
import { llmGenerate, ProviderConfig } from '../../lib/providers';
import { WorkspaceSettings } from '../../types';

interface OmneonWorkspaceProps {
    project: any;
    artifact: any;
    onUpdateArtifact: (id: string, html: string) => void;
    settings: WorkspaceSettings;
    providerConfig: ProviderConfig;
}

interface SceneMsg {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    operations?: string | null;
    explanation?: string | null;
    beforeRevisionId?: string | null;
    afterRevisionId?: string | null;
    status: string; // pending | applied | discarded | failed
}

/**
 * Omneon scene workspace: persistent sandboxed runtime + unified
 * discuss/implement conversation with Apply / Revise / Discard /
 * Try-on-New-Branch proposals, revision history, and branch promotion.
 */
const OmneonWorkspace: React.FC<OmneonWorkspaceProps> = ({ project, artifact, onUpdateArtifact, settings, providerConfig }) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const bridgeRef = useRef<RuntimeBridge | null>(null);

    const [document, setDocument] = useState<SceneDocument>(() => {
        try { return parseSceneDocument(JSON.parse(artifact?.html || '{}')); }
        catch { return createEmptyDocument(); }
    });
    const [selection, setSelection] = useState<string[]>([]);
    const [lastError, setLastError] = useState<string | null>(null);
    const [runtimeReady, setRuntimeReady] = useState(false);

    // Scene history state
    const [branch, setBranch] = useState<any>(null);
    const [branches, setBranches] = useState<any[]>([]);
    const [conversation, setConversation] = useState<any>(null);
    const [messages, setMessages] = useState<SceneMsg[]>([]);
    const [revisions, setRevisions] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    /** Viewing an old revision without editing it. */
    const [checkoutRevision, setCheckoutRevision] = useState<any | null>(null);
    /** World-space region from a rectangle/lasso selection. */
    const [lassoRegion, setLassoRegion] = useState<[number, number, number][] | null>(null);
    /** Active transform handle mode + snapping. */
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale' | null>('translate');
    const [spaceMode, setSpaceMode] = useState<'world' | 'local'>('world');
    const [snapping, setSnapping] = useState(false);
    /** Whether rectangle/lasso selection is active in the runtime. */
    const [lassoActive, setLassoActive] = useState(false);
    const [inspectorTab, setInspectorTab] = useState<'selection' | 'code' | 'history' | 'assets' | 'flow'>('selection');
    /** Animation playback state mirrored from the runtime. */
    const [playback, setPlayback] = useState<{ time: number; playing: boolean; duration: number }>({ time: 0, playing: false, duration: 0 });
    /** Physics engine state mirrored from the runtime. */
    const [physicsState, setPhysicsState] = useState<{ ready: boolean; running: boolean }>({ ready: false, running: false });
    /** Split-viewport state. */
    const [splitView, setSplitView] = useState(false);
    const [secondaryView, setSecondaryView] = useState<'top' | 'front' | 'side' | 'persp'>('top');
    /** Compare mode: indices of ops from the checked-out revision selected for selective apply. */
    const [selectiveOps, setSelectiveOps] = useState<Set<number>>(new Set());

    const docRef = useRef(document);
    docRef.current = document;

    /* ------------------------- artifact switching ------------------------- */

    useEffect(() => {
        try { setDocument(parseSceneDocument(JSON.parse(artifact?.html || '{}'))); }
        catch { setDocument(createEmptyDocument()); }
        setSelection([]);
        setCheckoutRevision(null);
        setLassoActive(false);
        setLassoRegion(null);
        setMessages([]);
        setBranch(null);
        setConversation(null);
    }, [artifact?.id]);

    /* ------------------------------ runtime ------------------------------ */

    useEffect(() => {
        const bridge = new RuntimeBridge();
        bridgeRef.current = bridge;
        const off = bridge.on((event) => {
            switch (event.type) {
                case 'runtimeReady': setRuntimeReady(true); break;
                case 'runtimeError': setLastError(event.message); break;
                case 'selectionChanged':
                    setSelection(event.ids);
                    setLassoRegion(null);
                    break;
                case 'lassoSelected':
                    setSelection(event.ids);
                    setLassoRegion(event.region.map(p => [p.x, p.y, p.z] as [number, number, number]));
                    break;
                case 'transformChanged':
                    if (event.phase === 'commit') {
                        commitRef.current([{ op: 'node.transform', id: event.id, ...event.transform }], { source: 'gizmo' });
                    }
                    break;
                case 'playback':
                    setPlayback({ time: event.time, playing: event.playing, duration: event.duration });
                    break;
                case 'physicsState':
                    setPhysicsState({ ready: event.ready, running: event.running });
                    break;
                case 'physicsBaked': {
                    // Convert baked frames into animation clips via the ops path.
                    const ops: any[] = [];
                    for (const [nodeId, keys] of Object.entries(event.frames)) {
                        if (keys.length < 2) continue;
                        const clipId = `baked_${Date.now().toString(36)}`;
                        const duration = keys[keys.length - 1].time;
                        ops.push({
                            op: 'animation.upsertClip', id: nodeId,
                            clip: { id: clipId, name: 'Baked physics', duration, loop: 'once', tracks: [
                                { path: 'transform.position', keyframes: keys.map(k => ({ time: k.time, value: k.position, easing: 'linear' })) },
                                { path: 'transform.rotation', keyframes: keys.map(k => ({ time: k.time, value: k.rotation, easing: 'linear' })) },
                            ] },
                        });
                    }
                    if (ops.length) commitRef.current(ops, { source: 'physics', prompt: 'Bake physics to keyframes' });
                    break;
                }
            }
        });
        if (iframeRef.current) bridge.attach(iframeRef.current);
        return () => { off(); bridge.dispose(); bridgeRef.current = null; setRuntimeReady(false); };
    }, [artifact?.id]);

    useEffect(() => {
        if (runtimeReady) bridgeRef.current?.send({ type: 'loadScene', document });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runtimeReady, artifact?.id]);

    /* ------------------------- history bootstrap -------------------------- */

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const main = await api.getOrCreateMainBranch(artifact.id);
                if (cancelled) return;
                setBranch(main);
                const convo = await api.getOrCreateConversation(artifact.id, main.id);
                if (cancelled) return;
                setConversation(convo);
                setMessages(convo.messages || []);
                const revs = await api.listSceneRevisions(artifact.id, main.id);
                if (!cancelled) setRevisions(revs);
                const brs = await api.listBranches(artifact.id);
                if (!cancelled) setBranches(brs);
            } catch (e: any) {
                setLastError(`history: ${e.message}`);
            }
        })();
        return () => { cancelled = true; };
    }, [artifact?.id]);

    /* ------------------------------ commits ------------------------------- */

    /**
     * The single mutation path. Validates ops against a cloned document,
     * applies all-or-nothing, pushes the delta to the runtime, persists the
     * artifact, and records a SceneRevision on the active branch.
     */
    const commitOps = useCallback(async (
        rawOps: unknown,
        meta: { source: string; prompt?: string; messageId?: string; branchOverride?: any } = { source: 'manual' },
    ): Promise<SceneDocument | null> => {
        const activeBranch = meta.branchOverride || branch;
        if (!activeBranch) return null;

        let ops: SceneOperation[];
        try {
            ops = parseSceneOperations(rawOps);
        } catch (e: any) {
            setLastError(`Invalid operations: ${e.message}`);
            return null;
        }

        // Editing an older checked-out revision forks automatically.
        let targetBranch = activeBranch;
        if (checkoutRevision && !meta.branchOverride) {
            try {
                targetBranch = await api.createBranch(artifact.id, `edit-at-${checkoutRevision.id.slice(-6)}`, checkoutRevision.id);
                setBranch(targetBranch);
                setBranches(await api.listBranches(artifact.id));
                setCheckoutRevision(null);
            } catch (e: any) {
                setLastError(`branch: ${e.message}`);
                return null;
            }
        }

        const beforeDoc = docRef.current;
        const result = applySceneOperations(beforeDoc, ops);
        if (!result.ok) {
            setLastError(result.errors.join('; '));
            if (meta.messageId) api.updateSceneMessage(meta.messageId, { status: 'failed' }).catch(() => {});
            return null;
        }
        setLastError(null);
        setDocument(result.document);
        bridgeRef.current?.send({ type: 'applyOperations', operations: result.applied, document: result.document });

        try {
            const beforeRev = await api.createSceneRevision({
                artifactId: artifact.id, branchId: targetBranch.id,
                document: JSON.stringify(beforeDoc), source: 'snapshot',
                prompt: meta.prompt ? `before: ${meta.prompt}` : null,
            });
            const afterRev = await api.createSceneRevision({
                artifactId: artifact.id, branchId: targetBranch.id,
                document: JSON.stringify(result.document), source: meta.source,
                prompt: meta.prompt ?? null,
                operations: JSON.stringify(result.applied),
                selection: JSON.stringify(selection),
                model: settings.model,
            });
            if (meta.messageId) {
                await api.updateSceneMessage(meta.messageId, {
                    status: 'applied', beforeRevisionId: beforeRev.id, afterRevisionId: afterRev.id,
                });
                setMessages(prev => prev.map(m => m.id === meta.messageId
                    ? { ...m, status: 'applied', beforeRevisionId: beforeRev.id, afterRevisionId: afterRev.id } : m));
            }
            setRevisions(await api.listSceneRevisions(artifact.id, targetBranch.id));
            onUpdateArtifact(artifact.id, JSON.stringify(result.document));
        } catch (e: any) {
            setLastError(`history: ${e.message}`);
        }
        return result.document;
    }, [branch, checkoutRevision, artifact?.id, selection, settings.model, onUpdateArtifact]);

    const commitRef = useRef(commitOps);
    commitRef.current = commitOps;

    /* --------------------------- conversation ----------------------------- */

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || busy || !conversation) return;
        setInput('');
        setBusy(true);
        try {
            const userMsg = await api.addSceneMessage(conversation.id, { role: 'user', text, status: 'applied' });
            setMessages(prev => [...prev, { ...userMsg, role: 'user' }]);

            const responseText = await llmGenerate({
                model: settings.model,
                system: sceneSystemPrompt(),
                prompt: buildSceneUserPrompt({
                    document: docRef.current,
                    selectedIds: selection,
                    branchName: branch?.name || 'main',
                    recentMessages: [...messages, { role: 'user', text }].map(m => ({ role: m.role, text: m.text })),
                    userMessage: text,
                    lassoRegion: lassoRegion ? { corners: lassoRegion } : null,
                }),
                temperature: settings.temperature,
                reasoningEffort: settings.reasoningEffort,
            }, providerConfig);

            const parsed = extractJsonObject(responseText || '');
            let opsJson: string | null = null;
            let explanation = parsed?.explanation || '';
            let status = 'pending';

            if (parsed && Array.isArray(parsed.operations) && parsed.operations.length > 0) {
                try {
                    const ops = parseSceneOperations(parsed.operations);
                    const check = applySceneOperations(docRef.current, ops);
                    if (check.ok) {
                        opsJson = JSON.stringify(ops);
                    } else {
                        explanation = `${explanation}\n(Proposal invalid: ${check.errors.join('; ')})`;
                        status = 'failed';
                    }
                } catch (e: any) {
                    explanation = `${explanation}\n(Operations failed validation: ${e.message})`;
                    status = 'failed';
                }
            } else if (!parsed) {
                explanation = responseText || 'I could not parse a response.';
                status = 'failed';
            } else {
                status = 'applied'; // conversational reply, no ops
            }

            const assistantMsg = await api.addSceneMessage(conversation.id, {
                role: 'assistant',
                text: explanation || (opsJson ? 'Proposed scene changes.' : 'No changes.'),
                operations: opsJson,
                explanation,
                status,
                model: settings.model,
            });
            setMessages(prev => [...prev, assistantMsg]);
        } catch (e: any) {
            setLastError(`chat: ${e.message}`);
        } finally {
            setBusy(false);
        }
    }, [input, busy, conversation, settings, providerConfig, branch, selection, messages]);

    const applyProposal = useCallback((msg: SceneMsg) => {
        if (!msg.operations) return;
        try {
            const ops = JSON.parse(msg.operations);
            commitOps(ops, { source: 'chat', prompt: msg.explanation || msg.text, messageId: msg.id });
        } catch { /* validated at proposal time */ }
    }, [commitOps]);

    const discardProposal = useCallback((msg: SceneMsg) => {
        api.updateSceneMessage(msg.id, { status: 'discarded' }).catch(() => {});
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'discarded' } : m));
    }, []);

    const tryOnNewBranch = useCallback(async (msg: SceneMsg) => {
        if (!msg.operations || !branch) return;
        try {
            const ops = JSON.parse(msg.operations);
            const head = revisions.length ? revisions[revisions.length - 1] : null;
            const newBranch = await api.createBranch(artifact.id, `try-${Date.now().toString(36)}`, head?.id ?? null);
            setBranch(newBranch);
            setBranches(await api.listBranches(artifact.id));
            await commitOps(ops, { source: 'chat', prompt: msg.explanation || msg.text, messageId: msg.id, branchOverride: newBranch });
            api.updateSceneMessage(msg.id, { status: 'applied' }).catch(() => {});
        } catch (e: any) {
            setLastError(`branch: ${e.message}`);
        }
    }, [branch, revisions, artifact?.id, commitOps]);

    /* ---------------------------- history -------------------------------- */

    const checkout = useCallback((rev: any) => {
        try {
            const doc = parseSceneDocument(JSON.parse(rev.document));
            setCheckoutRevision(rev);
            setDocument(doc);
            bridgeRef.current?.send({ type: 'loadScene', document: doc });
        } catch (e: any) {
            setLastError(`revision: ${e.message}`);
        }
    }, []);

    const backToHead = useCallback(() => {
        setCheckoutRevision(null);
        try {
            setDocument(parseSceneDocument(JSON.parse(artifact.html)));
            bridgeRef.current?.send({ type: 'loadScene', document: parseSceneDocument(JSON.parse(artifact.html)) });
        } catch { /* ignore */ }
    }, [artifact?.html]);

    const useThisVersion = useCallback(async (rev: any) => {
        if (!branch) return;
        try {
            const promoted = await api.promoteRevision(rev.id, branch.id, 'Use this version');
            const doc = parseSceneDocument(JSON.parse(promoted.document));
            setDocument(doc);
            setCheckoutRevision(null);
            bridgeRef.current?.send({ type: 'loadScene', document: doc });
            onUpdateArtifact(artifact.id, JSON.stringify(doc));
            setRevisions(await api.listSceneRevisions(artifact.id, branch.id));
        } catch (e: any) {
            setLastError(`promote: ${e.message}`);
        }
    }, [branch, artifact?.id, onUpdateArtifact]);

    const switchBranch = useCallback(async (branchId: string) => {
        const b = branches.find(x => x.id === branchId);
        if (!b) return;
        setBranch(b);
        const revs = await api.listSceneRevisions(artifact.id, b.id);
        setRevisions(revs);
        const head = revs[revs.length - 1];
        if (head) {
            try {
                const doc = parseSceneDocument(JSON.parse(head.document));
                setDocument(doc);
                bridgeRef.current?.send({ type: 'loadScene', document: doc });
                onUpdateArtifact(artifact.id, JSON.stringify(doc));
            } catch { /* ignore */ }
        }
        const convo = await api.getOrCreateConversation(artifact.id, b.id);
        setConversation(convo);
        setMessages(convo.messages || []);
        setCheckoutRevision(null);
    }, [branches, artifact?.id, onUpdateArtifact]);

    /* ------------------------------ render -------------------------------- */

    const selectedNodes = useMemo(
        () => selection.map(id => document.nodes.find(n => n.id === id)).filter(Boolean),
        [selection, document],
    );

    // Tree → viewport selection sync, handle mode, snapping
    const selectNodes = useCallback((ids: string[]) => {
        setSelection(ids);
        setLassoRegion(null);
        bridgeRef.current?.send({ type: 'selectNode', ids });
    }, []);

    useEffect(() => {
        bridgeRef.current?.send({ type: 'setTransformMode', mode: transformMode });
    }, [transformMode, runtimeReady]);

    useEffect(() => {
        bridgeRef.current?.send({ type: 'setSnap', enabled: snapping, translateSnap: 0.5, rotateSnap: Math.PI / 12, scaleSnap: 0.1 });
    }, [snapping, runtimeReady]);

    useEffect(() => {
        bridgeRef.current?.send({ type: 'setSpace', space: spaceMode });
    }, [spaceMode, runtimeReady]);

    // Keyboard: Delete/Backspace removes the selection (with confirmation).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            const ids = selection.filter(id => !docRef.current.nodes.find(n => n.id === id)?.locked);
            if (!ids.length) return;
            e.preventDefault();
            if (window.confirm(`Delete ${ids.length} node(s)? This is recorded in history.`)) {
                commitRef.current(ids.map(id => ({ op: 'node.remove', id })), { source: 'keyboard', prompt: `Delete ${ids.length} node(s)` });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selection]);

    const askAboutSelection = useCallback((preset: string) => {
        setInput(preset);
    }, []);

    const toggleLasso = useCallback((enabled: boolean) => {
        bridgeRef.current?.send({ type: 'setSelectionMode', mode: enabled ? 'lasso' : 'point' });
    }, []);

    const toggleSplit = useCallback((next: boolean, secondary: typeof secondaryView) => {
        setSplitView(next);
        bridgeRef.current?.send({ type: 'setViewport', mode: next ? 'split' : 'single', secondary });
    }, []);

    /* ------------------------------ assets ------------------------------- */

    /** Route an asset into the scene through the single typed ops path. */
    const applyAsset = useCallback((asset: AssetRecord, target: 'scene' | 'selection' | 'environment') => {
        if (target === 'scene' && asset.kind === 'model') {
            commitOps([{ op: 'node.add', node: { name: asset.name.replace(/\.[^.]+$/, ''), kind: 'mesh', geometry: { type: 'model', assetId: asset.id } } }],
                { source: 'asset', prompt: `Import model: ${asset.name}` });
        } else if (target === 'selection' && asset.kind === 'texture') {
            if (selection.length === 0) { setLastError('Select a mesh before applying a texture.'); return; }
            const materialId = `mat_${asset.hash.slice(0, 8)}`;
            const ops: any[] = [{
                op: 'material.define',
                material: { id: materialId, name: asset.name, props: { textureAssetId: asset.id } },
            }];
            for (const id of selection) ops.push({ op: 'material.assign', id, materialId });
            commitOps(ops, { source: 'asset', prompt: `Texture ${asset.name} → ${selection.length} node(s)` });
        } else if (target === 'environment' && asset.kind === 'hdr') {
            commitOps([{ op: 'world.update', world: { environmentAssetId: asset.id } }],
                { source: 'asset', prompt: `Environment: ${asset.name}` });
        }
    }, [commitOps, selection]);

    /** Migration (step 16): import an existing scene from code or JSON. */
    const importFileRef = useRef<HTMLInputElement | null>(null);
    const handleImportScene = useCallback(async (file: File) => {
        const text = await file.text();
        const result = importSceneCode(text);
        if (!result.ok) {
            setLastError(`import: ${result.errors.join('; ')}`);
            return;
        }
        const committed = await commitOps(result.operations, { source: 'import', prompt: `Import scene from ${file.name}` });
        if (committed) setLastError(null);
    }, [commitOps]);

    /** Files dropped on the viewport: import to the library, then apply. */    const handleViewportDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) {
            try {
                const buf = await file.arrayBuffer();
                let binary = '';
                const bytes = new Uint8Array(buf);
                for (let i = 0; i < bytes.length; i += 0x8000) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                }
                const asset = await api.importLocalAsset({ name: file.name, contentBase64: btoa(binary) });
                if (asset.kind === 'model') applyAsset(asset, 'scene');
                else if (asset.kind === 'texture') applyAsset(asset, 'selection');
                else if (asset.kind === 'hdr') applyAsset(asset, 'environment');
            } catch (err: any) {
                setLastError(`import: ${err.message}`);
            }
        }
    }, [applyAsset]);

    return (
        <div className="omneon-workspace">
            <div className="omneon-main">
                <div className="omneon-toolbar">
                    <span className="omneon-toolbar-title">{project?.name || 'Scene'}</span>
                    <select
                        className="omneon-branch-select"
                        value={branch?.id || ''}
                        onChange={e => switchBranch(e.target.value)}
                    >
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <span className="omneon-toolbar-hint">
                        {runtimeReady ? `${document.nodes.length} node(s)` : 'loading runtime…'}
                        {checkoutRevision ? ' · viewing old revision' : ''}
                    </span>
                    <div className="omneon-toolbar-actions">
                        <button onClick={() => commitOps([{ op: 'node.add', node: { name: 'Box', kind: 'mesh', geometry: { type: 'box' } } }], { source: 'manual' })}>+ Box</button>
                        <button onClick={() => commitOps([{ op: 'node.add', node: { name: 'Sphere', kind: 'mesh', geometry: { type: 'sphere' } } }], { source: 'manual' })}>+ Sphere</button>
                        <button onClick={() => commitOps([{ op: 'node.add', node: { name: 'Sun', kind: 'light', light: { type: 'directional', intensity: 1.5 }, transform: { position: { x: 4, y: 6, z: 4 } } } }], { source: 'manual' })}>+ Light</button>
                        <span className="omneon-toolbar-sep" />
                        <button
                            className={transformMode === 'translate' ? 'omneon-active' : ''}
                            aria-label="Translate handle"
                            onClick={() => setTransformMode(transformMode === 'translate' ? null : 'translate')}
                        >↕</button>
                        <button
                            className={transformMode === 'rotate' ? 'omneon-active' : ''}
                            aria-label="Rotate handle"
                            onClick={() => setTransformMode(transformMode === 'rotate' ? null : 'rotate')}
                        >⟳</button>
                        <button
                            className={transformMode === 'scale' ? 'omneon-active' : ''}
                            aria-label="Scale handle"
                            onClick={() => setTransformMode(transformMode === 'scale' ? null : 'scale')}
                        >⤢</button>
                        <button aria-label="Toggle world/local space" onClick={() => setSpaceMode(s => s === 'world' ? 'local' : 'world')}>{spaceMode === 'world' ? 'W' : 'L'}</button>
                        <button
                            className={snapping ? 'omneon-active' : ''}
                            aria-label="Toggle snapping"
                            onClick={() => setSnapping(s => !s)}
                        >⌗</button>
                        <button
                            className={lassoActive ? 'omneon-active' : ''}
                            aria-label="Rectangle selection"
                            onClick={() => { const next = !lassoActive; setLassoActive(next); toggleLasso(next); }}
                        >▭</button>
                        <button
                            className={splitView ? 'omneon-active' : ''}
                            aria-label="Split viewport"
                            onClick={() => toggleSplit(!splitView, secondaryView)}
                        >⿻</button>
                        {splitView && (
                            <select
                                className="omneon-branch-select"
                                value={secondaryView}
                                onChange={e => {
                                    const v = e.target.value as typeof secondaryView;
                                    setSecondaryView(v);
                                    bridgeRef.current?.send({ type: 'setViewport', mode: 'split', secondary: v });
                                }}
                            >
                                <option value="top">top</option>
                                <option value="front">front</option>
                                <option value="side">side</option>
                                <option value="persp">persp</option>
                            </select>
                        )}
                        <span className="omneon-toolbar-sep" />
                        <button
                            className={physicsState.running ? 'omneon-active' : ''}
                            title={physicsState.running ? 'Pause physics' : 'Run physics (loads Rapier WASM on first use)'}
                            onClick={() => bridgeRef.current?.send({ type: physicsState.running ? 'physicsPause' : 'physicsStart' })}
                        >⚛{physicsState.running ? '⏸' : '▶'}</button>
                        <button title="Step physics one frame" onClick={() => bridgeRef.current?.send({ type: 'physicsStep' })}>⏭</button>
                        <button title="Reset physics to document transforms" onClick={() => bridgeRef.current?.send({ type: 'physicsReset' })}>⟲</button>
                        <button
                            title="Bake 3s of physics to keyframes"
                            onClick={() => bridgeRef.current?.send({ type: 'physicsBake', duration: 3, fps: 30 })}
                        >⏺Bake</button>
                        <button
                            title="Export as self-contained Web App ZIP (three + rapier bundled locally)"
                            onClick={() => { window.open(`/api/packager/artifacts/${artifact.id}/export`, '_blank'); }}
                        >⇩ ZIP</button>
                        <button
                            title="Import an existing Omneon scene (.ts/.js managed module or SceneDocument .json)"
                            onClick={() => importFileRef.current?.click()}
                        >⇪ Import</button>
                        <input
                            ref={importFileRef}
                            type="file"
                            accept=".ts,.js,.json"
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportScene(f); e.target.value = ''; }}
                        />
                        <span className="omneon-toolbar-sep" />
                        <select
                            className="omneon-branch-select"
                            value=""
                            title="Apply a material collection"
                            onChange={e => {
                                if (e.target.value) commitOps(materialCollectionOps(e.target.value), { source: 'template', prompt: `Apply material collection: ${e.target.value}` });
                                e.target.value = '';
                            }}
                        >
                            <option value="">Materials…</option>
                            {MATERIAL_COLLECTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select
                            className="omneon-branch-select"
                            value=""
                            title="Apply a world collection"
                            onChange={e => {
                                if (e.target.value) commitOps(worldCollectionOps(e.target.value), { source: 'template', prompt: `Apply world collection: ${e.target.value}` });
                                e.target.value = '';
                            }}
                        >
                            <option value="">Worlds…</option>
                            {WORLD_COLLECTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="omneon-content-row">
                    <div className="omneon-tree-rail">
                        <SceneGraph
                            document={document}
                            selection={selection}
                            onSelect={selectNodes}
                            onCommitOps={ops => commitOps(ops, { source: 'manual' })}
                            onAskAI={askAboutSelection}
                        />
                    </div>
                    <div
                        className="omneon-viewport-wrap"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleViewportDrop}
                    >
                    <iframe
                        ref={iframeRef}
                        className="omneon-iframe"
                        title="Omneon scene runtime"
                        sandbox="allow-scripts"
                    />
                    {lastError && <div className="omneon-error" onClick={() => setLastError(null)}>{lastError}</div>}
                    {checkoutRevision && (
                        <div className="omneon-checkout-banner">
                            <span className="omneon-compare-left">← this revision</span>
                            <span>Comparing: revision vs current head →</span>
                            <button onClick={() => useThisVersion(checkoutRevision)}>Use Left</button>
                            <button onClick={backToHead}>Use Right</button>
                            <button onClick={() => setInspectorTab('history')}>Selectively Apply…</button>
                        </div>
                    )}
                    </div>
                </div>

                {/* Animation timeline */}
                <TimelinePanel
                    document={document}
                    selection={selection}
                    playing={playback.playing}
                    time={playback.time}
                    duration={playback.duration}
                    onPlay={(nodeId, clipId) => bridgeRef.current?.send({ type: 'play', nodeId, clipId })}
                    onPause={() => bridgeRef.current?.send({ type: 'pause' })}
                    onSeek={t => bridgeRef.current?.send({ type: 'seek', time: t })}
                    onCommitOps={(ops, prompt) => commitOps(ops, { source: 'timeline', prompt })}
                />

                {/* Unified conversation */}
                <div className="omneon-chat">
                    <div className="omneon-chat-messages">
                        {messages.map(m => (
                            <div key={m.id} className={`omneon-msg omneon-msg-${m.role} ${m.status === 'discarded' ? 'omneon-msg-discarded' : ''}`}>
                                <div className="omneon-msg-text">{m.explanation || m.text}</div>
                                {m.role === 'assistant' && m.operations && m.status === 'pending' && (
                                    <div className="omneon-msg-actions">
                                        <button onClick={() => applyProposal(m)} disabled={busy}>Apply</button>
                                        <button onClick={() => { setInput(`Revise: ${m.explanation || m.text} — `); }}>Revise</button>
                                        <button onClick={() => tryOnNewBranch(m)} disabled={busy}>Try on New Branch</button>
                                        <button onClick={() => discardProposal(m)}>Discard</button>
                                    </div>
                                )}
                                {m.role === 'assistant' && m.status === 'applied' && m.operations && (
                                    <div className="omneon-msg-status">applied</div>
                                )}
                                {m.role === 'assistant' && m.status === 'failed' && (
                                    <div className="omneon-msg-status omneon-msg-failed">invalid — scene unchanged</div>
                                )}
                            </div>
                        ))}
                        {busy && <div className="omneon-msg omneon-msg-assistant">thinking…</div>}
                    </div>
                    <div className="omneon-chat-input">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder='Try "add a sphere", "make it glass", "have it orbit the cube"…'
                            disabled={busy || !conversation}
                        />
                        <button onClick={handleSend} disabled={busy || !input.trim()}>Send</button>
                    </div>
                </div>
            </div>

            <div className="omneon-inspector">
                <div className="omneon-inspector-tabs">
                    {(['selection', 'flow', 'code', 'history', 'assets'] as const).map(t => (
                        <button
                            key={t}
                            className={inspectorTab === t ? 'omneon-active' : ''}
                            onClick={() => setInspectorTab(t)}
                        >{t}</button>
                    ))}
                </div>

                {inspectorTab === 'selection' && (
                    <>
                        <div className="omneon-inspector-title">Selection</div>
                        {selectedNodes.length === 0 && <div className="omneon-inspector-empty">Click an object in the viewport.</div>}
                        {selectedNodes.map(node => node && (
                            <div key={node.id} className="omneon-inspector-card">
                                <div className="omneon-inspector-name">{node.name}</div>
                                <div className="omneon-inspector-id">{node.id}</div>
                                <div className="omneon-inspector-row">
                                    <span>Position</span>
                                    <span>{[node.transform.position.x, node.transform.position.y, node.transform.position.z].map(v => v.toFixed(2)).join(', ')}</span>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {inspectorTab === 'code' && (
                    <CodePanel
                        document={document}
                        onCommitOps={ops => commitOps(ops, { source: 'manual' })}
                    />
                )}

                {inspectorTab === 'flow' && (
                    <FlowPanel
                        document={document}
                        selection={selection}
                        onCommitOps={(ops, prompt) => commitOps(ops, { source: 'flow', prompt })}
                    />
                )}

                {inspectorTab === 'assets' && (
                    <AssetPanel selection={selection} onApplyAsset={applyAsset} />
                )}

                {inspectorTab === 'history' && (
                    <>
                        <div className="omneon-inspector-title">History ({branch?.name || '…'})</div>
                        {revisions.length === 0 && <div className="omneon-inspector-empty">No revisions yet.</div>}
                        {[...revisions].reverse().map(rev => (
                            <div key={rev.id} className="omneon-rev-card">
                                <div className="omneon-rev-label">{rev.prompt || rev.source}</div>
                                <div className="omneon-rev-time">{new Date(rev.createdAt).toLocaleTimeString()} · {rev.source}</div>
                                <div className="omneon-rev-actions">
                                    <button onClick={() => checkout(rev)}>View</button>
                                    <button onClick={() => useThisVersion(rev)}>Use this version</button>
                                </div>
                            </div>
                        ))}

                        {/* Selective apply: cherry-pick ops from the checked-out revision. */}
                        {checkoutRevision?.operations && (() => {
                            let ops: any[] | null = null;
                            try { ops = JSON.parse(checkoutRevision.operations); } catch { ops = null; }
                            if (!ops || !ops.length) return null;
                            return (
                                <div className="omneon-compare">
                                    <div className="omneon-inspector-title">Selectively Apply ({ops.length} ops)</div>
                                    {ops.map((op, i) => (
                                        <label key={i} className="omneon-compare-op">
                                            <input
                                                type="checkbox"
                                                checked={selectiveOps.has(i)}
                                                onChange={e => {
                                                    const next = new Set(selectiveOps);
                                                    if (e.target.checked) next.add(i); else next.delete(i);
                                                    setSelectiveOps(next);
                                                }}
                                            />
                                            <code>{op.op} {op.id || op.nodeId || op.materialId || op.path || ''}</code>
                                        </label>
                                    ))}
                                    <button
                                        disabled={selectiveOps.size === 0}
                                        onClick={() => {
                                            const chosen = ops!.filter((_, i) => selectiveOps.has(i));
                                            commitOps(chosen, { source: 'compare', prompt: `Selectively applied ${chosen.length} op(s) from revision` });
                                            setSelectiveOps(new Set());
                                            backToHead();
                                        }}
                                    >Apply {selectiveOps.size > 0 ? `${selectiveOps.size} ` : ''}selected to head</button>
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>
        </div>
    );
};

export default OmneonWorkspace;
