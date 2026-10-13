import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatMode, MockupViewport, MockupWireframe, WorkspaceSettings } from '../types';
import { generateId } from '../utils';
import * as api from '../lib/api';
import { useToast } from '../components/Toast';
import type { GenerationNoticeView, NoticeAction } from '../components/GenerationNotice';
import {
    llmGenerate,
    loadProviderConfig,
    saveProviderConfig,
    ProviderConfig,
    GenRequest,
    GenImage,
} from '../lib/providers';
import { pickImageModel, providerForModel, DEFAULT_TEXT_MODEL, replaceRetiredModelId } from '../lib/models';
import {
    discussSystemPrompt,
    buildDiscussUserPrompt,
    artifactSystemPrompt,
    buildStyleDirectionsPrompt,
    buildArtifactUserPrompt,
    buildScreensPlanPrompt,
    buildScreenArtifactPrompt,
    mockupSystemPrompt,
    buildMockupUserPrompt,
    buildResumePrompt,
    buildFixPrompt,
    resolveEffectivePrompt,
    splitEffectivePrompt,
} from '../lib/prompts';
import { getOverrides, setOverride, clearOverride } from '../lib/promptStore';
import { wireframeFor } from '../lib/mockupBlueprint';
import { newSpriteDoc } from '../features/sprites/store';
import { IMAGE_MODEL } from '../features/sprites/engine';
import { runGeneration, RunResult } from '../lib/generation/runner';
import {
    GenIssue,
    Diagnostics,
    RecoveryMode,
    ISSUE_TITLES,
    PROVIDER_LEVEL_KINDS,
    preflight,
    classifyError,
    emptyIssue,
    suggestFallbackModel,
    modelLabel,
    encodeDiagnostics,
    parseDiagnostics,
} from '../lib/generation/issues';

type MockupArgs = { description: string; blueprint: string; viewport: MockupViewport; wireframe: MockupWireframe };
type ImplementJob = { label: string; userPrompt: string; image: GenImage | null };
type RunImplement = (promptText: string, images: GenImage[], modelOverride?: string) => Promise<boolean>;
type RunMockup = (args: MockupArgs, modelOverride?: string, onStarted?: () => void) => Promise<boolean>;

/** A generation that failed before producing anything — no artifact exists, so it's retried from here. */
interface PendingFailure {
    source: 'implement' | 'mockup';
    issue: GenIssue;
    needsImage: boolean;
    retry: (model?: string) => Promise<boolean>;
}

/** Resolves true once streaming starts, or with the run's result if it never does. */
function untilStarted(run: (onStarted: () => void) => Promise<boolean>): Promise<boolean> {
    return new Promise(resolve => { run(() => resolve(true)).then(resolve); });
}

const SETTINGS_LS = 'builderbrock.settings';

const DEFAULT_SETTINGS: WorkspaceSettings = {
    model: DEFAULT_TEXT_MODEL,
    temperature: 1.0,
    artifactCount: 3,
    generationMode: 'variants',
    screenCount: 3,
    matchImageExactly: false,
    calibration: null,
};

function loadSettings(): WorkspaceSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_LS);
        if (raw) {
            const saved = JSON.parse(raw) as Partial<WorkspaceSettings>;
            return {
                ...DEFAULT_SETTINGS,
                ...saved,
                model: replaceRetiredModelId(saved.model || DEFAULT_SETTINGS.model),
            };
        }
    } catch {
        /* ignore */
    }
    return DEFAULT_SETTINGS;
}

