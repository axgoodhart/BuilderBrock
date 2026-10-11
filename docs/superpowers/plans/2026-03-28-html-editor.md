# HTML Editor in CodeViewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable direct HTML editing in the CodeViewer with live preview, undo/redo, and save-to-User-Edits-project workflow.

**Architecture:** Double-click the CodeViewer to swap from `<pre>` to `<textarea>`. Edits update LivePreview via 500ms debounced `srcDoc`. A dedicated "User Edits" project (auto-created, `mode: 'user-edits'`) stores saved artifacts. Saving from a regular project creates a new artifact in User Edits (prompts for name). Saving from within User Edits creates a new revision.

**Tech Stack:** React, Prisma/SQLite, Express

---

## File Map

- **Modify:** `prisma/schema.prisma` — add unique mode marker for User Edits project
- **Modify:** `server/services/project.ts` — add `getOrCreateUserEditsProject()`
- **Modify:** `server/routes/projects.ts` — add `GET /api/projects/user-edits` endpoint
- **Modify:** `lib/api.ts` — add `getOrCreateUserEditsProject()` client function
- **Modify:** `components/CodeViewer.tsx` — add edit mode (textarea, undo/redo, toolbar, debounce, navigation guards)
- **Modify:** `components/WorkspaceLayout.tsx` — wire CodeViewer edit-mode props (save handler, project context)
- **Modify:** `components/LivePreview.tsx` — accept `overrideHtml` prop for live edit preview
- **Modify:** `hooks/useWorkspace.ts` — add `saveToUserEdits()` and `isUserEditsProject` helper
- **Modify:** `index.css` — add styles for edit mode textarea and toolbar

---

### Task 1: User Edits Project — Backend

**Files:**
- Modify: `server/services/project.ts`
- Modify: `server/routes/projects.ts`
- Modify: `lib/api.ts`

- [ ] **Step 1: Add `getOrCreateUserEditsProject` to project service**

In `server/services/project.ts`, add after the existing `touchProject` function:

```typescript
export async function getOrCreateUserEditsProject() {
  return withRetry(async () => {
    const existing = await prisma.project.findFirst({
      where: { mode: 'user-edits', status: { not: 'deleted' } },
      include: {
        artifacts: {
          where: { status: { not: 'discarded' } },
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { revisions: true } } },
        },
      },
    });
    if (existing) return existing;
    return prisma.project.create({
      data: {
        name: 'User Edits',
        mode: 'user-edits',
      },
      include: {
        artifacts: {
          where: { status: { not: 'discarded' } },
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { revisions: true } } },
        },
      },
    });
  });
}
```

- [ ] **Step 2: Add route for User Edits project**

In `server/routes/projects.ts`, add before the `GET /:id` route (so it doesn't match `:id`):

```typescript
// GET /api/projects/user-edits
router.get('/user-edits', async (_req: Request, res: Response) => {
  try {
    const project = await projectService.getOrCreateUserEditsProject();
    res.json(project);
  } catch (error) {
    console.error('Failed to get user-edits project:', error);
    res.status(500).json({ error: 'Failed to get user-edits project' });
  }
});
```

- [ ] **Step 3: Add API client function**

In `lib/api.ts`, add:

```typescript
export async function getOrCreateUserEditsProject() {
  return request<any>('/projects/user-edits');
}
```

- [ ] **Step 4: Verify the server compiles**

Run from the project root: `npx tsc --noEmit --project tsconfig.server.json` (or equivalent)

---

### Task 2: Workspace Hook — Save to User Edits

**Files:**
- Modify: `hooks/useWorkspace.ts`

- [ ] **Step 1: Add `saveToUserEdits` and `isUserEditsProject` to useWorkspace**

Add these after the existing `handleUpdateArtifact`:

```typescript
const isUserEditsProject = useCallback((projectId: string | null) => {
    if (!projectId) return false;
    const project = projects.find(p => p.id === projectId);
    return project?.mode === 'user-edits';
}, [projects]);

const saveToUserEdits = useCallback(async (html: string, name: string, sourceArtifactId?: string) => {
    try {
        // Get or create the User Edits project
        const userEditsProject = await api.getOrCreateUserEditsProject();

        // Ensure it's in our local projects list
        setProjects(prev => {
            if (prev.some(p => p.id === userEditsProject.id)) {
                return prev.map(p => p.id === userEditsProject.id ? userEditsProject : p);
            }
            return [userEditsProject, ...prev];
        });

        // If source is already in User Edits, create a revision on the source artifact
        if (sourceArtifactId && isUserEditsProject(selectedProjectId)) {
            await api.createRevision(sourceArtifactId, {
                html,
                prompt: `Manual edit: ${name}`,
            });
            await api.updateArtifact(sourceArtifactId, { html });

            // Update in-memory
            setProjects(prev => prev.map(p => ({
                ...p,
                artifacts: (p.artifacts || []).map((a: any) =>
                    a.id === sourceArtifactId ? { ...a, html } : a
                )
            })));
            addToast('success', 'Revision saved');
            return;
        }

        // Otherwise create a new artifact in User Edits
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

        // Update in-memory projects list
        setProjects(prev => prev.map(p => {
            if (p.id !== userEditsProject.id) return p;
            return {
                ...p,
                artifacts: [artifact, ...(p.artifacts || [])],
            };
        }));

        // Select the new artifact
        setSelectedProjectId(userEditsProject.id);
        setSelectedArtifactId(artifact.id);
        addToast('success', `Saved "${name}" to User Edits`);
    } catch (e: any) {
        console.error('Failed to save to User Edits:', e);
        addToast('error', `Save failed: ${e.message}`);
    }
}, [projects, selectedProjectId, isUserEditsProject, addToast]);
```

- [ ] **Step 2: Export the new functions**

Add `saveToUserEdits` and `isUserEditsProject` to the return object of `useWorkspace`.

---

### Task 3: CodeViewer Edit Mode

**Files:**
- Modify: `components/CodeViewer.tsx`

This is the core task. The CodeViewer gains: double-click entry, textarea editor, undo/redo history stack, 500ms debounced preview callback, manual-refresh toggle, navigation guards, save dialog.

- [ ] **Step 1: Rewrite CodeViewer with edit mode**

Replace the full `components/CodeViewer.tsx` with:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CopyIcon, CheckIcon, CloseIcon } from './Icons';

