import React, { useEffect, useMemo, useState } from 'react';
import { SceneDocument, SceneNode } from './scene/document';
import { SceneOperation } from './scene/operations';
import { createPortal } from 'react-dom';

interface SceneGraphProps {
    document: SceneDocument;
    selection: string[];
    onSelect: (ids: string[]) => void;
    onCommitOps: (ops: SceneOperation[]) => void;
    onAskAI: (preset: string) => void;
}

interface TreeRow {
    node: SceneNode;
    depth: number;
    children: string[];
}

const KIND_BADGE: Record<string, string> = {
    mesh: '◆', group: '▣', light: '☀', camera: '◉', customScript: 'ƒ',
};

function flattenTree(doc: SceneDocument): { rows: TreeRow[]; byId: Map<string, TreeRow> } {
    const byId = new Map<string, TreeRow>();
    const children = new Map<string | null, string[]>();
    for (const n of doc.nodes) {
        const key = n.parentId;
        children.set(key, [...(children.get(key) || []), n.id]);
    }
    const rows: TreeRow[] = [];
    const visit = (id: string, depth: number) => {
        const node = doc.nodes.find(n => n.id === id);
        if (!node || byId.has(id)) return;
        const row: TreeRow = { node, depth, children: children.get(id) || [] };
        byId.set(id, row);
        rows.push(row);
        for (const cid of row.children) visit(cid, depth + 1);
    };
    for (const n of doc.nodes) {
        if (!n.parentId || !doc.nodes.some(p => p.id === n.parentId)) visit(n.id, 0);
    }
    return { rows, byId };
}

/**
 * Searchable scene tree: rename inline, visibility/lock toggles, reparent by
 * drag, duplicate/delete, multi-select (shift/ctrl), right-click actions.
 * Selection and ops stay synced with viewport, inspector, and chat through
 * the shared document and stable node IDs.
 */
