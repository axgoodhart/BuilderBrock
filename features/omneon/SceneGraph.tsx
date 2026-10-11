import React, { useMemo, useState } from 'react';
import { SceneDocument, SceneNode } from './scene/document';
import { SceneOperation } from './scene/operations';

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
        if (!node) return;
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

    const { rows, byId } = useMemo(() => flattenTree(document), [document]);

    const visibleRows = useMemo(() => {
        if (!query.trim()) return rows;
        const q = query.toLowerCase();
        const match = new Set<string>();
        for (const n of document.nodes) {
            if (n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) {
                match.add(n.id);
                // include ancestors for context
                let cur = n;
                while (cur.parentId) { match.add(cur.parentId); cur = document.nodes.find(x => x.id === cur.parentId)!; }
            }
        }
        return rows.filter(r => match.has(r.node.id));
    }, [rows, document.nodes, query]);

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
        setMenu({ nodeId: id, x: e.clientX, y: e.clientY });
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
                placeholder="Search nodes…"
                value={query}
                onChange={e => setQuery(e.target.value)}
            />
            <div className="omneon-tree-list" onDragOver={e => e.preventDefault()}>
                {visibleRows.length === 0 && (
                    <div className="omneon-inspector-empty">{query ? 'No matches.' : 'Empty scene.'}</div>
                )}
                {visibleRows.map(({ node, depth }) => (
                    <div
                        key={node.id}
                        className={`omneon-tree-row ${selection.includes(node.id) ? 'selected' : ''} ${node.locked ? 'locked' : ''} ${!node.visible ? 'hidden-node' : ''}`}
                        style={{ paddingLeft: 8 + depth * 14 }}
                        onClick={e => handleRowClick(node.id, e)}
                        onContextMenu={e => handleContextMenu(node.id, e)}
                        draggable={renaming !== node.id}
                        onDragStart={() => setDragId(node.id)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(node.id)}
                        title={node.id}
                    >
                        <span className="omneon-tree-badge">{KIND_BADGE[node.kind] || '◆'}</span>
                        {renaming === node.id ? (
                            <input
                                className="omneon-tree-rename"
                                autoFocus
                                defaultValue={node.name}
                                onClick={e => e.stopPropagation()}
                                onBlur={e => commitRename(node.id, e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') commitRename(node.id, (e.target as HTMLInputElement).value);
                                    if (e.key === 'Escape') setRenaming(null);
                                }}
                            />
                        ) : (
                            <span className="omneon-tree-name" onDoubleClick={() => setRenaming(node.id)}>
                                {node.name}
                            </span>
                        )}
                        <span className="omneon-tree-actions" onClick={e => e.stopPropagation()}>
                            <button
                                title={node.visible ? 'Hide' : 'Show'}
                                onClick={() => onCommitOps([{ op: 'node.setVisible', id: node.id, visible: !node.visible }])}
                            >{node.visible ? '👁' : '—'}</button>
                            <button
                                title={node.locked ? 'Unlock' : 'Lock'}
                                onClick={() => onCommitOps([{ op: 'node.setLocked', id: node.id, locked: !node.locked }])}
                            >{node.locked ? '🔒' : '🔓'}</button>
                        </span>
                    </div>
                ))}
            </div>

            {menu && (
                <>
                    <div className="omneon-menu-overlay" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
                    <div className="omneon-menu" style={{ left: menu.x, top: menu.y }}>
                        {menuActions(menu.nodeId).map(a => (
                            <button
                                key={a.label}
                                className={a.danger ? 'omneon-menu-danger' : ''}
                                onClick={() => { a.run(); setMenu(null); }}
                            >{a.label}</button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default SceneGraph;