interface CodeViewerProps {
    html: string | null;
    isStreaming: boolean;
    isUserEditsProject: boolean;
    selectedArtifactId: string | null;
    onEditPreview: (html: string | null) => void;
    onSave: (html: string, name: string, artifactId: string | null) => void;
}

const UndoIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
);
const RedoIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
    </svg>
);
const SaveIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
);
const RefreshIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
    </svg>
);

const CodeViewer: React.FC<CodeViewerProps> = ({
    html,
    isStreaming,
    isUserEditsProject,
    selectedArtifactId,
    onEditPreview,
    onSave,
}) => {
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editHtml, setEditHtml] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [manualRefresh, setManualRefresh] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveName, setSaveName] = useState('');

    const contentRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDirtyRef = useRef(false);

    // Track whether edits are dirty (for navigation guard)
    const isDirty = editing && editHtml !== html;

    useEffect(() => {
        isDirtyRef.current = isDirty;
    }, [isDirty]);

    // Auto-scroll during streaming
    useEffect(() => {
        if (isStreaming && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [html, isStreaming]);

    // Navigation guard: beforeunload
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirtyRef.current) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    // Exit edit mode when artifact changes underneath (e.g. streaming starts)
    useEffect(() => {
        if (isStreaming && editing) {
            exitEditMode();
        }
    }, [isStreaming]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const enterEditMode = useCallback(() => {
        if (!html || isStreaming) return;
        setEditing(true);
        setEditHtml(html);
        setHistory([html]);
        setHistoryIndex(0);
        // Don't push to preview yet — user hasn't changed anything
    }, [html, isStreaming]);

    const exitEditMode = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setEditing(false);
        setEditHtml('');
        setHistory([]);
        setHistoryIndex(-1);
        setShowSaveDialog(false);
        setSaveName('');
        onEditPreview(null); // clear preview override
    }, [onEditPreview]);

    const confirmExit = useCallback(() => {
        if (isDirtyRef.current) {
            if (!window.confirm('You have unsaved changes. Discard?')) return false;
        }
        exitEditMode();
        return true;
    }, [exitEditMode]);

    // Expose confirmExit for parent navigation guards
    useEffect(() => {
        (window as any).__codeViewerConfirmExit = () => {
            if (!isDirtyRef.current) return true;
            return confirmExit();
        };
        (window as any).__codeViewerIsDirty = () => isDirtyRef.current;
        return () => {
            delete (window as any).__codeViewerConfirmExit;
            delete (window as any).__codeViewerIsDirty;
        };
    }, [confirmExit]);

    const pushHistory = useCallback((newHtml: string) => {
        setHistory(prev => {
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newHtml];
        });
        setHistoryIndex(prev => prev + 1);
    }, [historyIndex]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newHtml = e.target.value;
        setEditHtml(newHtml);
        pushHistory(newHtml);

        if (!manualRefresh) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                onEditPreview(newHtml);
            }, 500);
        }
    }, [manualRefresh, onEditPreview, pushHistory]);

    const handleUndo = useCallback(() => {
        if (historyIndex <= 0) return;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const prevHtml = history[newIndex];
        setEditHtml(prevHtml);
        if (!manualRefresh) onEditPreview(prevHtml);
    }, [historyIndex, history, manualRefresh, onEditPreview]);

    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        const nextHtml = history[newIndex];
        setEditHtml(nextHtml);
        if (!manualRefresh) onEditPreview(nextHtml);
    }, [historyIndex, history, manualRefresh, onEditPreview]);

    const handleManualRefresh = useCallback(() => {
        onEditPreview(editHtml);
    }, [editHtml, onEditPreview]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            confirmExit();
        }
        // Ctrl/Cmd+Z for undo, Ctrl/Cmd+Shift+Z for redo
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) handleRedo();
            else handleUndo();
        }
    }, [confirmExit, handleUndo, handleRedo]);

    const handleCopy = useCallback(async () => {
        const textToCopy = editing ? editHtml : html;
        if (!textToCopy) return;
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [html, editing, editHtml]);

    const handleSaveClick = useCallback(() => {
        if (isUserEditsProject) {
            // Save directly as revision — use existing artifact label as name
            onSave(editHtml, 'Manual edit', selectedArtifactId);
            exitEditMode();
        } else {
            setShowSaveDialog(true);
            setSaveName('');
        }
    }, [isUserEditsProject, editHtml, selectedArtifactId, onSave, exitEditMode]);

    const handleSaveConfirm = useCallback(() => {
        if (!saveName.trim()) return;
        onSave(editHtml, saveName.trim(), null);
        setShowSaveDialog(false);
        exitEditMode();
    }, [saveName, editHtml, onSave, exitEditMode]);

    const handleSaveKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveConfirm();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setShowSaveDialog(false);
        }
    }, [handleSaveConfirm]);

    const lines = html ? html.split('\n') : [];

    return (
        <div className="code-viewer" style={editing ? { overscrollBehavior: 'none' } : undefined}>
            <div className="code-viewer-header">
                {editing ? (
                    <>
                        <span>Editing</span>
                        <div className="code-editor-toolbar">
                            <button onClick={handleUndo} disabled={historyIndex <= 0} title="Undo (Cmd+Z)">
                                <UndoIcon />
                            </button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo (Cmd+Shift+Z)">
                                <RedoIcon />
                            </button>
                            <button onClick={handleCopy} className={copied ? 'copied' : ''} title="Copy">
                                {copied ? <CheckIcon /> : <CopyIcon />}
                            </button>
                            <label className="manual-refresh-toggle" title="Manual refresh only">
                                <input
                                    type="checkbox"
                                    checked={manualRefresh}
                                    onChange={e => setManualRefresh(e.target.checked)}
                                />
                                Manual
                            </label>
                            {manualRefresh && (
                                <button onClick={handleManualRefresh} title="Refresh preview">
                                    <RefreshIcon />
                                </button>
                            )}
                            <button onClick={handleSaveClick} className="save-btn" title="Save to User Edits">
                                <SaveIcon /> Save
                            </button>
                            <button onClick={() => confirmExit()} title="Cancel (Esc)">
                                <CloseIcon />
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <span>Source</span>
                        {html && (
                            <button onClick={handleCopy} className={copied ? 'copied' : ''}>
                                {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
                            </button>
                        )}
                    </>
                )}
            </div>

            {showSaveDialog && (
                <div className="save-dialog">
                    <input
                        type="text"
                        placeholder="Name this edit..."
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={handleSaveKeyDown}
                        autoFocus
                    />
                    <button onClick={handleSaveConfirm} disabled={!saveName.trim()}>Save</button>
                    <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
                </div>
            )}

            {editing ? (
                <textarea
                    ref={textareaRef}
                    className="code-editor-textarea"
                    value={editHtml}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    autoFocus
                />
            ) : html ? (
                <div
                    className="code-viewer-content"
                    ref={contentRef}
                    onDoubleClick={!isStreaming ? enterEditMode : undefined}
                >
                    <pre>
                        {lines.map((line, i) => (
                            <span key={i} className="code-line">{line}{'\n'}</span>
                        ))}
                    </pre>
                </div>
            ) : (
                <div className="code-viewer-empty">
                    Select an artifact to view source
                </div>
            )}
        </div>
    );
};

