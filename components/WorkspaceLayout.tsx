import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useResizable } from '../hooks/useResizable';
import Header from './Header.tsx';
import FileTree from './FileTree';
import ChatPanel from './ChatPanel';
import LivePreview from './LivePreview';
import CodeViewer from './CodeViewer';
import SettingsPanel from './SettingsPanel';
import RefinementStudio from './RefinementStudio';
import MockupStudio from './MockupStudio';
import OmneonWorkspace from '../features/omneon/OmneonWorkspace';
import SpriteStudio from '../features/sprites/SpriteStudio';
import { PROMPT_ID as SPRITE_PROMPT_ID } from '../features/sprites/engine';
import { getDefault } from '../lib/promptStore';
import { ArrowLeftIcon, ArrowRightIcon } from './Icons';
import { GenerationNoticeView } from './GenerationNotice';

const EDITOR_MIN_HEIGHT = 44; // px left for the code viewer's header bar when the preview is dragged fully down
import { Artifact, ChatMessage, ChatMode, MockupViewport, MockupWireframe, WorkspaceSettings } from '../types';
import { loadDraft, isEmptyWireframe } from '../lib/mockupBlueprint';
import { ProviderConfig } from '../lib/providers';

interface WorkspaceLayoutProps {
    // File tree
    projects: any[];
    selectedProjectId: string | null;
    selectedArtifactId: string | null;
    onSelectProject: (projectId: string) => void;
    onSelectArtifact: (artifactId: string) => void;
    onDeleteProject: (projectId: string) => void;
    onNewProject: () => void;

    // Chat
    chatMessages: ChatMessage[];
    chatMode: ChatMode;
    isLoading: boolean;
    uploadedImages: { data: string; mimeType: string }[];
    onSendMessage: (message: string) => void;
    onSetChatMode: (mode: ChatMode) => void;
    onImageUpload: (image: { data: string; mimeType: string }) => void;
    onRemoveImage: (index: number) => void;

    // Preview + code
    selectedArtifactHtml: string | null;
    isStreaming: boolean;

    // Settings
    settings: WorkspaceSettings;
    providerConfig: ProviderConfig;
    promptOverrides: Record<string, string>;
    settingsOpen: boolean;
    onUpdateSettings: (partial: Partial<WorkspaceSettings>) => void;
    onUpdateProviderConfig: (partial: Partial<ProviderConfig>) => void;
    onUpdatePromptOverride: (id: string, value: string) => void;
    onResetPrompt: (id: string) => void;
    onOpenSettings: () => void;
    onCloseSettings: () => void;

    // Refinement
    selectedArtifact: Artifact | null;
    onUpdateArtifact: (id: string, newHtml: string, persist?: boolean) => void;
    onPatchArtifact: (id: string, patch: Record<string, any>) => void;
    onCreateSprites: (name?: string) => void;

    // Mockup Studio (generative canvas) — resolves true once streaming starts
    onMockupGenerate: (args: { description: string; blueprint: string; viewport: MockupViewport; wireframe: MockupWireframe }) => Promise<boolean>;
    selectedWireframe: MockupWireframe | null;

    // Generation problems: before anything exists (implement / mockup) and on the selected artifact
    implementNotice: GenerationNoticeView | null;
    mockupNotice: GenerationNoticeView | null;
    artifactNotice: GenerationNoticeView | null;

    // Edit mode
    isUserEditsProject: boolean;
    onSaveToUserEdits: (html: string, name: string, artifactId: string | null) => void;
}

