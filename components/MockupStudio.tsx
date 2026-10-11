/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { MockupElement, MockupElementKind, MockupViewport, MockupWireframe } from '../types';
import {
    ELEMENT_DEFS,
    PALETTE_TABS,
    LAYOUT_PRESETS,
    PRESET_GROUPS,
    LayoutPreset,
    MAX_PAGE_UNITS,
    createElement,
    applyPreset,
    serializeMockup,
    loadDraft,
    saveDraft,
} from '../lib/mockupBlueprint';
import {
    SendIcon, CursorIcon, CloseIcon, ThinkingIcon, RefreshIcon,
    DesktopIcon, TabletIcon, PhoneIcon, CopyIcon, TrashIcon,
    NoteIcon, InfoIcon, LayerUpIcon, LayerDownIcon,
} from './Icons';
import GenerationNotice, { GenerationNoticeView } from './GenerationNotice';
import MockupTemplateLibrary, { PresetThumb } from './MockupTemplateLibrary';
import { TEMPLATE_CATEGORIES } from '../lib/mockupTemplates';

interface MockupStudioProps {
    onGenerate: (args: { description: string; blueprint: string; viewport: MockupViewport; wireframe: MockupWireframe }) => void;
    onClose: () => void;
    isLoading: boolean;
    /** Opens this saved wireframe instead of the working draft (it becomes the new draft). */
    initialWireframe?: MockupWireframe | null;
    notice?: GenerationNoticeView | null;
}

type Tool = 'select' | 'note';

type Box = Pick<MockupElement, 'x' | 'y' | 'width' | 'height'>;

interface DragState {
    id: string;
    action: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    /** Start boxes of every element being moved (the whole selection) or resized. */
    origins: Record<string, Box>;
    /** Plain click on an already multi-selected element: collapse to it if no movement happens. */
    collapseOnClick: boolean;
    /** Canvas state before the drag — pushed to history on first real movement. */
    preDragElements: MockupElement[];
    snapshotPushed: boolean;
}

interface Marquee { x0: number; y0: number; x1: number; y1: number }

const HISTORY_LIMIT = 50;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Wireframe body rendered inside each placed element. */
const ElementBody: React.FC<{ el: MockupElement }> = ({ el }) => {
    switch (el.kind) {
        case 'navbar':
            return (
                <div className="mk-navbar">
                    <span className="mk-navbar-title">{el.label}</span>
                    <span className="mk-navbar-dots"><i /><i /><i /><i className="active" /></span>
                </div>
            );
        case 'image':
            return (
                <div className="mk-image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                </div>
            );
        case 'title':
            return <div className="mk-title">{el.label}</div>;
        case 'text':
            return <div className="mk-text"><i /><i /><i /><i className="short" /></div>;
        case 'button':
            return <div className="mk-button">{el.label}</div>;
        case 'toggle':
            return <div className="mk-toggle"><i /></div>;
        case 'slider':
            return <div className="mk-slider"><i className="track" /><i className="thumb" /></div>;
        case 'input':
            return <div className="mk-input">{el.label}</div>;
        case 'dropdown':
            return <div className="mk-dropdown"><span>{el.label}</span><em>▾</em></div>;
        case 'checkbox':
            return <div className="mk-checkbox"><i /><span>{el.label}</span></div>;
        case 'chip':
            return <div className="mk-chip">{el.label}</div>;
        case 'note':
            return <div className="mk-note">{el.label}</div>;
        default: // section, card
            return <div className="mk-block-label">{el.label}</div>;
    }
};