export default CodeViewer;
```

---

### Task 4: LivePreview — Accept Override HTML

**Files:**
- Modify: `components/LivePreview.tsx`

- [ ] **Step 1: Add `overrideHtml` prop**

Add `overrideHtml?: string | null` to `LivePreviewProps`. When set, it forces `srcDoc` mode (like streaming) regardless of artifact state:

In the component, after the existing `useServerPreview` line, add the override logic:

```tsx
// If the code editor has live changes, show those via srcDoc
const displayHtml = overrideHtml ?? html;
const useServerPreview = !overrideHtml && !isStreaming && artifactId;
```

Then replace all references to `html` in the JSX with `displayHtml` (the `srcDoc={html}` becomes `srcDoc={displayHtml}`, the `{html ? (` check becomes `{displayHtml ? (`).

---

### Task 5: WorkspaceLayout — Wire Edit Mode Props

**Files:**
- Modify: `components/WorkspaceLayout.tsx`

- [ ] **Step 1: Add edit preview state and new props**

Add to `WorkspaceLayoutProps`:
```typescript
isUserEditsProject: boolean;
onSaveToUserEdits: (html: string, name: string, artifactId: string | null) => void;
```

Add local state in the component:
```typescript
const [editPreviewHtml, setEditPreviewHtml] = useState<string | null>(null);
```

- [ ] **Step 2: Wire CodeViewer**

Replace the `<CodeViewer>` JSX with:
```tsx
<CodeViewer
    html={props.selectedArtifactHtml}
    isStreaming={props.isStreaming}
    isUserEditsProject={props.isUserEditsProject}
    selectedArtifactId={props.selectedArtifactId}
    onEditPreview={setEditPreviewHtml}
    onSave={props.onSaveToUserEdits}
/>
```

- [ ] **Step 3: Wire LivePreview**

Add `overrideHtml={editPreviewHtml}` to the `<LivePreview>` component.

- [ ] **Step 4: Add navigation guard to FileTree clicks**

Wrap `onSelectProject` and `onSelectArtifact` in the `FileTree` props to check for dirty state:

```tsx
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
```

Pass these to `<FileTree>` instead of the raw props.

---

### Task 6: App.tsx / index.tsx — Pass New Props Through

**Files:**
- Modify: the file that renders `<WorkspaceLayout>` (likely `index.tsx` or `App.tsx`)

- [ ] **Step 1: Wire the new props from useWorkspace to WorkspaceLayout**

Add to the WorkspaceLayout render:
```tsx
isUserEditsProject={workspace.isUserEditsProject(workspace.selectedProjectId)}
onSaveToUserEdits={workspace.saveToUserEdits}
```

(The exact file depends on where WorkspaceLayout is rendered — check `index.tsx`.)

---

### Task 7: CSS — Edit Mode Styles

**Files:**
- Modify: `index.css`

- [ ] **Step 1: Add styles after the existing `.code-viewer-empty` block**

```css
/* Code editor edit mode */
.code-editor-textarea {
    flex: 1;
    width: 100%;
    margin: 0;
    padding: 12px;
    font-family: 'Roboto Mono', monospace;
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    white-space: pre-wrap;
    word-break: break-all;
    tab-size: 2;
    overscroll-behavior: none;
}

.code-editor-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
}

.code-editor-toolbar button:disabled {
    opacity: 0.3;
    cursor: default;
}

.code-editor-toolbar .save-btn {
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.3);
}

.code-editor-toolbar .save-btn:hover {
    background: rgba(52, 211, 153, 0.1);
}

.manual-refresh-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.65rem;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
}

.manual-refresh-toggle input {
    width: 12px;
    height: 12px;
    cursor: pointer;
}

.save-dialog {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-color);
    background: var(--stage-bg);
}