const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = (props) => {
    const [headerIntro, setHeaderIntro] = useState(true);
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [refinementOpen, setRefinementOpen] = useState(false);
    const [mockupOpen, setMockupOpen] = useState(false);
    const [studioWireframe, setStudioWireframe] = useState<MockupWireframe | null>(null);
    const [editPreviewHtml, setEditPreviewHtml] = useState<string | null>(null);
    const [highlightedLines, setHighlightedLines] = useState<Set<number>>(new Set());
    const editSourceRef = useRef<string | null>(null);
    const hasHighlights = highlightedLines.size > 0;

    // Clear highlights when switching artifacts
    useEffect(() => {
        setHighlightedLines(new Set());
    }, [props.selectedArtifactId]);

    // Escape clears highlights
    useEffect(() => {
        if (!hasHighlights) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setHighlightedLines(new Set());
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [hasHighlights]);

    const highlightMode = !!props.selectedArtifactHtml && !props.isStreaming;

    const openStudio = useCallback(() => {
        setStudioWireframe(null);
        setMockupOpen(true);
    }, []);

    // Loading a saved wireframe replaces the working draft, so confirm if there is one.
    const openWireframe = useCallback(() => {
        if (!props.selectedWireframe) return;
        if (!isEmptyWireframe(loadDraft()) && !window.confirm('Replace the wireframe currently in Mockup Studio with this one?')) return;
        setStudioWireframe(props.selectedWireframe);
        setMockupOpen(true);
    }, [props.selectedWireframe]);

    // Studio stays open until a retry actually starts streaming; Providers lives behind it, so close first.
    const studioNotice: GenerationNoticeView | null = props.mockupNotice && {
        ...props.mockupNotice,
        actions: props.mockupNotice.actions.map(action => ({
            ...action,
            run: async () => {
                if (action.id === 'providers') setMockupOpen(false);
                if (await action.run() === true) setMockupOpen(false);
            },
        })),
    };

    const guardedSelectProject = useCallback((projectId: string) => {
        if ((window as any).__codeViewerIsDirty?.()) {
            if (!(window as any).__codeViewerConfirmExit?.()) return;
        }
        props.onSelectProject(projectId);
    }, [props.onSelectProject]);

    const guardedSelectArtifact = useCallback((artifactId: string) => {
        if ((window as any).__codeViewerIsDirty?.()) {
            if (!(window as any).__codeViewerConfirmExit?.()) return;
        }
        props.onSelectArtifact(artifactId);
    }, [props.onSelectArtifact]);

    // Wrap sendMessage to inject highlighted line context
    const handleSendMessage = useCallback((message: string) => {
        const source = editSourceRef.current ?? props.selectedArtifactHtml;
        if (highlightedLines.size > 0 && source) {
            const allLines = source.split('\n');
            const sorted = [...highlightedLines].sort((a, b) => a - b);
            const excerpt = sorted
                .map(n => allLines[n - 1])
                .filter(l => l !== undefined)
                .join('\n');

            // Build range string for readability
            const ranges: string[] = [];
            let start = sorted[0], end = sorted[0];
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i] === end + 1) {
                    end = sorted[i];
                } else {
                    ranges.push(start === end ? `${start}` : `${start}-${end}`);
                    start = end = sorted[i];
                }
            }
            ranges.push(start === end ? `${start}` : `${start}-${end}`);

            const contextMessage = `[Highlighted lines ${ranges.join(', ')}]:\n${excerpt}\n\n${message}`;
            props.onSendMessage(contextMessage);
            setHighlightedLines(new Set());
        } else {
            props.onSendMessage(message);
        }
    }, [highlightedLines, props.selectedArtifactHtml, props.onSendMessage]);

    const columnResize = useResizable({
        property: '--left-width',
        direction: 'horizontal',
        min: 200,
        max: 500,
    });

    const fileTreeResize = useResizable({
        property: '--file-tree-height',
        direction: 'vertical',
        min: 100,
        max: 600,
    });

    const rightColumnRef = useRef<HTMLDivElement>(null);
    const previewResize = useResizable({
        property: '--preview-height',
        direction: 'vertical',
        min: 150,
        max: () => (rightColumnRef.current?.clientHeight ?? 800) - EDITOR_MIN_HEIGHT,
    });

    return (
        <div className={`workspace-container ${headerIntro ? 'is-header-intro' : ''}`}>
            <div className ="workspace-header">
                <Header
                    onActivate={() => setHeaderIntro(false)}
                    settingsOpen={props.settingsOpen}
                    onToggleSettings={props.settingsOpen ? props.onCloseSettings : props.onOpenSettings}
                    onOpenSprites={() => props.onCreateSprites()}
                    leftCollapsed={leftCollapsed}
                    onToggleCollapse={() => setLeftCollapsed(c => !c)}
                />
            </div>
        <div className={`workspace ${leftCollapsed ? 'left-collapsed' : ''}`}>
            {/* Left column: File tree + Chat */}
                <div className="left-column">
                    <FileTree
                        projects={props.projects}
                        selectedProjectId={props.selectedProjectId}
                        selectedArtifactId={props.selectedArtifactId}
                        onSelectProject={guardedSelectProject}
                        onSelectArtifact={guardedSelectArtifact}
                        onDeleteProject={props.onDeleteProject}
                        onNewProject={props.onNewProject}
                        onCreateOmneon={props.onCreateOmneon}
                        onCreateSprites={props.onCreateSprites}
                    />
                    <div
                        className="resize-handle vertical"
                        onMouseDown={fileTreeResize.onMouseDown}
                    />
                    <ChatPanel
                        messages={props.chatMessages}
                        chatMode={props.chatMode}
                        generationMode={props.settings.generationMode}
                        matchImageExactly={props.settings.matchImageExactly}
                        isLoading={props.isLoading}
                        uploadedImages={props.uploadedImages}
                        onSendMessage={handleSendMessage}
                        onSetChatMode={props.onSetChatMode}
                        onImageUpload={props.onImageUpload}
                        onRemoveImage={props.onRemoveImage}
                        onUpdateMatchImageExactly={(matchImageExactly) => props.onUpdateSettings({ matchImageExactly })}
                        highlightedLineCount={highlightedLines.size}
                        notice={props.implementNotice}
                    />
                </div>


            {/* Column resize handle / collapse toggle - hidden when header is expanded */}
            <div className={`left-column-edge ${headerIntro ? '' : 'header-expanded'}`}>
                <button
                    className="workspace-collapse-toggle"
                    onClick={() => setLeftCollapsed(c => !c)}
                    title={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                >
                    {leftCollapsed ? <ArrowRightIcon /> : <ArrowLeftIcon />}
                </button>
                {!leftCollapsed && (
                    <div
                        className="resize-handle edge-resize"
                        onMouseDown={columnResize.onMouseDown}
                    />
                )}
            </div>

            {/* Right column: Preview + Code, or the Omneon / Sprite Studio workspace */}
            <div className="right-column" ref={rightColumnRef}>
                {props.selectedArtifact?.kind === 'sprites' ? (
                    <SpriteStudio
                        key={props.selectedArtifact.id}
                        artifact={props.selectedArtifact}
                        apiKey={props.providerConfig.geminiApiKey}
                        promptTemplate={props.promptOverrides[SPRITE_PROMPT_ID] ?? getDefault(SPRITE_PROMPT_ID)}
                        promptOverridden={SPRITE_PROMPT_ID in props.promptOverrides}
                        onUpdatePrompt={value => props.onUpdatePromptOverride(SPRITE_PROMPT_ID, value)}
                        onResetPrompt={() => props.onResetPrompt(SPRITE_PROMPT_ID)}
                        onPatchArtifact={props.onPatchArtifact}
                    />
                ) : props.selectedArtifact?.kind === 'scene' ? (
                    <OmneonWorkspace
                        project={props.selectedProject}
                        artifact={props.selectedArtifact}
                        onUpdateArtifact={props.onUpdateArtifact}
                        settings={props.settings}
                        providerConfig={props.providerConfig}
                    />
                ) : (
                    <>
                {!refinementOpen && (
                    <LivePreview
                        html={props.selectedArtifactHtml}
                        artifactId={props.selectedArtifactId}
                        isStreaming={props.isStreaming}
                        overrideHtml={editPreviewHtml}
                        notice={props.artifactNotice}
                        noticeDisabled={props.isLoading}
                        onOpenRefinement={() => setRefinementOpen(true)}
                        onOpenMockup={openStudio}
                        onOpenWireframe={props.selectedWireframe ? openWireframe : undefined}
                    />
                )}
                <div
                    className="resize-handle vertical"
                    onMouseDown={previewResize.onMouseDown}
                />
                <CodeViewer
                    html={props.selectedArtifactHtml}
                    isStreaming={props.isStreaming}
                    isUserEditsProject={props.isUserEditsProject}
                    selectedArtifactId={props.selectedArtifactId}
                    onEditPreview={setEditPreviewHtml}
                    onSave={props.onSaveToUserEdits}
                    highlightMode={highlightMode}
                    highlightedLines={highlightedLines}
                    onHighlightedLinesChange={setHighlightedLines}
                    editSourceRef={editSourceRef}
                />
                    </>
                )}
            </div>

            {/* Settings slide-in */}
            {props.settingsOpen && (
                <SettingsPanel
                    settings={props.settings}
                    providerConfig={props.providerConfig}
                    promptOverrides={props.promptOverrides}
                    onUpdateSettings={props.onUpdateSettings}
                    onUpdateProviderConfig={props.onUpdateProviderConfig}
                    onUpdatePromptOverride={props.onUpdatePromptOverride}
                    onResetPrompt={props.onResetPrompt}
                    onClose={props.onCloseSettings}
                />
            )}

            {/* Mockup Studio overlay (generative canvas) */}
            {mockupOpen && (
                <div className="refinement-overlay">
                    <MockupStudio
                        isLoading={props.isLoading}
                        notice={studioNotice}
                        initialWireframe={studioWireframe}
                        onGenerate={async (args) => {
                            if (await props.onMockupGenerate(args)) setMockupOpen(false);
                        }}
                        onClose={() => setMockupOpen(false)}
                    />
                </div>
            )}

            {/* Refinement Studio overlay */}
            {refinementOpen && props.selectedArtifact && (
                <div className="refinement-overlay">
                    <RefinementStudio
                        artifact={props.selectedArtifact}
                        onUpdateArtifact={props.onUpdateArtifact}
                        onClose={() => setRefinementOpen(false)}
                        model={props.settings.model}
                    />
                </div>
            )}
        </div>
        </div>
    );

};

export default WorkspaceLayout;
