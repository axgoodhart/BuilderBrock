import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CopyIcon, CheckIcon, CloseIcon } from './Icons';

interface CodeViewerProps {
    html: string | null;
    isStreaming: boolean;
    isUserEditsProject: boolean;
    selectedArtifactId: string | null;
    onEditPreview: (html: string | null) => void;
    onSave: (html: string, name: string, artifactId: string | null) => void;
    highlightMode: boolean;
    highlightedLines: Set<number>;
    onHighlightedLinesChange: (lines: Set<number>) => void;
    /** Receives the in-progress edit text (null when not editing) so highlights excerpt what's on screen. */
    editSourceRef?: React.MutableRefObject<string | null>;
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
const ManualRefreshIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
    </svg>
);

function computeRanges(lines: Set<number>): { start: number; end: number }[] {
    const sorted = [...lines].sort((a, b) => a - b);
    const ranges: { start: number; end: number }[] = [];
    for (const line of sorted) {
        const last = ranges[ranges.length - 1];
        if (last && line === last.end + 1) {
            last.end = line;
        } else {
            ranges.push({ start: line, end: line });
        }
    }
    return ranges;
}

const CodeViewer: React.FC<CodeViewerProps> = ({
    html,
    isStreaming,
    isUserEditsProject,
    selectedArtifactId,
    onEditPreview,
    onSave,
    highlightMode,
    highlightedLines,
    onHighlightedLinesChange,
    editSourceRef,
}) => {
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editHtml, setEditHtml] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [manualRefresh, setManualRefresh] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [functionsPanelExpanded, setFunctionsPanelExpanded] = useState(false);
    const [functionDraftOpen, setFunctionDraftOpen] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDirtyRef = useRef(false);
    const historyRef = useRef(history);
    const historyIndexRef = useRef(historyIndex);
    const isDraggingRef = useRef(false);

    historyRef.current = history;
    historyIndexRef.current = historyIndex;

    const isDirty = editing && editHtml !== html;
    if (editSourceRef) editSourceRef.current = editing ? editHtml : null;

    // Leaving edit mode can shift line numbers, so drop stale highlights.
    const wasEditingRef = useRef(false);
    useEffect(() => {
        if (wasEditingRef.current && !editing) onHighlightedLinesChange(new Set());
        wasEditingRef.current = editing;
    }, [editing]);

    useEffect(() => {
        isDirtyRef.current = isDirty;
    }, [isDirty]);

    // Auto-scroll during streaming
    useEffect(() => {
        if (isStreaming && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [html, isStreaming]);

    // beforeunload navigation guard
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirtyRef.current) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    // Exit edit mode if streaming starts
    useEffect(() => {
        if (isStreaming && editing) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setEditing(false);
            setEditHtml('');
            setHistory([]);
            setHistoryIndex(-1);
            setShowSaveDialog(false);
            onEditPreview(null);
        }
    }, [isStreaming]);

    // Cleanup debounce
    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    // End drag on mouseup anywhere
    useEffect(() => {
        const handleMouseUp = () => { isDraggingRef.current = false; };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    // Expose dirty check for parent navigation guards
    useEffect(() => {
        (window as any).__codeViewerIsDirty = () => isDirtyRef.current;
        (window as any).__codeViewerConfirmExit = () => {
            if (!isDirtyRef.current) return true;
            if (!window.confirm('You have unsaved changes. Discard?')) return false;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setEditing(false);
            setEditHtml('');
            setHistory([]);
            setHistoryIndex(-1);
            setShowSaveDialog(false);
            onEditPreview(null);
            return true;
        };
        return () => {
            delete (window as any).__codeViewerIsDirty;
            delete (window as any).__codeViewerConfirmExit;
        };
    }, [onEditPreview]);

    const enterEditMode = useCallback(() => {
        if (!html || isStreaming) return;
        setEditing(true);
        setEditHtml(html);
        setHistory([html]);
        setHistoryIndex(0);
    }, [html, isStreaming]);

    const exitEditMode = useCallback(() => {
        if (isDirtyRef.current) {
            if (!window.confirm('You have unsaved changes. Discard?')) return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setEditing(false);
        setEditHtml('');
        setHistory([]);
        setHistoryIndex(-1);
        setShowSaveDialog(false);
        setSaveName('');
        onEditPreview(null);
    }, [onEditPreview]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setEditHtml(val);

        // Push to history
        const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
        const newHistory = [...truncated, val];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        if (!manualRefresh) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => onEditPreview(val), 500);
        }
    }, [manualRefresh, onEditPreview]);

    const handleUndo = useCallback(() => {
        if (historyIndexRef.current <= 0) return;
        const newIdx = historyIndexRef.current - 1;
        setHistoryIndex(newIdx);
        const val = historyRef.current[newIdx];
        setEditHtml(val);
        if (!manualRefresh) onEditPreview(val);
    }, [manualRefresh, onEditPreview]);

    const handleRedo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        const newIdx = historyIndexRef.current + 1;
        setHistoryIndex(newIdx);
        const val = historyRef.current[newIdx];
        setEditHtml(val);
        if (!manualRefresh) onEditPreview(val);
    }, [manualRefresh, onEditPreview]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            exitEditMode();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) handleRedo();
            else handleUndo();
        }
    }, [exitEditMode, handleUndo, handleRedo]);

    const handleCopy = useCallback(async () => {
        const text = editing ? editHtml : html;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [html, editing, editHtml]);

    const handleSaveClick = useCallback(() => {
        if (isUserEditsProject) {
            onSave(editHtml, 'Manual edit', selectedArtifactId);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setEditing(false);
            setEditHtml('');
            setHistory([]);
            setHistoryIndex(-1);
            setShowSaveDialog(false);
            onEditPreview(null);
        } else {
            setShowSaveDialog(true);
            setSaveName('');
        }
    }, [isUserEditsProject, editHtml, selectedArtifactId, onSave, onEditPreview]);

    const handleSaveConfirm = useCallback(() => {
        if (!saveName.trim()) return;
        onSave(editHtml, saveName.trim(), null);
        setShowSaveDialog(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setEditing(false);
        setEditHtml('');
        setHistory([]);
        setHistoryIndex(-1);
        onEditPreview(null);
    }, [saveName, editHtml, onSave, onEditPreview]);

    const handleSaveKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSaveConfirm(); }
        if (e.key === 'Escape') { e.preventDefault(); setShowSaveDialog(false); }
    }, [handleSaveConfirm]);

    // Highlight mode handlers
    const handleLineMouseDown = useCallback((lineNum: number, e: React.MouseEvent) => {
        if (!highlightMode) return;
        e.preventDefault();
        isDraggingRef.current = true;

        const newHighlighted = new Set(highlightedLines);
        if (newHighlighted.has(lineNum)) {
            newHighlighted.delete(lineNum);
        } else {
            newHighlighted.add(lineNum);
        }
        onHighlightedLinesChange(newHighlighted);
    }, [highlightMode, highlightedLines, onHighlightedLinesChange]);

    const handleLineMouseEnter = useCallback((lineNum: number) => {
        if (!isDraggingRef.current || !highlightMode) return;
        if (!highlightedLines.has(lineNum)) {
            const newHighlighted = new Set(highlightedLines);
            newHighlighted.add(lineNum);
            onHighlightedLinesChange(newHighlighted);
        }
    }, [highlightMode, highlightedLines, onHighlightedLinesChange]);

    const lines = html ? html.split('\n') : [];
    const ranges = highlightedLines.size > 0 ? computeRanges(highlightedLines) : [];
    const canAddFunctions = Boolean(html);
    const functionsPanelVisible = functionsPanelExpanded;

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
                                <button onClick={() => onEditPreview(editHtml)} title="Refresh preview">
                                    <ManualRefreshIcon />
                                </button>
                            )}
                            <button onClick={handleSaveClick} className="save-btn" title="Save to User Edits">
                                <SaveIcon /> Save
                            </button>
                            <button onClick={exitEditMode} title="Cancel (Esc)">
                                <CloseIcon />
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <span>Source</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {highlightMode && highlightedLines.size > 0 && (
                                <button
                                    onClick={() => onHighlightedLinesChange(new Set())}
                                    title="Clear highlights"
                                    style={{ fontSize: '0.65rem' }}
                                >
                                    Clear
                                </button>
                            )}
                            {html && (
                                <button onClick={handleCopy} className={copied ? 'copied' : ''}>
                                    {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
                                </button>
                            )}
                            <button
                                onClick={() => setFunctionsPanelExpanded(expanded => !expanded)}
                                id="functionsPanelToggler"
                                className={functionsPanelExpanded ? 'active' : ''}
                                title={canAddFunctions ? 'Toggle function source' : 'Functions cannot be added to empty pages'}
                            >
                                +ƒ
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Range badge */}
            {highlightMode && ranges.length > 0 && (
                <div className="highlight-range-badge">
                    {ranges.map((r, i) => (
                        <span key={i} className="range-chip">
                            {r.start === r.end ? r.start : `${r.start}...${r.end}`}
                        </span>
                    ))}
                </div>
            )}

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

            <div className={`code-viewer-panels ${functionsPanelVisible ? 'functions-expanded' : ''}`}>
                <div className="code-viewer-pane code-viewer-pane-main">
                    {editing ? (
                        <div className="code-viewer-content editing">
                            {/* Mirror renders the gutter and sizes the stack; the textarea overlays its text column. */}
                            <div className="code-edit-stack">
                                <pre className="code-edit-mirror" aria-hidden="true">
                                    {editHtml.split('\n').map((line, i) => {
                                        const lineNum = i + 1;
                                        const isHighlighted = highlightedLines.has(lineNum);
                                        return (
                                            <div key={i} className={`code-line-row ${isHighlighted ? 'highlighted' : ''}`}>
                                                <span
                                                    className={`line-number ${isHighlighted ? 'highlighted' : ''} ${highlightMode ? 'interactive' : ''}`}
                                                    onMouseDown={(e) => handleLineMouseDown(lineNum, e)}
                                                    onMouseEnter={() => handleLineMouseEnter(lineNum)}
                                                >
                                                    {lineNum}
                                                </span>
                                                <span className="line-content">{line}{'\n'}</span>
                                            </div>
                                        );
                                    })}
                                </pre>
                                <textarea
                                    ref={textareaRef}
                                    className="code-editor-textarea"
                                    value={editHtml}
                                    onChange={handleChange}
                                    onKeyDown={handleKeyDown}
                                    spellCheck={false}
                                    autoFocus
                                />
                            </div>
                        </div>
                    ) : html ? (
                        <div
                            className="code-viewer-content"
                            ref={contentRef}
                            onDoubleClick={!isStreaming ? enterEditMode : undefined}
                        >
                            <pre>
                                {lines.map((line, i) => {
                                    const lineNum = i + 1;
                                    const isHighlighted = highlightedLines.has(lineNum);
                                    return (
                                        <div
                                            key={i}
                                            className={`code-line-row ${isHighlighted ? 'highlighted' : ''}`}
                                        >
                                            <span
                                                className={`line-number ${isHighlighted ? 'highlighted' : ''} ${highlightMode ? 'interactive' : ''}`}
                                                onMouseDown={(e) => handleLineMouseDown(lineNum, e)}
                                                onMouseEnter={() => handleLineMouseEnter(lineNum)}
                                                onDoubleClick={(e) => e.stopPropagation()} // gutter selects lines, doesn't enter edit mode
                                            >
                                                {lineNum}
                                            </span>
                                            <span className="line-content">{line}{'\n'}</span>
                                        </div>
                                    );
                                })}
                            </pre>
                        </div>
                    ) : (
                        <div className="code-viewer-empty">
                            Select an artifact to view source
                        </div>
                    )}
                </div>
                <div className="code-viewer-pane code-viewer-pane-functions" aria-hidden={!functionsPanelVisible}>
                    {functionsPanelVisible && (
                        <div className={`function-panel-shell ${canAddFunctions ? '' : 'empty'}`}>
                            {!canAddFunctions ? (
                                <div className="function-panel-empty">
                                    <p>functions cannot be added to empty pages</p>
                                    <button className="function-add-wide" disabled aria-label="Add function">
                                        <span>+</span>
                                    </button>
                                </div>
                            ) : functionDraftOpen ? (
                                <div className="function-draft-layout">
                                    <div className="function-status-toggle" aria-disabled="true">
                                        <button disabled>Active</button>
                                        <button disabled>Inactive</button>
                                    </div>
                                    <div className="function-nameplate">
                                        <span>function</span>
                                        <input aria-label="Function name" placeholder="name" />
                                        <strong>auto</strong>
                                        <button type="button" aria-label="Edit function name">
                                            ✎
                                        </button>
                                    </div>
                                    <div className="function-discussion-box">
                                        <div className="function-discussion-body" />
                                        <div className="function-discussion-input">
                                            <span>Describe what functionality to add</span>
                                            <button type="button" aria-label="Send function discussion">
                                                ↗
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="function-add-small"
                                        aria-label="Add another function"
                                        onClick={() => setFunctionDraftOpen(false)}
                                    >
                                        +
                                    </button>
                                </div>
                            ) : (
                                <div className="function-panel-add">
                                    <button
                                        type="button"
                                        className="function-add-wide"
                                        aria-label="Add function"
                                        onClick={() => setFunctionDraftOpen(true)}
                                    >
                                        <span>+</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CodeViewer;
