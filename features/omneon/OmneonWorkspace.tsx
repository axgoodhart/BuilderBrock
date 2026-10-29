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
import SelectionInspector from './SelectionInspector';
import ProposalReview from './ProposalReview';
import CollectionPicker from './CollectionPicker';
import PanelResizeHandle from './PanelResizeHandle';
import { AssetRecord } from '../../lib/api';
import { sceneSystemPrompt, buildSceneUserPrompt, extractJsonObject } from './scene/prompt';
import { importSceneCode } from './scene/import';
import * as api from '../../lib/api';
import { llmGenerate, ProviderConfig } from '../../lib/providers';
import { WorkspaceSettings } from '../../types';

interface OmneonWorkspaceProps {
    project: any;
    artifact: any;
    onUpdateArtifact: (id: string, html: string, persist?: boolean) => void;
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
    const [runtimeError, setRuntimeError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
    const [importStatus, setImportStatus] = useState('');
    const [reviewMessageId, setReviewMessageId] = useState<string | null>(null);
    const [collectionKind, setCollectionKind] = useState<'materials' | 'worlds' | null>(null);
    const [panels, setPanels] = useState({ tree: true, inspector: true, timeline: true, chat: true });
    const [sizes, setSizes] = useState(() => {
        const defaults = { tree: 220, inspector: 300, timeline: 230, chat: 220 };
        try {
            const saved = JSON.parse(localStorage.getItem('omneon-panel-sizes') || '{}');
            for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
                if (Number.isFinite(saved[key])) defaults[key] = Math.max(key === 'tree' ? 180 : key === 'inspector' ? 240 : 140, Math.min(500, saved[key]));
            }
        } catch { /* Use defaults when storage is unavailable. */ }
        return defaults;
    });
    const [resizing, setResizing] = useState(false);
    const workbench = useRef<HTMLDivElement>(null);
    const compact = useRef<boolean | null>(null);
    const artifactIdRef = useRef(artifact.id);
    artifactIdRef.current = artifact.id;
    const commitQueue = useRef<Promise<unknown>>(Promise.resolve());
    const pendingSaves = useRef(0);
    const dirty = useRef(false);
    const unsavedMessages = useRef(new Map<string, { beforeRevisionId: string; afterRevisionId: string }>());
    const togglePanel = (panel: keyof typeof panels) => { if (panel === 'chat') setReviewMessageId(null); setPanels(prev => ({ ...prev, [panel]: !prev[panel], ...(compact.current && (panel === 'tree' || panel === 'inspector') ? { [panel === 'tree' ? 'inspector' : 'tree']: false } : {}) })); };
    const resizePanel = (panel: keyof typeof sizes, value: number) => setSizes(prev => ({ ...prev, [panel]: value }));
    useEffect(() => { try { localStorage.setItem('omneon-panel-sizes', JSON.stringify(sizes)); } catch { /* Optional preference. */ } }, [sizes]);
    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            const next = entries[0].contentRect.width < 1050;
            if (compact.current !== next) {
                compact.current = next;
                if (next) setPanels(prev => ({ ...prev, tree: false, inspector: false, ...(entries[0].contentRect.width < 600 ? { timeline: false, chat: false } : {}) }));
            }
        });
        if (workbench.current) observer.observe(workbench.current);
        return () => observer.disconnect();
    }, []);

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

    const branchRef = useRef(branch);
    branchRef.current = branch;
    const checkoutRef = useRef(checkoutRevision);
    checkoutRef.current = checkoutRevision;
    const docRef = useRef(document);
    docRef.current = document;

    /* ------------------------- artifact switching ------------------------- */

    useEffect(() => {
        try { setDocument(parseSceneDocument(JSON.parse(artifact?.html || '{}'))); }
        catch { setDocument(createEmptyDocument()); }
        setSelection([]);
        setLastError(null);
        setRuntimeError('');
        dirty.current = false;
        unsavedMessages.current.clear();
        setReviewMessageId(null);
        setSaveStatus('saved');
        setImportStatus('');
        setCollectionKind(null);
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
        const startupTimeout = window.setTimeout(() => setRuntimeError('Runtime did not start. Reload the scene to try again.'), 20000);
        const off = bridge.on((event) => {
            switch (event.type) {
                case 'runtimeReady': clearTimeout(startupTimeout); setRuntimeError(''); setRuntimeReady(true); break;
                case 'runtimeError': setRuntimeError(event.message); setLastError(event.message); break;
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
        return () => { clearTimeout(startupTimeout); off(); bridge.dispose(); bridgeRef.current = null; setRuntimeReady(false); };
    }, [artifact?.id]);

    useEffect(() => {
        if (runtimeReady) bridgeRef.current?.send({ type: 'loadScene', document: docRef.current });
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
        meta: { source: string; prompt?: string; messageId?: string; branchOverride?: any; expectedDocument?: SceneDocument } = { source: 'manual' },
    ): Promise<SceneDocument | null> => {
        pendingSaves.current += 1;
        setSaveStatus('saving');
        const run = async (): Promise<SceneDocument | null> => {
            if (artifactIdRef.current !== artifact.id) return null;
            if (meta.expectedDocument && meta.expectedDocument !== docRef.current) {
                setLastError('The scene changed after this preview. Review the updated preview before applying.');
                return null;
            }
            const activeBranch = meta.branchOverride || branchRef.current;
            if (!activeBranch) { setLastError('Scene history is still connecting. Please try again.'); return null; }

            let ops: SceneOperation[];
            try {
                ops = parseSceneOperations(rawOps);
            } catch (e: any) {
                setLastError(`Invalid operations: ${e.message}`);
                return null;
            }

            // Editing an older checked-out revision forks automatically.
            let targetBranch = activeBranch;
            if (checkoutRef.current && !meta.branchOverride) {
                try {
                    targetBranch = await api.createBranch(artifact.id, `edit-at-${checkoutRef.current.id.slice(-6)}`, checkoutRef.current.id);
                    branchRef.current = targetBranch;
                    checkoutRef.current = null;
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
            dirty.current = true;
            if (meta.messageId) setMessages(prev => prev.map(m => m.id === meta.messageId ? { ...m, status: 'applied' } : m));
            docRef.current = result.document;
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
                if (meta.messageId && artifactIdRef.current === artifact.id) unsavedMessages.current.set(meta.messageId, { beforeRevisionId: beforeRev.id, afterRevisionId: afterRev.id });
                await api.updateArtifact(artifact.id, { html: JSON.stringify(result.document) });
                onUpdateArtifact(artifact.id, JSON.stringify(result.document), false);
                if (artifactIdRef.current !== artifact.id) return result.document;
                for (const [messageId, revisionIds] of unsavedMessages.current) {
                    await api.updateSceneMessage(messageId, { status: 'applied', beforeRevisionId: revisionIds.beforeRevisionId || beforeRev.id, afterRevisionId: revisionIds.afterRevisionId || afterRev.id });
                    if (artifactIdRef.current !== artifact.id) return result.document;
                    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'applied', beforeRevisionId: revisionIds.beforeRevisionId || beforeRev.id, afterRevisionId: revisionIds.afterRevisionId || afterRev.id } : m));
                    unsavedMessages.current.delete(messageId);
                }
                const savedRevisions = await api.listSceneRevisions(artifact.id, targetBranch.id);
                if (artifactIdRef.current !== artifact.id) return result.document;
                setRevisions(savedRevisions);
                dirty.current = false;
                setSaveStatus('saved');
            } catch (e: any) {
                if (artifactIdRef.current === artifact.id) {
                    if (meta.messageId && !unsavedMessages.current.has(meta.messageId)) unsavedMessages.current.set(meta.messageId, { beforeRevisionId: '', afterRevisionId: '' });
                    setSaveStatus('failed');
                    setLastError(`Could not save scene: ${e.message}. Your edits are still in the canvas; use Retry save.`);
                }
                return null;
            }
            return result.document;
        };
        const task = commitQueue.current.then(run, run).catch((error: any) => {
            if (artifactIdRef.current === artifact.id) setLastError(`Could not apply edit: ${error.message}`);
            return null;
        });
        commitQueue.current = task.catch(() => null);
        return task.finally(() => {
            pendingSaves.current -= 1;
            if (artifactIdRef.current === artifact.id) setSaveStatus(pendingSaves.current ? 'saving' : dirty.current ? 'failed' : 'saved');
        });
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
        if (!msg.operations || pendingSaves.current) return;
        try {
            const ops = JSON.parse(msg.operations);
            commitOps(ops, { source: 'chat', prompt: msg.explanation || msg.text, messageId: msg.id, expectedDocument: docRef.current });
        } catch { /* validated at proposal time */ }
    }, [commitOps]);

    const discardProposal = useCallback((msg: SceneMsg) => {
        api.updateSceneMessage(msg.id, { status: 'discarded' }).catch((error: any) => setLastError(`Could not save proposal decision: ${error.message}`));
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'discarded' } : m));
    }, []);

    const tryOnNewBranch = useCallback(async (msg: SceneMsg) => {
        if (!msg.operations || !branch || pendingSaves.current) return;
        const expectedDocument = docRef.current;
        setBusy(true);
        try {
            const ops = JSON.parse(msg.operations);
            const head = revisions.length ? revisions[revisions.length - 1] : null;
            const newBranch = await api.createBranch(artifact.id, `try-${Date.now().toString(36)}`, head?.id ?? null);
            branchRef.current = newBranch;
            setBranch(newBranch);
            setBranches(await api.listBranches(artifact.id));
            await commitOps(ops, { source: 'chat', prompt: msg.explanation || msg.text, messageId: msg.id, branchOverride: newBranch, expectedDocument });
        } catch (e: any) {
            setLastError(`branch: ${e.message}`);
        } finally {
            setBusy(false);
        }
    }, [branch, revisions, artifact?.id, commitOps]);

    /* ---------------------------- history -------------------------------- */

    const checkout = useCallback((rev: any) => {
        if (pendingSaves.current || (dirty.current && !window.confirm('Discard unsaved edits and view this revision?'))) return;
        try {
            const doc = parseSceneDocument(JSON.parse(rev.document));
            dirty.current = false;
            setSaveStatus('saved');
            checkoutRef.current = rev;
            setCheckoutRevision(rev);
            docRef.current = doc;
            setDocument(doc);
            bridgeRef.current?.send({ type: 'loadScene', document: doc });
        } catch (e: any) {
            setLastError(`revision: ${e.message}`);
        }
    }, []);

    const backToHead = useCallback(() => {
        if (pendingSaves.current || (dirty.current && !window.confirm('Discard unsaved edits and return to the saved scene?'))) return false;
        checkoutRef.current = null;
        setCheckoutRevision(null);
        try {
            docRef.current = parseSceneDocument(JSON.parse(artifact.html));
            setDocument(docRef.current);
            bridgeRef.current?.send({ type: 'loadScene', document: docRef.current });
            dirty.current = false;
            setSaveStatus('saved');
            return true;
        } catch { return false; }
    }, [artifact?.html]);

    const useThisVersion = useCallback(async (rev: any) => {
        if (!branch || pendingSaves.current || !window.confirm('Replace the current scene with this saved version?')) return;
        setSaveStatus('saving');
        try {
            const promoted = await api.promoteRevision(rev.id, branch.id, 'Use this version');
            const doc = parseSceneDocument(JSON.parse(promoted.document));
            dirty.current = true;
            checkoutRef.current = null;
            docRef.current = doc;
            setDocument(doc);
            setCheckoutRevision(null);
            bridgeRef.current?.send({ type: 'loadScene', document: doc });
            await api.updateArtifact(artifact.id, { html: JSON.stringify(doc) });
            onUpdateArtifact(artifact.id, JSON.stringify(doc), false);
            setRevisions(await api.listSceneRevisions(artifact.id, branch.id));
            dirty.current = false;
            setSaveStatus('saved');
        } catch (e: any) {
            setSaveStatus(dirty.current ? 'failed' : 'saved');
            setLastError(`promote: ${e.message}`);
        }
    }, [branch, artifact?.id, onUpdateArtifact]);

    const switchBranch = useCallback(async (branchId: string) => {
        const next = branches.find(b => b.id === branchId);
        if (!next || pendingSaves.current || (dirty.current && !window.confirm('Discard unsaved edits and switch scene branches?'))) return;
        setSaveStatus('saving');
        try {
            const revs = await api.listSceneRevisions(artifact.id, next.id);
            let head = revs[revs.length - 1];
            if (!head && next.parentRevisionId) head = (await api.listSceneRevisions(artifact.id)).find(r => r.id === next.parentRevisionId);
            const nextDoc = head ? parseSceneDocument(JSON.parse(head.document)) : createEmptyDocument();
            const convo = await api.getOrCreateConversation(artifact.id, next.id);
            await api.updateArtifact(artifact.id, { html: JSON.stringify(nextDoc) });
            onUpdateArtifact(artifact.id, JSON.stringify(nextDoc), false);
            if (artifactIdRef.current !== artifact.id) return;
            branchRef.current = next;
            checkoutRef.current = null;
            docRef.current = nextDoc;
            dirty.current = false;
            unsavedMessages.current.clear();
            setBranch(next);
            setDocument(nextDoc);
            setRevisions(revs);
            setConversation(convo);
            setMessages(convo.messages || []);
            setCheckoutRevision(null);
            setSaveStatus('saved');
            bridgeRef.current?.send({ type: 'loadScene', document: nextDoc });
        } catch (error: any) {
            setSaveStatus(dirty.current ? 'failed' : 'saved');
            setLastError(`Could not switch branch: ${error.message}`);
        }
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
            if (t?.closest('.omneon-timeline, .omneon-collection-dialog, .omneon-chat, .omneon-inspector')) return;
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
        setPanels(prev => ({ ...prev, chat: true }));
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
    const applyAsset = useCallback(async (asset: AssetRecord, target: 'scene' | 'selection' | 'environment') => {
        if (target === 'scene' && asset.kind === 'model') {
            return commitOps([{ op: 'node.add', node: { name: asset.name.replace(/\.[^.]+$/, ''), kind: 'mesh', geometry: { type: 'model', assetId: asset.id } } }],
                { source: 'asset', prompt: `Import model: ${asset.name}` });
        } else if (target === 'selection' && asset.kind === 'texture') {
            if (selection.length === 0) { setLastError('Select a mesh before applying a texture.'); return; }
            const materialId = `mat_${asset.hash.slice(0, 8)}`;
            const ops: any[] = [{
                op: 'material.define',
                material: { id: materialId, name: asset.name, props: { textureAssetId: asset.id } },
            }];
            for (const id of selection) ops.push({ op: 'material.assign', id, materialId });
            return commitOps(ops, { source: 'asset', prompt: `Texture ${asset.name} → ${selection.length} node(s)` });
        } else if (target === 'environment' && asset.kind === 'hdr') {
            return commitOps([{ op: 'world.update', world: { environmentAssetId: asset.id } }],
                { source: 'asset', prompt: `Environment: ${asset.name}` });
        }
    }, [commitOps, selection]);

    /** Migration (step 16): import an existing scene from code or JSON. */
    const importFileRef = useRef<HTMLInputElement | null>(null);
    const handleImportScene = useCallback(async (file: File) => {
        setImportStatus(`Importing ${file.name}…`);
        try {
            const text = await file.text();
            const result = importSceneCode(text);
            if (!result.ok) throw new Error(result.errors.join('; '));
            if (result.operations.some((op: any) => op.op === 'node.remove') && !window.confirm('This import removes existing objects. Import this scene?')) { setImportStatus('Import cancelled'); return; }
            const committed = await commitOps(result.operations, { source: 'import', prompt: `Import scene from ${file.name}` });
            setImportStatus(committed ? `Imported ${file.name}` : `Could not finish importing ${file.name}`);
        } catch (error: any) { setImportStatus(`Import failed: ${file.name}`); setLastError(error.message); }
    }, [commitOps]);

    /** Files dropped on the viewport: import to the library, then apply. */    const handleViewportDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) {
            setImportStatus(`Importing ${file.name}…`);
            try {
                const buf = await file.arrayBuffer();
                let binary = '';
                const bytes = new Uint8Array(buf);
                for (let i = 0; i < bytes.length; i += 0x8000) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                }
                const asset = await api.importLocalAsset({ name: file.name, contentBase64: btoa(binary) });
                const applied = asset.kind === 'model' ? await applyAsset(asset, 'scene')
                    : asset.kind === 'texture' ? await applyAsset(asset, 'selection')
                    : asset.kind === 'hdr' ? await applyAsset(asset, 'environment') : null;
                setImportStatus(applied ? `Imported ${file.name} into scene` : `${file.name} saved to library; not applied`);
            } catch (err: any) {
                setImportStatus(`Import failed: ${file.name}`);
                setLastError(`import: ${err.message}`);
            }
        }
    }, [applyAsset]);

    return (
        <div ref={workbench} className={`omneon-workspace ${resizing ? 'is-resizing' : ''}`} style={{
            '--tree-width': `${sizes.tree}px`, '--inspector-width': `${sizes.inspector}px`,
            '--timeline-height': `${sizes.timeline}px`, '--chat-height': `${sizes.chat}px`,
        } as React.CSSProperties}>
            <div className="omneon-main">
                <div className="omneon-toolbar">
                    <span className="omneon-toolbar-title">{project?.name || 'Scene'}</span>
                    <select className="omneon-branch-select" aria-label="Scene branch" value={branch?.id || ''} disabled={saveStatus === 'saving'} onChange={e => switchBranch(e.target.value)}>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <div className="omneon-toolbar-actions">
                        {(['translate', 'rotate', 'scale'] as const).map(mode => <button key={mode} aria-pressed={transformMode === mode} className={transformMode === mode ? 'omneon-active' : ''} onClick={() => setTransformMode(transformMode === mode ? null : mode)}>{mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale'}</button>)}
                        <button aria-pressed={snapping} className={snapping ? 'omneon-active' : ''} title="Snap: position 0.5, rotation 15°, scale 0.1" onClick={() => setSnapping(s => !s)}>Snap</button>
                        <details className="omneon-toolbar-overflow" onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); } }} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}>
                            <summary>More</summary>
                            <div className="omneon-overflow-content">
                                <h4>Add objects</h4>
                                <button disabled={!branch} onClick={() => commitOps([{ op: 'node.add', node: { name: 'Box', kind: 'mesh', geometry: { type: 'box' } } }], { source: 'manual' })}>Add box</button>
                                <button disabled={!branch} onClick={() => commitOps([{ op: 'node.add', node: { name: 'Sphere', kind: 'mesh', geometry: { type: 'sphere' } } }], { source: 'manual' })}>Add sphere</button>
                                <button disabled={!branch} onClick={() => commitOps([{ op: 'node.add', node: { name: 'Sun', kind: 'light', light: { type: 'directional', intensity: 1.5 }, transform: { position: { x: 4, y: 6, z: 4 } } } }], { source: 'manual' })}>Add light</button>
                                <h4>Canvas</h4>
                                <button onClick={() => setSpaceMode(s => s === 'world' ? 'local' : 'world')}>Space: {spaceMode}</button>
                                <button aria-pressed={lassoActive} onClick={() => { setLassoActive(!lassoActive); toggleLasso(!lassoActive); }}>Rectangle selection {lassoActive ? 'on' : 'off'}</button>
                                <button aria-pressed={splitView} onClick={() => toggleSplit(!splitView, secondaryView)}>Split view {splitView ? 'on' : 'off'}</button>
                                {splitView && <select aria-label="Secondary view" value={secondaryView} onChange={e => {
                                    const value = e.target.value as typeof secondaryView; setSecondaryView(value);
                                    bridgeRef.current?.send({ type: 'setViewport', mode: 'split', secondary: value });
                                }}><option value="top">Top</option><option value="front">Front</option><option value="side">Side</option><option value="persp">Perspective</option></select>}
                                <h4>Physics</h4>
                                <button disabled={!runtimeReady} onClick={() => bridgeRef.current?.send({ type: physicsState.running ? 'physicsPause' : 'physicsStart' })}>{physicsState.running ? 'Pause physics' : 'Run physics'}</button>
                                <button disabled={!runtimeReady} onClick={() => bridgeRef.current?.send({ type: 'physicsStep' })}>Step one frame</button>
                                <button disabled={!runtimeReady} onClick={() => bridgeRef.current?.send({ type: 'physicsReset' })}>Reset simulation</button>
                                <button disabled={!runtimeReady || !branch} onClick={() => bridgeRef.current?.send({ type: 'physicsBake', duration: 3, fps: 30 })}>Bake 3 seconds to keyframes</button>
                                <h4>Collections & files</h4>
                                <button disabled={!branch} onClick={() => { setLastError(null); setCollectionKind('materials'); }}>Browse materials</button>
                                <button disabled={!branch} onClick={() => { setLastError(null); setCollectionKind('worlds'); }}>Browse worlds</button>
                                <button onClick={() => window.open(`/api/packager/artifacts/${artifact.id}/export`, '_blank')}>Export web app ZIP</button>
                                <button disabled={!branch} onClick={() => importFileRef.current?.click()}>Import scene…</button>
                            </div>
                        </details>
                        <input ref={importFileRef} type="file" accept=".ts,.js,.json" hidden onChange={e => { const file = e.target.files?.[0]; if (file) handleImportScene(file); e.target.value = ''; }} />
                    </div>
                </div>
                <div className="omneon-panel-controls" role="group" aria-label="Workbench panels">
                    {(['tree', 'inspector', 'timeline', 'chat'] as const).map(panel => <button key={panel} aria-controls={`omneon-${panel}-panel`} aria-expanded={panels[panel]} className={panels[panel] ? 'omneon-active' : ''} onClick={() => togglePanel(panel)}>{panel === 'tree' ? 'Objects' : panel === 'chat' ? 'Chat' : panel === 'timeline' ? 'Timeline' : 'Inspector'}</button>)}
                    <span className="omneon-toolbar-hint">{document.nodes.length} objects{checkoutRevision ? ' · Earlier revision' : ''}</span>
                </div>
                <div className="omneon-content-row">
                    <div id="omneon-tree-panel" className="omneon-tree-rail" hidden={!panels.tree}>
                        <div className="omneon-panel-heading"><strong>Objects</strong><button aria-label="Collapse objects" onClick={() => togglePanel('tree')}>Hide</button></div>
                        <SceneGraph
                            document={document}
                            selection={selection}
                            onSelect={selectNodes}
                            onCommitOps={ops => commitOps(ops, { source: 'manual' })}
                            onAskAI={askAboutSelection}
                        />
                    </div>
                    {panels.tree && <PanelResizeHandle label="Resize objects" value={sizes.tree} min={180} max={420} onChange={value => resizePanel('tree', value)} onResizing={setResizing} />}
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
                    {lastError && <div className="omneon-error" role="alert"><span>{lastError}</span><button onClick={() => setLastError(null)} aria-label="Dismiss error">Dismiss</button></div>}
                    {checkoutRevision && (
                        <div className="omneon-checkout-banner">
                            <span className="omneon-compare-left">← this revision</span>
                            <span>Comparing: revision vs current head →</span>
                            <button onClick={() => useThisVersion(checkoutRevision)}>Use Left</button>
                            <button onClick={backToHead}>Use Right</button>
                            <button onClick={() => { setInspectorTab('history'); setPanels(p => ({ ...p, inspector: true })); }}>Selectively Apply…</button>
                        </div>
                    )}
                    </div>
                </div>

                {panels.timeline && <PanelResizeHandle label="Resize timeline" vertical reverse value={sizes.timeline} min={140} max={440} onChange={value => resizePanel('timeline', value)} onResizing={setResizing} />}
                <section id="omneon-timeline-panel" className="omneon-timeline-panel" hidden={!panels.timeline}>
                <div className="omneon-panel-heading"><strong>Timeline</strong><button aria-label="Collapse timeline" onClick={() => togglePanel('timeline')}>Hide</button></div>
                <TimelinePanel
                    document={document}
                    selection={selection}
                    playing={playback.playing}
                    time={playback.time}
                    duration={playback.duration}
                    disabled={saveStatus === 'saving' || !branch}
                    onPlay={(nodeId, clipId) => bridgeRef.current?.send({ type: 'play', nodeId, clipId })}
                    onPause={() => bridgeRef.current?.send({ type: 'pause' })}
                    onSeek={(t, nodeId, clipId) => { setPlayback(p => ({ ...p, time: t })); bridgeRef.current?.send({ type: 'seek', time: t, nodeId, clipId }); }}
                    onCommitOps={(ops, prompt) => commitOps(ops, { source: 'timeline', prompt })}
                />

                </section>
                {panels.chat && <PanelResizeHandle label="Resize chat" vertical reverse value={sizes.chat} min={140} max={500} onChange={value => resizePanel('chat', value)} onResizing={setResizing} />}
                <div id="omneon-chat-panel" className="omneon-chat" hidden={!panels.chat}>
                    <div className="omneon-panel-heading"><strong>Scene chat</strong><button aria-label="Collapse chat" onClick={() => togglePanel('chat')}>Hide</button></div>
                    <div className="omneon-chat-messages">
                        {!messages.length && <p className="omneon-help">Describe a change to your scene. Review the affected objects and preview before applying it.</p>}
                        {messages.map(m => (
                            <div key={m.id} className={`omneon-msg omneon-msg-${m.role} ${m.status === 'discarded' ? 'omneon-msg-discarded' : ''}`}>
                                <div className="omneon-msg-text">{m.explanation || m.text}</div>
                                {m.role === 'assistant' && m.operations && m.status === 'pending' && (
                                    <ProposalReview open={reviewMessageId === m.id} onToggle={() => setReviewMessageId(reviewMessageId === m.id ? null : m.id)} document={document} operations={m.operations} busy={busy || saveStatus === 'saving'}
                                        onApply={() => applyProposal(m)} onBranch={() => tryOnNewBranch(m)}
                                        onRevise={() => setInput(`Revise: ${m.explanation || m.text} — `)} onDiscard={() => discardProposal(m)} />
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
                            aria-label="Message scene assistant"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder='Try "add a sphere", "make it glass", "have it orbit the cube"…'
                            disabled={busy || !conversation}
                        />
                        <button onClick={handleSend} disabled={busy || !conversation || !input.trim()}>Send</button>
                    </div>
                </div>
                <div className="omneon-statusbar" role="status" aria-live="polite">
                    <span className={saveStatus === 'failed' ? 'omneon-field-error' : ''}>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'failed' ? 'Save failed · edits retained' : 'Saved'}</span>
                    {saveStatus === 'failed' && <button onClick={() => commitOps([], { source: 'recovery', prompt: 'Save recovered edits' })}>Retry save</button>}
                    <span title={runtimeError || undefined}>{runtimeError ? 'Runtime error' : runtimeReady ? 'Runtime ready' : 'Starting runtime…'}</span>
                    <span>{importStatus || 'Import ready'}</span>
                    {!branch && <span>Connecting history…</span>}
                </div>
            </div>

            {panels.inspector && <PanelResizeHandle label="Resize inspector" reverse value={sizes.inspector} min={260} max={520} onChange={value => resizePanel('inspector', value)} onResizing={setResizing} />}
            <div id="omneon-inspector-panel" className="omneon-inspector" hidden={!panels.inspector}>
                <div className="omneon-panel-heading"><strong>Inspector</strong><button aria-label="Collapse inspector" onClick={() => togglePanel('inspector')}>Hide</button></div>
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
                            <SelectionInspector key={node.id} node={node} document={document} disabled={saveStatus === 'saving' || !branch} onCommitOps={(ops, prompt) => commitOps(ops, { source: 'inspector', prompt })} />
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
                                            if (backToHead()) {
                                                commitOps(chosen, { source: 'compare', prompt: `Selectively applied ${chosen.length} op(s) from revision` });
                                                setSelectiveOps(new Set());
                                            }
                                        }}
                                    >Apply {selectiveOps.size > 0 ? `${selectiveOps.size} ` : ''}selected to head</button>
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>
            {collectionKind && <CollectionPicker key={collectionKind} kind={collectionKind} document={document} error={lastError} onClose={() => setCollectionKind(null)} onApply={(ops, name) => commitOps(ops, { source: 'template', prompt: `Apply ${name}`, expectedDocument: document })} />
  }  </div>
    );
};

export default OmneonWorkspace;