const MockupStudio: React.FC<MockupStudioProps> = ({ onGenerate, onClose, isLoading, notice, initialWireframe }) => {
    const [initialDraft] = useState(() => initialWireframe ?? loadDraft());
    const [elements, setElements] = useState<MockupElement[]>(initialDraft.elements);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [marquee, setMarquee] = useState<Marquee | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'layout' | 'inputs'>('layout');
    const [viewport, setViewport] = useState<MockupViewport>(initialDraft.viewport);
    const [tool, setTool] = useState<Tool>('select');
    const [description, setDescription] = useState(initialDraft.description);
    const [showHelp, setShowHelp] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryCategory, setLibraryCategory] = useState<string | null>(null);
    const [templateNotice, setTemplateNotice] = useState('');
    const libraryTriggerRef = useRef<HTMLButtonElement>(null);

    const canvasRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const lastScrollUnitsRef = useRef(0);
    const dragRef = useRef<DragState | null>(null);
    const marqueeRef = useRef<{ x0: number; y0: number; base: string[] } | null>(null);

    // Undo/redo history: snapshots of `elements` taken before each mutation.
    const elementsRef = useRef(elements);
    elementsRef.current = elements;
    const pastRef = useRef<MockupElement[][]>([]);
    const futureRef = useRef<MockupElement[][]>([]);

    // The studio is conditionally mounted by the workspace overlay. Persist the
    // complete draft after every committed render so Close, Generate, refresh,
    // and navigation cannot silently discard the wireframe.
    useEffect(() => {
        saveDraft({ elements, viewport, description });
    }, [elements, viewport, description]);

    const snapshot = useCallback(() => {
        pastRef.current.push(elementsRef.current);
        if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
        futureRef.current = [];
    }, []);

    const undo = useCallback(() => {
        const prev = pastRef.current.pop();
        if (!prev) return;
        futureRef.current.push(elementsRef.current);
        setElements(prev);
        setSelectedIds([]);
        setEditingId(null);
    }, []);

    const redo = useCallback(() => {
        const next = futureRef.current.pop();
        if (!next) return;
        pastRef.current.push(elementsRef.current);
        setElements(next);
        setSelectedIds([]);
        setEditingId(null);
    }, []);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selected = selectedIds.length === 1 ? elements.find(e => e.id === selectedIds[0]) || null : null; // single-element ops (resize, layers)
    const nextZ = useCallback(
        () => elements.reduce((m, e) => Math.max(m, e.z), 0) + 1,
        [elements],
    );

    // Page height in viewport units (100 = one screen). Grows as content stacks below the fold.
    const pageUnits = useMemo(() => {
        const maxBottom = elements.reduce((m, e) => Math.max(m, e.y + e.height), 0);
        return Math.min(MAX_PAGE_UNITS, Math.max(100, Math.ceil(maxBottom) + 6));
    }, [elements]);

    /** Vertical position of the visible viewport's top edge, in viewport units. */
    const scrollUnits = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas && canvas.clientHeight > 0) {
            lastScrollUnitsRef.current = (canvas.scrollTop / canvas.clientHeight) * 100;
        }
        return lastScrollUnitsRef.current;
    }, []);

    /* ---------------- palette ---------------- */

    const addElement = useCallback((kind: MockupElementKind) => {
        setLibraryOpen(false);
        setTemplateNotice('');
        snapshot();
        // Cascade successive drops slightly so they don't stack invisibly,
        // centered on the currently visible part of the (possibly scrolled) page.
        const offset = (elements.length % 5) * 3;
        const def = ELEMENT_DEFS[kind];
        const el = createElement(kind, nextZ(), {
            x: clamp(50 - def.width / 2 + offset, 0, 100 - def.width),
            y: clamp(scrollUnits() + 50 - def.height / 2 + offset, 0, MAX_PAGE_UNITS - def.height),
        });
        setElements(prev => [...prev, el]);
        setSelectedIds([el.id]);
    }, [elements.length, nextZ, snapshot, scrollUnits]);

    const addPreset = useCallback((preset: LayoutPreset) => {
        // Stack below whatever is already on the page instead of overlaying it.
        const maxBottom = elements.reduce((m, e) => Math.max(m, e.y + e.height), 0);
        const offsetY = elements.length > 0 ? maxBottom + 4 : 0;
        const presetBottom = Math.max(...preset.elements.map(e => e.y + e.height));
        if (offsetY + presetBottom + 6 > MAX_PAGE_UNITS) {
            setTemplateNotice('This layout needs more room. Move or remove content on the canvas, then add it again.');
            return false;
        }
        snapshot();
        const stamped = applyPreset(preset, nextZ(), offsetY);
        setElements(prev => [...prev, ...stamped]);
        setSelectedIds(stamped.map(e => e.id)); // whole layout selected so it can be moved as one
        setLibraryOpen(false);
        setTemplateNotice(`${preset.label} added to the canvas.`);
        // Bring the freshly stamped screen into view.
        requestAnimationFrame(() => {
            (libraryTriggerRef.current ?? canvasRef.current)?.focus({ preventScroll: true });
            const canvas = canvasRef.current;
            if (canvas && offsetY > 0) canvas.scrollTo({ top: (offsetY / 100) * canvas.clientHeight, behavior: 'smooth' });
        });
        return true;
    }, [elements, nextZ, snapshot]);

    const openTemplateLibrary = (categoryId: string | null = null) => {
        scrollUnits();
        setLibraryCategory(categoryId);
        setTemplateNotice('');
        setLibraryOpen(true);
        setShowHelp(false);
        setEditingId(null);
        setTool('select');
    };

    const closeTemplateLibrary = useCallback(() => {
        setLibraryOpen(false);
        requestAnimationFrame(() => (libraryTriggerRef.current ?? canvasRef.current)?.focus({ preventScroll: true }));
    }, []);

    /* ---------------- element ops ---------------- */

    const updateElement = useCallback((id: string, partial: Partial<MockupElement>) => {
        setElements(prev => prev.map(e => (e.id === id ? { ...e, ...partial } : e)));
    }, []);

    const deleteSelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        snapshot();
        setElements(prev => prev.filter(e => !selectedSet.has(e.id)));
        setSelectedIds([]);
        setEditingId(null);
    }, [selectedIds.length, selectedSet, snapshot]);

    const duplicateSelected = useCallback(() => {
        const sources = elements.filter(e => selectedSet.has(e.id)).sort((a, b) => a.z - b.z);
        if (sources.length === 0) return;
        snapshot();
        const baseZ = nextZ();
        const copies: MockupElement[] = sources.map((src, i) => ({
            ...src,
            id: createElement(src.kind, 0).id,
            x: clamp(src.x + 3, 0, 100 - src.width),
            y: clamp(src.y + 3, 0, MAX_PAGE_UNITS - src.height),
            z: baseZ + i,
        }));
        setElements(prev => [...prev, ...copies]);
        setSelectedIds(copies.map(c => c.id));
    }, [elements, selectedSet, nextZ, snapshot]);

    const moveLayer = useCallback((dir: 1 | -1) => {
        if (!selected) return;
        // Swap z with the nearest neighbor in that direction.
        const others = elements.filter(e => e.id !== selected.id);
        const neighbor = others
            .filter(e => (dir === 1 ? e.z > selected.z : e.z < selected.z))
            .sort((a, b) => (dir === 1 ? a.z - b.z : b.z - a.z))[0];
        if (!neighbor) return;
        snapshot();
        setElements(prev => prev.map(e => {
            if (e.id === selected.id) return { ...e, z: neighbor.z };
            if (e.id === neighbor.id) return { ...e, z: selected.z };
            return e;
        }));
    }, [selected, elements, snapshot]);

    const clearCanvas = useCallback(() => {
        if (elementsRef.current.length === 0) return;
        if (!window.confirm('Clear every element from this saved wireframe?')) return;
        snapshot();
        setElements([]);
        setSelectedIds([]);
        setEditingId(null);
    }, [snapshot]);

    /* ---------------- drag / resize ---------------- */

    const placeNoteAt = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        snapshot();
        const rect = canvas.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top + canvas.scrollTop) / rect.height) * 100;
        const def = ELEMENT_DEFS.note;
        const note = createElement('note', nextZ(), {
            x: clamp(x - def.width / 2, 0, 100 - def.width),
            y: clamp(y - def.height / 2, 0, MAX_PAGE_UNITS - def.height),
        }, { label: 'Add a note…' });
        setElements(prev => [...prev, note]);
        setSelectedIds([note.id]);
        setEditingId(note.id);
        setTool('select');
    }, [nextZ, snapshot]);

    /** Client point → page coordinates (x in % of width, y in viewport units). */
    const toPageUnits = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((clientX - rect.left) / rect.width) * 100,
            y: ((clientY - rect.top + canvas.scrollTop) / rect.height) * 100,
        };
    }, []);

    const beginDrag = useCallback((e: React.PointerEvent, id: string, action: 'move' | 'resize') => {
        if (editingId) return;
        // Note tool wins: annotations can sit on top of other elements.
        if (tool === 'note') {
            e.stopPropagation();
            e.preventDefault();
            placeNoteAt(e.clientX, e.clientY);
            return;
        }
        if (!elements.some(x => x.id === id)) return;
        e.stopPropagation();

        // Shift/cmd-click toggles membership; removing an element ends there.
        let ids = selectedIds;
        if (action === 'move' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            if (selectedSet.has(id)) {
                setSelectedIds(selectedIds.filter(x => x !== id));
                return;
            }
            ids = [...selectedIds, id];
        } else if (action === 'resize' || !selectedSet.has(id)) {
            ids = [id];
        }

        const moving = new Set(ids);
        const origins: Record<string, Box> = {};
        elements.forEach(el => {
            if (moving.has(el.id)) origins[el.id] = { x: el.x, y: el.y, width: el.width, height: el.height };
        });

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = {
            id, action, origins,
            startClientX: e.clientX,
            startClientY: e.clientY,
            collapseOnClick: action === 'move' && ids === selectedIds && ids.length > 1,
            preDragElements: elementsRef.current,
            snapshotPushed: false,
        };
        setSelectedIds(ids);
    }, [elements, selectedIds, selectedSet, editingId, tool, placeNoteAt]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const m = marqueeRef.current;
        if (m) {
            const p = toPageUnits(e.clientX, e.clientY);
            const r = { x0: Math.min(m.x0, p.x), y0: Math.min(m.y0, p.y), x1: Math.max(m.x0, p.x), y1: Math.max(m.y0, p.y) };
            setMarquee(r);
            const hits = elementsRef.current
                .filter(el => el.x < r.x1 && el.x + el.width > r.x0 && el.y < r.y1 && el.y + el.height > r.y0)
                .map(el => el.id);
            setSelectedIds(Array.from(new Set([...m.base, ...hits])));
            return;
        }

        const drag = dragRef.current;
        if (!drag) return;
        const rect = canvas.getBoundingClientRect();
        let dx = ((e.clientX - drag.startClientX) / rect.width) * 100;
        let dy = ((e.clientY - drag.startClientY) / rect.height) * 100;

        // One history entry per drag, pushed when movement actually starts.
        if (!drag.snapshotPushed && (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1)) {
            pastRef.current.push(drag.preDragElements);
            if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
            futureRef.current = [];
            drag.snapshotPushed = true;
            drag.collapseOnClick = false;
        }

        if (drag.action === 'move') {
            // Clamp the group's bounding box so relative positions are preserved at the edges.
            const boxes = Object.values(drag.origins);
            const minX = Math.min(...boxes.map(b => b.x));
            const minY = Math.min(...boxes.map(b => b.y));
            const maxR = Math.max(...boxes.map(b => b.x + b.width));
            const maxB = Math.max(...boxes.map(b => b.y + b.height));
            dx = clamp(dx, -minX, 100 - maxR);
            dy = clamp(dy, -minY, MAX_PAGE_UNITS - maxB);
            setElements(prev => prev.map(el => {
                const o = drag.origins[el.id];
                return o ? { ...el, x: o.x + dx, y: o.y + dy } : el;
            }));
        } else {
            const o = drag.origins[drag.id];
            updateElement(drag.id, {
                width: clamp(o.width + dx, 3, 100 - o.x),
                height: clamp(o.height + dy, 2, MAX_PAGE_UNITS - o.y),
            });
        }
    }, [updateElement, toPageUnits]);

    const endDrag = useCallback(() => {
        const drag = dragRef.current;
        if (drag?.collapseOnClick) setSelectedIds([drag.id]);
        dragRef.current = null;
        marqueeRef.current = null;
        setMarquee(null);
    }, []);

    /* ---------------- canvas interactions ---------------- */

    const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.target !== canvasRef.current && e.target !== pageRef.current) return;
        if (tool === 'note') {
            e.preventDefault();
            placeNoteAt(e.clientX, e.clientY);
            return;
        }
        // Empty canvas: start a marquee; shift/cmd adds to the current selection.
        e.preventDefault();
        canvasRef.current?.setPointerCapture(e.pointerId);
        const p = toPageUnits(e.clientX, e.clientY);
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        marqueeRef.current = { x0: p.x, y0: p.y, base: additive ? selectedIds : [] };
        if (!additive) setSelectedIds([]);
        setEditingId(null);
    }, [tool, placeNoteAt, toPageUnits, selectedIds]);

    // Focus the label editor once it mounts — autoFocus alone loses to the
    // native focus change from the pointer event that opened it.
    useEffect(() => {
        if (!editingId) return;
        const frame = requestAnimationFrame(() => {
            const el = canvasRef.current?.querySelector<HTMLTextAreaElement>('textarea.mk-label-editor');
            if (el && document.activeElement !== el) {
                el.focus();
                el.select();
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [editingId]);

    // Keyboard: delete removes selection, escape deselects / stops editing, cmd/ctrl+A selects all,
    // cmd/ctrl+Z undoes and shift+cmd/ctrl+Z (or ctrl+Y) redoes.
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (libraryOpen) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeTemplateLibrary();
                }
                return;
            }
            const target = e.target as HTMLElement;
            const isTyping = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
            if (e.key === 'Escape') {
                setEditingId(null);
                if (!isTyping) setSelectedIds([]);
                return;
            }
            if (isTyping || editingId) return;
            if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                setSelectedIds(elementsRef.current.map(el => el.id));
                return;
            }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
                return;
            }
            if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                redo();
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
                e.preventDefault();
                deleteSelected();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedIds.length, editingId, deleteSelected, undo, redo, libraryOpen, closeTemplateLibrary]);

    /* ---------------- generate ---------------- */

    const visibleCount = elements.filter(e => e.kind !== 'note').length;
    const canSend = !isLoading && (description.trim().length > 0 || visibleCount > 0);

    const handleSend = () => {
        if (!canSend) return;
        onGenerate({
            description: description.trim(),
            blueprint: serializeMockup(elements, viewport),
            viewport,
            wireframe: { elements, viewport, description: description.trim() },
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    /* ---------------- render ---------------- */

    const paletteTab = PALETTE_TABS.find(t => t.id === activeTab)!;

    return (
        <div className="mockup-studio">
            <div className="studio-toolbar">
                <div className="tool-group">
                    <div className="viewport-buttons mockup-viewports">
                        <button className={viewport === 'desktop' ? 'active' : ''} onClick={() => setViewport('desktop')} title="Desktop"><DesktopIcon /></button>
                        <button className={viewport === 'tablet' ? 'active' : ''} onClick={() => setViewport('tablet')} title="Tablet"><TabletIcon /></button>
                        <button className={viewport === 'mobile' ? 'active' : ''} onClick={() => setViewport('mobile')} title="Mobile"><PhoneIcon /></button>
                    </div>
                </div>
                <div className="studio-title mockup-studio-title">
                    <span>Mockup Studio</span>
                    <span className="mockup-save-status" aria-live="polite">Draft saved locally</span>
                </div>
                <div className="tool-group">
                    <button className="tool-btn" onClick={clearCanvas} disabled={elements.length === 0} title="Clear canvas">
                        <RefreshIcon /> Clear
                    </button>
                    <button className="close-btn" onClick={onClose} title="Close"><CloseIcon /></button>
                </div>
            </div>

            <div className="mockup-body">
                {/* Left: element palette */}
                <aside className="mockup-palette">
                    <div className="palette-tabs">
                        {PALETTE_TABS.map(t => (
                            <button
                                key={t.id}
                                className={`palette-tab ${activeTab === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className="palette-items">
                        {activeTab === 'layout' && (
                            <>
                                <button type="button" ref={libraryTriggerRef} className={`palette-library-trigger${libraryOpen ? ' active' : ''}`} onClick={() => openTemplateLibrary()} aria-expanded={libraryOpen}>
                                    <span>Browse layout templates <span aria-hidden="true">→</span></span>
                                    <small>Choose a category and variant</small>
                                </button>
                                <h4 className="palette-group-label">Template categories</h4>
                                {TEMPLATE_CATEGORIES.slice(0, -2).map(category => (
                                    <button type="button" key={category.id} className="palette-category-link" onClick={() => openTemplateLibrary(category.id)} aria-label={`Browse ${category.label} templates`}>
                                        <span>{category.label}</span><span aria-hidden="true">→</span>
                                    </button>
                                ))}
                                {templateNotice && !libraryOpen && <p className="palette-template-notice" role="status">{templateNotice}</p>}
                            </>
                        )}
                        {activeTab === 'layout' && PRESET_GROUPS.map(g => (
                            <React.Fragment key={g.id}>
                                <h4 className="palette-group-label">{g.label}</h4>
                                {LAYOUT_PRESETS.filter(p => p.group === g.id).map(preset => (
                                    <button key={preset.id} className="palette-item preset" onClick={() => addPreset(preset)} title={`Add ${preset.label} layout`}>
                                        <PresetThumb preset={preset} />
                                        <span>{preset.label}</span>
                                    </button>
                                ))}
                            </React.Fragment>
                        ))}
                        {activeTab === 'layout' && <h4 className="palette-group-label">Elements</h4>}
                        {paletteTab.kinds.map(kind => (
                            <button key={kind} className="palette-item" onClick={() => addElement(kind)} title={`Add ${ELEMENT_DEFS[kind].label}`}>
                                <span className={`palette-glyph glyph-${kind}`} />
                                <span>{ELEMENT_DEFS[kind].label}</span>
                            </button>
                        ))}
                    </div>
                </aside>

                {/* Center: canvas */}
                <div className={`mockup-stage${libraryOpen ? ' template-library-open' : ''}`}>
                    <div
                        ref={canvasRef}
                        className={`mockup-canvas ${viewport} ${tool === 'note' ? 'placing-note' : ''}`}
                        onPointerDown={handleCanvasPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        hidden={libraryOpen}
                        tabIndex={-1}
                        aria-label="Wireframe canvas"
                    >
                        <div ref={pageRef} className="mockup-canvas-page" style={{ height: `${pageUnits}%` }}>
                            {elements.length === 0 && (
                                <div className="mockup-canvas-empty">
                                    <p>Compose a wireframe from the palette — or just describe your design below.</p>
                                </div>
                            )}
                            {elements.map(el => (
                                <div
                                    key={el.id}
                                    className={`mockup-element kind-${el.kind} ${selectedSet.has(el.id) ? 'selected' : ''}`}
                                    style={{
                                        left: `${el.x}%`,
                                        top: `${(el.y / pageUnits) * 100}%`,
                                        width: `${el.width}%`,
                                        height: `${(el.height / pageUnits) * 100}%`,
                                        zIndex: el.z,
                                    }}
                                    onPointerDown={(e) => beginDrag(e, el.id, 'move')}
                                    onDoubleClick={(e) => { e.stopPropagation(); setEditingId(el.id); }}
                                >
                                    {editingId === el.id ? (
                                        <textarea
                                            className="mk-label-editor"
                                            autoFocus
                                            defaultValue={el.label}
                                            onFocus={(e) => e.target.select()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onBlur={(e) => {
                                                const next = e.target.value.trim() || ELEMENT_DEFS[el.kind].label;
                                                if (next !== el.label) snapshot();
                                                updateElement(el.id, { label: next });
                                                setEditingId(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    (e.target as HTMLTextAreaElement).blur();
                                                }
                                            }}
                                        />
                                    ) : (
                                        <ElementBody el={el} />
                                    )}
                                    {selected?.id === el.id && (
                                        <div
                                            className="mk-resize-handle"
                                            onPointerDown={(e) => beginDrag(e, el.id, 'resize')}
                                        />
                                    )}
                                </div>
                            ))}
                            {marquee && (
                                <div
                                    className="mockup-marquee"
                                    style={{
                                        left: `${marquee.x0}%`,
                                        top: `${(marquee.y0 / pageUnits) * 100}%`,
                                        width: `${marquee.x1 - marquee.x0}%`,
                                        height: `${((marquee.y1 - marquee.y0) / pageUnits) * 100}%`,
                                    }}
                                />
                            )}
                        </div>
                    </div>
                    {libraryOpen && (
                        <MockupTemplateLibrary key={libraryCategory ?? 'all'} initialCategory={libraryCategory} onAdd={addPreset} onClose={closeTemplateLibrary} notice={templateNotice} />
                    )}
                    {showHelp && !libraryOpen && (
                        <div className="mockup-help" onPointerDown={(e) => e.stopPropagation()}>
                            <p><strong>Click</strong> a palette item to place it. <strong>Drag</strong> to move, drag the corner to resize.</p>
                            <p><strong>Drag on empty canvas</strong> to box-select; <strong>Shift-click</strong> to add or remove. Selected elements move, duplicate, and delete together. <strong>⌘A</strong> selects all.</p>
                            <p><strong>Double-click</strong> to rename an element — names guide the AI ("Pricing card", "Play button").</p>
                            <p><strong>Notes</strong> are instructions to the AI, not visible elements.</p>
                            <p><strong>Layouts stack:</strong> adding another layout places it below the fold — the canvas scrolls. <strong>⌘Z</strong> undoes, <strong>⇧⌘Z</strong> redoes.</p>
                            <p>When you send, the arrangement + your description become one generated design.</p>
                        </div>
                    )}
                </div>

                {/* Right: tool strip */}
                <aside className="mockup-tools" hidden={libraryOpen}>
                    <button className={`mockup-tool-btn ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="Select / move">
                        <CursorIcon />
                    </button>
                    <button className={`mockup-tool-btn ${tool === 'note' ? 'active' : ''}`} onClick={() => setTool(tool === 'note' ? 'select' : 'note')} title="Add note (click the canvas)">
                        <NoteIcon />
                    </button>
                    <div className="mockup-tools-divider" />
                    <button className="mockup-tool-btn" onClick={duplicateSelected} disabled={selectedIds.length === 0} title="Duplicate selected">
                        <CopyIcon />
                    </button>
                    <button className="mockup-tool-btn" onClick={() => moveLayer(1)} disabled={!selected} title="Bring forward">
                        <LayerUpIcon />
                    </button>
                    <button className="mockup-tool-btn" onClick={() => moveLayer(-1)} disabled={!selected} title="Send backward">
                        <LayerDownIcon />
                    </button>
                    <button className="mockup-tool-btn danger" onClick={deleteSelected} disabled={selectedIds.length === 0} title="Delete selected">
                        <TrashIcon />
                    </button>
                    <div className="mockup-tools-divider" />
                    <button className={`mockup-tool-btn ${showHelp ? 'active' : ''}`} onClick={() => setShowHelp(h => !h)} title="Help">
                        <InfoIcon />
                    </button>
                </aside>
            </div>

            {notice && (
                <div className="mockup-notice">
                    <GenerationNotice notice={notice} disabled={isLoading} />
                </div>
            )}

            {/* Bottom: prompt bar */}
            <div className="mockup-prompt-bar">
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your design, style, and interactivity. Once sent, DB will create an HTML and your design is saved."
                    disabled={isLoading}
                    rows={1}
                />
                <button className="mockup-send-btn" onClick={handleSend} disabled={!canSend} title="Generate design">
                    {isLoading ? <ThinkingIcon /> : <SendIcon />}
                </button>
            </div>
        </div>
    );
};

export default MockupStudio;