.save-dialog input {
    flex: 1;
    padding: 4px 8px;
    font-size: 0.75rem;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    outline: none;
}

.save-dialog input:focus {
    border-color: rgba(52, 211, 153, 0.5);
}

.save-dialog button {
    background: none;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    transition: all 0.15s;
}

.save-dialog button:first-of-type {
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.3);
}

.save-dialog button:disabled {
    opacity: 0.3;
    cursor: default;
}
```

---

### Task 8: Prisma Migration

**Files:**
- No schema change needed

The existing `Project.mode` field (String, default "flash") already supports arbitrary values. We use `mode: 'user-edits'` as a convention — no migration required.

- [ ] **Step 1: Verify no migration needed**

Run: `npx prisma validate`

---

### Task 9: Integration Test

- [ ] **Step 1: Start the dev server and verify**

Run: `npm run dev` (or whatever the start command is)

- [ ] **Step 2: Manual test checklist**

1. Double-click CodeViewer — enters edit mode with textarea
2. Type changes — preview updates after 500ms
3. Toggle manual refresh — preview only updates on Refresh click
4. Undo/Redo buttons and keyboard shortcuts work
5. Copy button works in edit mode
6. Escape exits edit mode (with confirmation if dirty)
7. Save from a regular project — prompts for name, creates artifact in User Edits
8. Save from User Edits project — creates revision on same artifact
9. Navigate away while dirty — confirmation dialog appears
10. Close browser tab while dirty — browser beforeunload fires
11. Streaming artifact — cannot enter edit mode