const SceneGraph: React.FC<SceneGraphProps> = ({ document, selection, onSelect, onCommitOps, onAskAI }) => {
    const [query, setQuery] = useState('');
    const [renaming, setRenaming] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggleGroup = (id: string) => setCollapsed(prev => {
        const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
    useEffect(() => {
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, []);

    const { rows, byId } = useMemo(() => flattenTree(document), [document]);

    const visibleRows = useMemo(() => {
        if (!query.trim()) return rows.filter(row => {
            let parent = row.node.parentId;
            const seen = new Set<string>();
            while (parent && !seen.has(parent)) {
                if (collapsed.has(parent)) return false;
                seen.add(parent); parent = byId.get(parent)?.node.parentId;
            }
            return true;
        });
        const q = query.toLowerCase();
        const match = new Set<string>();
        for (const n of document.nodes) {
            if (n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) {
                match.add(n.id);
                // include ancestors for context
                let cur: SceneNode | undefined = n;
                while (cur?.parentId && !match.has(cur.parentId)) { match.add(cur.parentId); cur = document.nodes.find(x => x.id === cur.parentId); }
            }
        }
        return rows.filter(r => match.has(r.node.id));
    }, [rows, byId, document.nodes, query, collapsed]);

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            onSelect(selection.includes(id) ? selection.filter(s => s !== id) : [...selection, id]);
        } else {
            onSelect([id]);
        }
    };

    const handleRowClick = (id: string, e: React.MouseEvent) => {
        toggleSelect(id, e);
        setMenu(null);
    };

    const handleContextMenu = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (!selection.includes(id)) onSelect([id]);
        setMenu({ nodeId: id, x: Math.min(e.clientX, window.innerWidth - 176), y: Math.max(8, Math.min(e.clientY, window.innerHeight - 280)) });
    };

    const commitRename = (id: string, name: string) => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== document.nodes.find(n => n.id === id)?.name) {
            onCommitOps([{ op: 'node.rename', id, name: trimmed }]);
        }
        setRenaming(null);
    };

    const handleDrop = (targetId: string) => {
        if (!dragId || dragId === targetId) return;
        onCommitOps([{ op: 'node.reparent', id: dragId, parentId: targetId }]);
        setDragId(null);
    };

    const menuActions = (id: string) => ([
        { label: 'Rename', run: () => setRenaming(id) },
        { label: 'Duplicate', run: () => onCommitOps([{ op: 'node.duplicate', id }]) },
        {
            label: 'Animate', run: () => onAskAI(`Animate node ${id}`),
        },
        {
            label: 'Change Material', run: () => onAskAI(`Change the material of node ${id}`),
        },
        {
            label: document.nodes.find(n => n.id === id)?.physics
                ? 'Remove Physics' : 'Add Physics',
            run: () => document.nodes.find(n => n.id === id)?.physics
                ? onCommitOps([{ op: 'physics.configure', id, physics: null }])
                : onCommitOps([{ op: 'physics.configure', id, physics: {} }]),
        },
        { label: 'Explain', run: () => onAskAI(`Explain what node ${id} is and does in this scene`) },
        { label: 'Ask AI', run: () => onAskAI(`About node ${id}: `) },
        { label: 'Delete', run: () => { if (window.confirm('Delete this node and its children?')) onCommitOps([{ op: 'node.remove', id }]); }, danger: true },
    ]);

    return (
        <div className="omneon-tree">
            <input
                className="omneon-tree-search"
                placeholder="Search objects…" aria-label="Search scene objects"
                value={query}
                onChange={e => setQuery(e.target.value)}
            />
            <div className="omneon-tree-group-actions"><button onClick={() => setCollapsed(new Set())}>Expand all</button><button onClick={() => setCollapsed(new Set(rows.filter(r => r.children.length).map(r => r.node.id)))}>Collapse all</button></div>
            <div className="omneon-tree-list" onDragOver={e => e.preventDefault()}>
                {visibleRows.length === 0 && (
                    <div className="omneon-inspector-empty">{query ? 'No matches.' : 'Empty scene.'}</div>
                )}
                {visibleRows.map(({ node, depth, children }) => (
                    <div
                        key={node.id}
                        className={`omneon-tree-row ${selection.includes(node.id) ? 'selected' : ''} ${node.locked ? 'locked' : ''} ${!node.visible ? 'hidden-node' : ''}`}
                        style={{ paddingLeft: 8 + depth * 14 }}
                        onClick={e => handleRowClick(node.id, e)}
                        onContextMenu={e => handleContextMenu(node.id, e)}
                        tabIndex={0}
                        aria-label={`${node.name}, ${node.kind}${node.locked ? ', locked' : ''}${!node.visible ? ', hidden' : ''}`}
                        onKeyDown={e => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect([node.id]); }
                            if (e.key === 'ArrowRight' && children.length && collapsed.has(node.id)) { e.preventDefault(); toggleGroup(node.id); }
                            if (e.key === 'ArrowLeft' && children.length && !collapsed.has(node.id)) { e.preventDefault(); toggleGroup(node.id); }
                            if (e.key === 'F2' && !node.locked) { e.preventDefault(); setRenaming(node.id); }
                        }}
                        draggable={!node.locked && renaming !== node.id}
                        onDragStart={() => setDragId(node.id)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(node.id)}
                        title={node.id}
                    >
                        {children.length > 0 ? <button className="omneon-tree-expand" aria-expanded={!collapsed.has(node.id)} aria-label={`${collapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.name}`} onClick={e => { e.stopPropagation(); toggleGroup(node.id); }}>
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d={collapsed.has(node.id) ? 'm6 3 5 5-5 5' : 'm3 6 5 5 5-5'} /></svg>
                        </button> : <span className="omneon-tree-expand-spacer" />}
                        <span className="omneon-tree-badge">{KIND_BADGE[node.kind] || '◆'}</span>
                        {renaming === node.id ? (
                            <input
                                className="omneon-tree-rename"
                                autoFocus
                                defaultValue={node.name}
                                onClick={e => e.stopPropagation()}
                                onBlur={e => commitRename(node.id, e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                    if (e.key === 'Escape') { e.currentTarget.value = node.name; setRenaming(null); }
                                }}
                            />
                        ) : (
                            <span className="omneon-tree-name" onDoubleClick={() => { if (!node.locked) setRenaming(node.id); }}>
                                {node.name}
                            </span>
                        )}
                        <span className="omneon-tree-actions" onClick={e => e.stopPropagation()}>
                            <button
                                title={node.visible ? 'Hide' : 'Show'} aria-label={`${node.visible ? 'Hide' : 'Show'} ${node.name}`} aria-pressed={node.visible} disabled={node.locked}
                                onClick={() => onCommitOps([{ op: 'node.setVisible', id: node.id, visible: !node.visible }])}
                            ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2" />{!node.visible && <path d="m3 3 14 14" />}</svg></button>
                            <button
                                title={node.locked ? 'Unlock' : 'Lock'} aria-label={`${node.locked ? 'Unlock' : 'Lock'} ${node.name}`} aria-pressed={node.locked}
                                onClick={() => onCommitOps([{ op: 'node.setLocked', id: node.id, locked: !node.locked }])}
                            ><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" /><path d={node.locked ? 'M6 9V6a4 4 0 0 1 8 0v3' : 'M6 9V6a4 4 0 0 1 8 0'} /></svg></button>
                            <button aria-label={`Actions for ${node.name}`} title="Object actions" onClick={e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMenu({ nodeId: node.id, x: Math.min(rect.left, window.innerWidth - 176), y: Math.max(8, Math.min(rect.bottom, window.innerHeight - 280)) });
                            }}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1" /><circle cx="10" cy="10" r="1" /><circle cx="16" cy="10" r="1" /></svg></button>
                        </span>
                    </div>
                ))}
            </div>

            {menu && createPortal(
                <>
                    <div className="omneon-menu-overlay" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
                    <div className="omneon-menu" style={{ left: menu.x, top: menu.y }}>
                        {menuActions(menu.nodeId).map(a => (
                            <button
                                key={a.label}
                                disabled={document.nodes.find(n => n.id === menu.nodeId)?.locked && ['Rename', 'Delete', 'Add Physics', 'Remove Physics'].includes(a.label)}
                                className={a.danger ? 'omneon-menu-danger' : ''}
                                onClick={() => { a.run(); setMenu(null); }}
                            >{a.label}</button>
                        ))}
                    </div>
                </>, window.document.body
            )}
        </div>
    );
};

export default SceneGraph;