export function useWorkspace() {
    // Projects & artifacts from DB
    const [projects, setProjects] = useState<any[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

    // Chat
    const [chatMessages, setChatMessages] = useState<Map<string, ChatMessage[]>>(new Map());
    const [chatMode, setChatMode] = useState<ChatMode>('discuss');

    // Settings + provider credentials + editable prompt overrides
    const [settings, setSettings] = useState<WorkspaceSettings>(loadSettings);
    const [providerConfig, setProviderConfig] = useState<ProviderConfig>(loadProviderConfig);
    const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>(getOverrides);

    // Loading states
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);

    // Image upload — up to 3 reference images in multi-screen mode (one per screen), 1 otherwise
    const [uploadedImages, setUploadedImages] = useState<{ data: string; mimeType: string }[]>([]);

    // Settings panel
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Generation failures with nothing to show yet, and in-session requests by artifact id (keeps images for retries)
    const [lastFailure, setLastFailure] = useState<PendingFailure | null>(null);
    const requestsRef = useRef(new Map<string, GenRequest>());

    const { toasts, addToast, dismissToast } = useToast();

    // Load projects on mount; first flag rows left "streaming" by a closed/reloaded tab as interrupted
    useEffect(() => {
        api.sweepInterruptedArtifacts()
            .catch(() => {})
            .finally(() => api.getProjects().then(setProjects).catch(() => {}));
    }, []);

    // Persist settings so model / prompt / calibration choices survive reloads
    useEffect(() => {
        try {
            localStorage.setItem(SETTINGS_LS, JSON.stringify(settings));
        } catch {
            /* ignore */
        }
    }, [settings]);

    // Derived state
    const selectedProject = projects.find(p => p.id === selectedProjectId) || null;
    const selectedArtifact = selectedProject?.artifacts?.find((a: any) => a.id === selectedArtifactId) || null;
    const selectedWireframe = wireframeFor(selectedProject, selectedArtifact);

    const selectProject = useCallback(async (projectId: string) => {
        setSelectedProjectId(projectId);
        setSelectedArtifactId(null);
        try {
            const project = await api.getProject(projectId);
            setProjects(prev => prev.map(p => p.id === projectId ? project : p));
            // Auto-select first artifact
            if (project.artifacts?.length > 0) {
                setSelectedArtifactId(project.artifacts[0].id);
            }
        } catch (e) {
            console.error('Failed to load project:', e);
        }
    }, []);

    const selectArtifact = useCallback((artifactId: string) => {
        setSelectedArtifactId(artifactId);
    }, []);

    const deleteProject = useCallback(async (projectId: string) => {
        try {
            await api.deleteProject(projectId);
            setProjects(prev => prev.filter(p => p.id !== projectId));
            if (selectedProjectId === projectId) {
                setSelectedProjectId(null);
                setSelectedArtifactId(null);
            }
        } catch (e) {
            console.error('Failed to delete project:', e);
            addToast('error', 'Failed to delete project');
        }
    }, [selectedProjectId, addToast]);

    const createNewProject = useCallback(() => {
        setSelectedProjectId(null);
        setSelectedArtifactId(null);
    }, []);

    // Omneon: create a 3D-scene project with one scene artifact and select it.
    // The artifact's `html` field carries the JSON-serialized SceneDocument for now;
    // steps 3–5 replace this with the canonical document + revision records.
    const createOmneonProject = useCallback(async (name: string, initialSceneJson: string) => {
        try {
            const project = await api.createProject({
                name: name.substring(0, 100) || 'Omneon Scene',
                prompt: name,
                mode: 'omneon',
                creationMode: 'omneon',
                settings: JSON.stringify(settings),
            });
            const artifact = await api.createArtifact({
                projectId: project.id,
                html: initialSceneJson,
                kind: 'scene',
                model: 'manual',
                temperature: 0,
                variantIndex: 0,
                variantLabel: 'Scene',
                status: 'complete',
                prompt: 'Initial scene',
            });
            const fullProject = await api.getProject(project.id);
            setProjects(prev => [fullProject, ...prev]);
            setSelectedProjectId(project.id);
            setSelectedArtifactId(artifact.id);
            addToast('success', `Created scene "${fullProject.name}"`);
        } catch (e: any) {
            console.error('Failed to create Omneon project:', e);
            addToast('error', `Scene creation failed: ${e.message || 'Unknown error'}`);
        }
    }, [settings, addToast]);

    // Sprite Studio: one project per session, holding one `sprites` artifact (SpriteDoc JSON).
    const createSpriteProject = useCallback(async (name?: string) => {
        try {
            const project = await api.createProject({
                name: name?.trim().substring(0, 100) || `Sprites ${new Date().toLocaleString()}`,
                mode: 'sprites',
                creationMode: 'sprites',
                settings: JSON.stringify(settings),
            });
            const artifact = await api.createArtifact({
                projectId: project.id,
                html: JSON.stringify(newSpriteDoc()),
                kind: 'sprites',
                model: IMAGE_MODEL,
                variantLabel: 'Sprite session',
                status: 'complete',
            });
            const fullProject = await api.getProject(project.id);
            setProjects(prev => [fullProject, ...prev]);
            setSelectedProjectId(project.id);
            setSelectedArtifactId(artifact.id);
        } catch (e: any) {
            console.error('Failed to create sprite session:', e);
            addToast('error', `Sprite session creation failed: ${e.message || 'Unknown error'}`);
        }
    }, [settings, addToast]);

    const updateSettings = useCallback((partial: Partial<WorkspaceSettings>) => {
        setSettings(prev => ({ ...prev, ...partial }));
    }, []);

    const updateProviderConfig = useCallback((partial: Partial<ProviderConfig>) => {
        setProviderConfig(prev => {
            const next = { ...prev, ...partial };
            saveProviderConfig(next);
            return next;
        });
    }, []);

    // Prompt overrides (persisted in the prompt store; builders read from it).
    const updatePromptOverride = useCallback((id: string, value: string) => {
        setOverride(id, value);
        setPromptOverrides(getOverrides());
    }, []);

    const resetPrompt = useCallback((id: string) => {
        clearOverride(id);
        setPromptOverrides(getOverrides());
    }, []);

    // Discuss mode: conversational AI, no code generation
    const handleDiscussMessage = useCallback(async (message: string) => {
        if (!message.trim() || isLoading) return;

        const artifactKey = selectedArtifactId || '__global__';
        const prevMessages = chatMessages.get(artifactKey) || [];
        const userMsg: ChatMessage = { role: 'user', text: message };
        const updatedMessages = [...prevMessages, userMsg];
        setChatMessages(prev => new Map(prev).set(artifactKey, updatedMessages));

        setIsLoading(true);
        try {
            const contextParts: string[] = [];
            const hasHighlightedContext = message.startsWith('[Highlighted lines');
            if (selectedProject) {
                contextParts.push(`Current project: "${selectedProject.name || selectedProject.prompt}"`);
            }
            if (selectedArtifact?.html && !hasHighlightedContext) {
                contextParts.push(`Current artifact HTML (first 2000 chars):\n${selectedArtifact.html.substring(0, 2000)}`);
            }

            const conversation = updatedMessages.map(m =>
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`
            ).join('\n');

            const responseText = await llmGenerate({
                model: settings.model,
                system: discussSystemPrompt(),
                prompt: buildDiscussUserPrompt({ contextParts, conversation }),
                temperature: settings.temperature,
                reasoningEffort: settings.reasoningEffort,
            }, providerConfig);

            const modelMsg: ChatMessage = { role: 'model', text: responseText || 'I couldn\'t generate a response.' };
            setChatMessages(prev => new Map(prev).set(artifactKey, [...updatedMessages, modelMsg]));
        } catch (e: any) {
            const issue = classifyError(e, settings.model);
            const errorMsg: ChatMessage = { role: 'model', text: `${ISSUE_TITLES[issue.kind]}: ${issue.message}` };
            setChatMessages(prev => new Map(prev).set(artifactKey, [...updatedMessages, errorMsg]));
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, chatMessages, selectedArtifactId, selectedProject, selectedArtifact, settings, providerConfig]);

    /* ---------------- generation: shared plumbing ---------------- */

    const patchArtifact = useCallback((id: string, patch: Record<string, any>) => {
        setProjects(prev => prev.map(p => !(p.artifacts || []).some((a: any) => a.id === id) ? p : {
            ...p,
            artifacts: p.artifacts.map((a: any) => a.id === id ? { ...a, ...patch } : a),
        }));
    }, []);

    // Persist a finished run: complete (+warnings) | partial (keeps what arrived) | error.
    const settleArtifact = useCallback(async (id: string, result: RunResult) => {
        const patch = result.ok
            ? { html: result.html, status: 'complete', errorMessage: encodeDiagnostics({ warnings: result.warnings }) }
            : { html: result.html, status: result.html.trim() ? 'partial' : 'error', errorMessage: encodeDiagnostics({ issue: result.issue }) };
        patchArtifact(id, patch);
        await api.updateArtifact(id, patch).catch(e => console.error('Failed to save generation result:', e));
    }, [patchArtifact]);

    const dropProject = useCallback((projectId: string) => {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        setSelectedProjectId(cur => cur === projectId ? null : cur);
        api.deleteProject(projectId).catch(() => {});
    }, []);

    const openProviders = useCallback(() => {
        setSettingsOpen(true);
        setTimeout(() => document.getElementById('settings-providers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }, []);

    // Latest runners, so retry closures never call a stale copy (old keys/settings).
    const latest = useRef<{ runImplement: RunImplement; runMockup: RunMockup }>(null!);

    /* ---------------- implement mode ---------------- */

    const runImplement: RunImplement = useCallback(async (promptText: string, images: GenImage[], modelOverride?: string) => {
        if (isLoading) return false;
        setIsLoading(true);
        setIsStreaming(true);
        setLastFailure(null);

        const imageToUse = images[0] || null;
        const shouldMatchExactly = Boolean(imageToUse && settings.matchImageExactly);
        const isScreensMode = settings.generationMode === 'screens';
        const artifactCount = isScreensMode ? 1 : settings.artifactCount;
        // Route by capability: image work needs an image-capable model; otherwise honor selection.
        const genModel = modelOverride || (imageToUse ? pickImageModel(settings.model) : settings.model);
        const fail = (issue: GenIssue) => setLastFailure({
            source: 'implement',
            issue,
            needsImage: Boolean(imageToUse),
            retry: model => latest.current.runImplement(promptText, images, model),
        });

        try {
            const pre = preflight(genModel, providerConfig);
            if (pre) {
                fail(pre);
                return false;
            }

            // Step 1: Plan the generation — one prompt (and optional per-job image) per artifact to produce.
            let jobs: ImplementJob[] = [];
            try {
                if (isScreensMode) {
                    // One OPTION per generation: a single style direction + theme applied
                    // across 2-3 screens, each generated as its own HTML file (artifact).
                    // With reference images attached, each image defines one screen.
                    const screenCount = images.length >= 2
                        ? Math.min(3, images.length)
                        : Math.min(3, Math.max(2, settings.screenCount || 3));
                    let direction = 'Unified Theme';
                    let theme = '';
                    let screens: string[] = [];

                    const planText = await llmGenerate({
                        model: genModel,
                        prompt: buildScreensPlanPrompt({
                            count: screenCount,
                            goal: promptText.trim(),
                            imageCount: images.length,
                        }),
                        images,
                        reasoningEffort: settings.reasoningEffort,
                    }, providerConfig);

                    const jsonMatch = planText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const plan = JSON.parse(jsonMatch[0]);
                            if (plan.direction) direction = String(plan.direction);
                            if (plan.theme) theme = String(plan.theme);
                            if (Array.isArray(plan.screens)) screens = plan.screens.map(String);
                        } catch (e) {}
                    }
                    if (screens.length < screenCount) {
                        screens = ['Home', 'Details', 'Settings'].slice(0, screenCount);
                    }
                    screens = screens.slice(0, screenCount);
                    if (!theme) {
                        theme = `Derive a single cohesive theme for "${direction}" and apply it identically on every screen.`;
                    }

                    jobs = screens.map((screenName, i) => ({
                        label: `${direction} — ${screenName}`,
                        userPrompt: buildScreenArtifactPrompt({
                            goal: promptText.trim(),
                            direction,
                            theme,
                            screenName,
                            screenIndex: i,
                            screens,
                            hasImage: Boolean(images[i]),
                            calibration: settings.calibration,
                        }),
                        image: images[i] || null,
                    }));
                } else {
                    let generatedStyles: string[] = [];

                    if (imageToUse && shouldMatchExactly) {
                        generatedStyles = Array(artifactCount).fill('Exact Match');
                    } else {
                        const styleText = await llmGenerate({
                            model: genModel,
                            prompt: buildStyleDirectionsPrompt({
                                count: artifactCount,
                                goal: promptText.trim(),
                                hasImage: Boolean(imageToUse),
                            }),
                            image: imageToUse,
                            reasoningEffort: settings.reasoningEffort,
                        }, providerConfig);

                        const jsonMatch = styleText.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                            try { generatedStyles = JSON.parse(jsonMatch[0]); } catch (e) {}
                        }
                    }

                    if (!generatedStyles || generatedStyles.length < artifactCount) {
                        generatedStyles = Array.from({ length: artifactCount }, (_, i) =>
                            ['Default Variant', 'Creative Interpretation', 'Dark Mode'][i] || `Variant ${i + 1}`
                        );
                    }
                    generatedStyles = generatedStyles.slice(0, artifactCount);

                    jobs = generatedStyles.map(style => ({
                        label: style,
                        userPrompt: buildArtifactUserPrompt({
                            goal: promptText.trim(),
                            direction: style,
                            hasImage: Boolean(imageToUse),
                            matchExactly: shouldMatchExactly,
                            calibration: settings.calibration,
                        }),
                        image: imageToUse,
                    }));
                }
            } catch (e) {
                fail(classifyError(e, genModel));
                return false;
            }

            // Step 2: Stream each artifact. The project + each artifact row are created
            // only when that stream's first token arrives, so dead requests leave nothing behind.
            const displayPrompt = promptText.trim() || 'UI from uploaded image';
            const systemPrompt = artifactSystemPrompt();
            let projectPromise: Promise<any> | null = null;
            const ensureProject = () => {
                if (!projectPromise) {
                    projectPromise = api.createProject({
                        name: displayPrompt.substring(0, 100),
                        prompt: displayPrompt,
                        mode: providerForModel(genModel) === 'openai' ? 'openai' : (genModel.includes('pro') ? 'pro' : 'flash'),
                        settings: JSON.stringify(settings),
                    }).then(project => {
                        setProjects(prev => [project, ...prev]);
                        setSelectedProjectId(project.id);
                        return project;
                    });
                }
                return projectPromise;
            };

            let selected = false;
            const createRow = async (job: ImplementJob, variantIndex: number, req: GenRequest): Promise<string> => {
                const project = await ensureProject();
                const artifact = await api.createArtifact({
                    projectId: project.id,
                    html: '',
                    model: req.model,
                    temperature: settings.temperature,
                    variantIndex,
                    variantLabel: job.label,
                    status: 'streaming',
                    prompt: resolveEffectivePrompt(systemPrompt, job.userPrompt),
                });
                requestsRef.current.set(artifact.id, req);
                setProjects(prev => prev.map(p => p.id === project.id
                    ? { ...p, artifacts: [...(p.artifacts || []), { ...artifact, html: '' }] }
                    : p
                ));
                if (!selected) {
                    selected = true;
                    setSelectedArtifactId(artifact.id);
                }
                return artifact.id;
            };

            const outcomes = await Promise.all(jobs.map(async (job, i) => {
                const req: GenRequest = {
                    model: genModel,
                    system: systemPrompt,
                    prompt: job.userPrompt,
                    image: job.image,
                    temperature: settings.temperature,
                    reasoningEffort: settings.reasoningEffort,
                };
                const row = { id: null as string | null };
                const result = await runGeneration(req, providerConfig, {
                    onStart: async () => { row.id = await createRow(job, i, req); },
                    onText: html => { if (row.id) patchArtifact(row.id, { html }); },
                    onCheckpoint: html => api.updateArtifact(row.id!, { html }),
                });
                if (row.id) await settleArtifact(row.id, result);
                return { job, i, req, result, row };
            }));

            if (!outcomes.some(o => o.row.id)) {
                if (projectPromise) (projectPromise as Promise<any>).then(p => dropProject(p.id), () => {});
                const first = outcomes[0]?.result;
                fail(!first || first.ok ? emptyIssue(genModel) : first.issue);
                return false;
            }

            // Some streams never started: give each a failed card so it can be retried in place.
            for (const o of outcomes) {
                if (o.row.id || o.result.ok) continue;
                const id = await createRow(o.job, o.i, o.req).catch(() => null);
                if (id) await settleArtifact(id, o.result);
            }

            const problems = outcomes.filter(o => !o.result.ok).length;
            addToast(problems ? 'info' : 'success', problems
                ? `${problems} of ${outcomes.length} didn't finish — open them for options`
                : 'Generation complete');
            setUploadedImages([]);
            return true;
        } catch (e: any) {
            console.error('Generation failed:', e);
            fail(classifyError(e, genModel));
            return false;
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [isLoading, settings, providerConfig, addToast, patchArtifact, settleArtifact, dropProject]);

    const handleSubmitPrompt = useCallback((promptText: string) => {
        if (!promptText.trim() && !uploadedImages.length) return;
        runImplement(promptText, uploadedImages);
    }, [uploadedImages, runImplement]);

    /* ---------------- mockup studio ---------------- */

    // Generates ONE artifact from a canvas blueprint + description.
    const runMockup: RunMockup = useCallback(async (args: MockupArgs, modelOverride?: string, onStarted?: () => void) => {
        if (isLoading) return false;
        setIsLoading(true);
        setIsStreaming(true);
        setLastFailure(null);

        const genModel = modelOverride || settings.model;
        const fail = (issue: GenIssue) => setLastFailure({
            source: 'mockup',
            issue,
            needsImage: false,
            retry: model => untilStarted(started => latest.current.runMockup(args, model, started)),
        });

        try {
            const systemPrompt = mockupSystemPrompt();
            const userPrompt = buildMockupUserPrompt({
                blueprint: args.blueprint,
                description: args.description,
                calibration: settings.calibration,
            });
            const req: GenRequest = {
                model: genModel,
                system: systemPrompt,
                prompt: userPrompt,
                temperature: settings.temperature,
                reasoningEffort: settings.reasoningEffort,
            };
            const displayPrompt = args.description || 'Design from mockup canvas';
            const row = { id: null as string | null };

            const result = await runGeneration(req, providerConfig, {
                onStart: async () => {
                    const project = await api.createProject({
                        name: displayPrompt.substring(0, 100),
                        prompt: displayPrompt,
                        mode: 'mockup',
                        settings: JSON.stringify({ ...settings, wireframe: args.wireframe }), // reopenable via "Open wireframe"
                    });
                    const artifact = await api.createArtifact({
                        projectId: project.id,
                        html: '',
                        model: genModel,
                        temperature: settings.temperature,
                        variantIndex: 0,
                        variantLabel: `Mockup — ${args.viewport}`,
                        status: 'streaming',
                        prompt: resolveEffectivePrompt(systemPrompt, userPrompt),
                    }).catch(e => {
                        api.deleteProject(project.id).catch(() => {});
                        throw e;
                    });
                    row.id = artifact.id;
                    requestsRef.current.set(artifact.id, req);
                    setProjects(prev => [{ ...project, artifacts: [{ ...artifact, html: '' }] }, ...prev]);
                    setSelectedProjectId(project.id);
                    setSelectedArtifactId(artifact.id);
                    onStarted?.();
                },
                onText: html => { if (row.id) patchArtifact(row.id, { html }); },
                onCheckpoint: html => api.updateArtifact(row.id!, { html }),
            });

            if (!row.id) {
                fail(result.ok ? emptyIssue(genModel) : result.issue);
                return false;
            }
            await settleArtifact(row.id, result);
            addToast(result.ok ? 'success' : 'info', result.ok ? 'Design generated and saved' : "Design didn't finish — see the preview for options");
            return true;
        } catch (e: any) {
            console.error('Mockup generation failed:', e);
            fail(classifyError(e, genModel));
            return false;
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [isLoading, settings, providerConfig, addToast, patchArtifact, settleArtifact]);

    latest.current = { runImplement, runMockup };

    // Resolves true as soon as streaming starts (so the studio can close), false if it never does.
    const handleMockupGenerate = useCallback((args: MockupArgs) =>
        untilStarted(started => latest.current.runMockup(args, undefined, started)), []);

    /* ---------------- recovery: retry / resume / fix an existing artifact ---------------- */

    const baseRequestFor = useCallback((artifact: any): GenRequest | null => {
        const known = requestsRef.current.get(artifact.id);
        if (known) return known;
        if (!artifact.prompt) return null;
        const { system, prompt } = splitEffectivePrompt(artifact.prompt);
        return {
            model: artifact.model,
            system,
            prompt,
            temperature: artifact.temperature ?? settings.temperature,
            reasoningEffort: settings.reasoningEffort,
        };
    }, [settings]);

    const recoverArtifact = useCallback(async (artifact: any, mode: RecoveryMode, modelOverride?: string): Promise<boolean> => {
        if (isLoading) return false;
        const base = baseRequestFor(artifact);
        if (!base) return false;
        const diag = parseDiagnostics(artifact.errorMessage);
        const model = modelOverride || base.model;
        const req: GenRequest =
            mode === 'resume' ? { ...base, model, prompt: buildResumePrompt({ original: base.prompt, partial: artifact.html }) }
            : mode === 'fix' ? { ...base, model, image: null, images: null, prompt: buildFixPrompt({ problems: (diag.warnings || []).map(w => w.message), html: artifact.html }) }
            : { ...base, model };
        const prefix = mode === 'resume' ? artifact.html : '';

        setIsLoading(true);
        setIsStreaming(true);
        setSelectedArtifactId(artifact.id);
        try {
            const result = await runGeneration(req, providerConfig, {
                onStart: async () => {
                    if (mode !== 'resume' && artifact.html?.trim()) { // keep the old version in history
                        await api.createRevision(artifact.id, { html: artifact.html, prompt: `Before ${mode === 'fix' ? 'fix' : 'regenerate'}` }).catch(() => {});
                    }
                    if (mode === 'retry') requestsRef.current.set(artifact.id, req);
                    patchArtifact(artifact.id, { status: 'streaming', html: prefix, model, errorMessage: null });
                    await api.updateArtifact(artifact.id, { status: 'streaming', model });
                },
                onText: html => patchArtifact(artifact.id, { html }),
                onCheckpoint: html => api.updateArtifact(artifact.id, { html }),
            }, prefix);

            if (!result.ok && !result.started) { // nothing came back — current version is untouched
                const errorMessage = encodeDiagnostics({ ...diag, issue: result.issue, failedAction: mode });
                patchArtifact(artifact.id, { errorMessage });
                api.updateArtifact(artifact.id, { errorMessage }).catch(() => {});
                return false;
            }
            await settleArtifact(artifact.id, result);
            return true;
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [isLoading, baseRequestFor, providerConfig, patchArtifact, settleArtifact]);

    const setDiagnostics = useCallback((id: string, d: Diagnostics) => {
        const errorMessage = encodeDiagnostics(d);
        patchArtifact(id, { errorMessage });
        api.updateArtifact(id, { errorMessage }).catch(() => {});
    }, [patchArtifact]);

    /* ---------------- notices (what the UI shows when something went wrong) ---------------- */

    const issueActions = (issue: GenIssue, model: string, needsImage: boolean, retry: (model?: string) => unknown): NoticeAction[] => {
        const actions: NoticeAction[] = [];
        if (issue.kind !== 'config') actions.push({ id: 'retry', label: 'Retry', primary: true, run: () => retry() });
        const fallback = suggestFallbackModel(model, providerConfig, needsImage);
        if (fallback) {
            actions.push(issue.kind === 'config'
                ? { id: 'fallback', label: `Switch to ${modelLabel(fallback)}`, primary: true, run: () => { updateSettings({ model: fallback }); return retry(fallback); } }
                : { id: 'fallback', label: `Retry with ${modelLabel(fallback)}`, run: () => retry(fallback) });
        }
        if (PROVIDER_LEVEL_KINDS.includes(issue.kind)) actions.push({ id: 'providers', label: 'Open Providers', run: openProviders });
        return actions;
    };

    const describeIssue = (issue: GenIssue, model: string) => ({
        title: ISSUE_TITLES[issue.kind],
        message: issue.message,
        meta: `${modelLabel(model)} · ${new Date(issue.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        detail: issue.detail,
    });

    const failureNotice = (source: PendingFailure['source']): GenerationNoticeView | null => {
        if (!lastFailure || lastFailure.source !== source) return null;
        const { issue } = lastFailure;
        return {
            tone: 'error',
            ...describeIssue(issue, issue.model),
            actions: issueActions(issue, issue.model, lastFailure.needsImage, lastFailure.retry),
            onDismiss: () => setLastFailure(null),
        };
    };

    const buildArtifactNotice = (a: any): GenerationNoticeView | null => {
        if (!a || a.kind === 'scene' || a.kind === 'sprites' || a.status === 'streaming') return null;
        const diag = parseDiagnostics(a.errorMessage);
        if (!diag.issue && a.status !== 'complete') { // older rows failed without a stored reason
            diag.issue = {
                kind: a.status === 'interrupted' ? 'interrupted' : 'unknown',
                message: "This generation didn't finish, and no reason was recorded.",
                model: a.model,
                at: Date.parse(a.updatedAt) || Date.now(),
            };
        }
        if (!diag.issue && !diag.warnings?.length) return null;

        const base = baseRequestFor(a);
        const needsImage = Boolean(base?.image || base?.images?.length);
        const hasHtml = Boolean(a.html?.trim());
        const run = (mode: RecoveryMode) => (model?: string) => recoverArtifact(a, mode, model);
        const noPrompt = base ? '' : " The original prompt wasn't saved, so it can't be re-run.";
        const resume: NoticeAction = { id: 'resume', label: 'Resume', primary: true, run: () => run('resume')() };
        const regenerate: NoticeAction = { id: 'regenerate', label: 'Regenerate', run: () => run('retry')() };

        if (diag.issue) {
            const issue = diag.issue;
            const model = issue.model || a.model;
            const resumable = hasHtml && (a.status === 'partial' || a.status === 'interrupted');
            if (resumable) {
                return {
                    tone: 'warning',
                    ...describeIssue(issue, model),
                    title: a.status === 'interrupted' ? ISSUE_TITLES.interrupted : `Stopped partway — ${ISSUE_TITLES[issue.kind].toLowerCase()}`,
                    message: `${issue.message} What arrived is shown below.${noPrompt}`,
                    actions: base
                        ? [resume, regenerate, ...issueActions(issue, model, needsImage, run('retry')).filter(x => x.id !== 'retry')]
                        : [],
                };
            }
            const failedMode: RecoveryMode = diag.failedAction || 'retry';
            const unchanged = a.status === 'complete' || a.status === 'partial' ? ' The current version is unchanged.' : '';
            return {
                tone: 'error',
                ...describeIssue(issue, model),
                message: `${issue.message}${unchanged}${noPrompt}`,
                actions: base ? issueActions(issue, model, needsImage, run(failedMode)) : issueActions(issue, model, false, () => {}).filter(x => x.id === 'providers'),
                onDismiss: a.status === 'complete' ? () => setDiagnostics(a.id, { warnings: diag.warnings }) : undefined,
            };
        }

        const warnings = diag.warnings!;
        const truncated = warnings.some(w => w.code === 'truncated');
        return {
            tone: 'warning',
            title: `${warnings.length} problem${warnings.length === 1 ? '' : 's'} found`,
            message: `The page may not work as intended.${noPrompt}`,
            items: warnings.map(w => w.message),
            actions: base
                ? [{ id: 'fix', label: 'Fix it', primary: true, run: () => run('fix')() }, ...(truncated ? [{ ...resume, primary: false }] : []), regenerate]
                : [],
            onDismiss: () => setDiagnostics(a.id, {}),
        };
    };

    const implementNotice = failureNotice('implement');
    const mockupNotice = failureNotice('mockup');
    const artifactNotice = buildArtifactNotice(selectedArtifact);

    // Cap depends on mode: multi-screen accepts one reference image per screen (max 3).
    const addUploadedImage = useCallback((image: { data: string; mimeType: string }) => {
        setUploadedImages(prev => {
            const max = settings.generationMode === 'screens' ? 3 : 1;
            if (max === 1) return [image];
            return prev.length >= max ? prev : [...prev, image];
        });
        if (settings.generationMode !== 'screens') {
            setSettings(prev => ({ ...prev, matchImageExactly: false }));
        }
    }, [settings.generationMode]);

    const removeUploadedImage = useCallback((index: number) => {
        setUploadedImages(prev => prev.filter((_, i) => i !== index));
        setSettings(prev => prev.matchImageExactly ? { ...prev, matchImageExactly: false } : prev);
    }, []);

    const isUserEditsProject = useCallback((projectId: string | null) => {
        if (!projectId) return false;
        const project = projects.find(p => p.id === projectId);
        return project?.mode === 'user-edits';
    }, [projects]);

    const saveToUserEdits = useCallback(async (html: string, name: string, sourceArtifactId: string | null) => {
        try {
            const userEditsProject = await api.getOrCreateUserEditsProject();

            // Ensure it's in local projects list
            setProjects(prev => {
                if (prev.some(p => p.id === userEditsProject.id)) {
                    return prev.map(p => p.id === userEditsProject.id ? userEditsProject : p);
                }
                return [userEditsProject, ...prev];
            });

            // If source is in User Edits, save as revision
            if (sourceArtifactId && isUserEditsProject(selectedProjectId)) {
                await api.createRevision(sourceArtifactId, {
                    html,
                    prompt: `Manual edit: ${name}`,
                });
                await api.updateArtifact(sourceArtifactId, { html });
                setProjects(prev => prev.map(p => ({
                    ...p,
                    artifacts: (p.artifacts || []).map((a: any) =>
                        a.id === sourceArtifactId ? { ...a, html } : a
                    )
                })));
                addToast('success', 'Revision saved');
                return;
            }

            // Otherwise create new artifact in User Edits
            const artifact = await api.createArtifact({
                projectId: userEditsProject.id,
                html,
                model: 'manual',
                temperature: 0,
                variantIndex: 0,
                variantLabel: name,
                status: 'complete',
                prompt: 'Manual edit',
            });

            setProjects(prev => prev.map(p => {
                if (p.id !== userEditsProject.id) return p;
                return { ...p, artifacts: [artifact, ...(p.artifacts || [])] };
            }));

            setSelectedProjectId(userEditsProject.id);
            setSelectedArtifactId(artifact.id);
            addToast('success', `Saved "${name}" to User Edits`);
        } catch (e: any) {
            console.error('Failed to save to User Edits:', e);
            addToast('error', `Save failed: ${e.message}`);
        }
    }, [projects, selectedProjectId, isUserEditsProject, addToast]);

    const handleUpdateArtifact = useCallback((id: string, newHtml: string, persist = true) => {
        // Update in-memory state
        setProjects(prev => prev.map(p => ({
            ...p,
            artifacts: (p.artifacts || []).map((a: any) =>
                a.id === id ? { ...a, html: newHtml } : a
            )
        })));

        // Omneon awaits persistence itself so it can display save failures.
        if (!persist) return;
        api.updateArtifact(id, { html: newHtml })
            .catch(e => console.error('Failed to update artifact:', e));
    }, []);

    // Arbitrary field patch (html, status, …) — local state + DB.
    const handlePatchArtifact = useCallback((id: string, patch: Record<string, any>) => {
        patchArtifact(id, patch);
        api.updateArtifact(id, patch).catch(e => console.error('Failed to update artifact:', e));
    }, [patchArtifact]);

    const sendMessage = useCallback((message: string) => {
        if (chatMode === 'discuss') {
            handleDiscussMessage(message);
        } else {
            handleSubmitPrompt(message);
        }
    }, [chatMode, handleDiscussMessage, handleSubmitPrompt]);

    return {
        // State
        projects,
        selectedProjectId,
        selectedArtifactId,
        selectedProject,
        selectedArtifact,
        selectedWireframe,
        chatMessages,
        chatMode,
        settings,
        providerConfig,
        promptOverrides,
        isLoading,
        isStreaming,
        uploadedImages,
        settingsOpen,
        toasts,

        // Actions
        selectProject,
        selectArtifact,
        sendMessage,
        handleSubmitPrompt,
        handleDiscussMessage,
        handleMockupGenerate,
        handleUpdateArtifact,
        handlePatchArtifact,
        implementNotice,
        mockupNotice,
        artifactNotice,
        isUserEditsProject,
        saveToUserEdits,
        setChatMode,
        updateSettings,
        updateProviderConfig,
        updatePromptOverride,
        resetPrompt,
        deleteProject,
        createNewProject,
        createOmneonProject,
        createSpriteProject,
        addUploadedImage,
        removeUploadedImage,
        setSettingsOpen,
        addToast,
        dismissToast,
    };
}
