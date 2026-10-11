import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../lib/api';
import { AssetRecord } from '../../lib/api';

interface AssetPanelProps {
    /** Currently selected node ids (for "apply texture to selection"). */
    selection: string[];
    /** Apply an asset to the scene via the single ops path. */
    onApplyAsset: (asset: AssetRecord, target: 'scene' | 'selection' | 'environment') => void;
}

const KIND_ICON: Record<string, string> = {
    model: '◆', texture: '🖼', hdr: '🌐', audio: '♪', script: '{ }', other: '·',
};

/**
 * Asset library panel: browse imported assets, upload local files,
 * and pull resources from a configured MCP server. Applying an asset
 * always goes through the caller (typed SceneOperation[] path).
 */
const AssetPanel: React.FC<AssetPanelProps> = ({ selection, onApplyAsset }) => {
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [mcpOpen, setMcpOpen] = useState(false);
    const [mcpUrl, setMcpUrl] = useState('');
    const [mcpResources, setMcpResources] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const refresh = useCallback(async (q?: string) => {
        try {
            setAssets(await api.listAssets(q));
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const uploadFiles = useCallback(async (files: FileList | File[]) => {
        setBusy(true);
        setError(null);
        try {
            for (const file of Array.from(files)) {
                const buf = await file.arrayBuffer();
                let binary = '';
                const bytes = new Uint8Array(buf);
                for (let i = 0; i < bytes.length; i += 0x8000) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                }
                await api.importLocalAsset({ name: file.name, contentBase64: btoa(binary) });
            }
            await refresh(search);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }, [refresh, search]);

    const connectMcp = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await api.configureMcp({ url: mcpUrl });
            setMcpResources(await api.listMcpResources());
        } catch (e: any) {
            setError(`MCP: ${e.message}`);
        } finally {
            setBusy(false);
        }
    }, [mcpUrl]);

    const importResource = useCallback(async (uri: string, name?: string) => {
        setBusy(true);
        try {
            await api.importMcpResource(uri, name);
            await refresh(search);
        } catch (e: any) {
            setError(`MCP import: ${e.message}`);
        } finally {
            setBusy(false);
        }
    }, [refresh, search]);

    return (
        <div className="omneon-assets">
            <div className="omneon-inspector-title">Assets</div>
            <div className="omneon-assets-toolbar">
                <input
                    className="omneon-assets-search"
                    placeholder="Search assets…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); refresh(e.target.value); }}
                />
                <button onClick={() => fileInputRef.current?.click()} disabled={busy}>Import…</button>
                <button className={mcpOpen ? 'omneon-active' : ''} onClick={() => setMcpOpen(o => !o)}>MCP</button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
                />
            </div>

            {mcpOpen && (
                <div className="omneon-assets-mcp">
                    <input
                        placeholder="MCP server URL (streamable HTTP)…"
                        value={mcpUrl}
                        onChange={e => setMcpUrl(e.target.value)}
                    />
                    <button onClick={connectMcp} disabled={busy || !mcpUrl.trim()}>Connect</button>
                    {mcpResources.map((r, i) => (
                        <div key={i} className="omneon-asset-row">
                            <span className="omneon-asset-name">{r.name || r.uri}</span>
                            <button onClick={() => importResource(r.uri, r.name)} disabled={busy}>Import</button>
                        </div>
                    ))}
                </div>
            )}

            {error && <div className="omneon-assets-error" onClick={() => setError(null)}>{error}</div>}
            {assets.length === 0 && !error && (
                <div className="omneon-inspector-empty">
                    No assets yet. Import GLB models, textures, or HDR environments — or drop files onto the viewport.
                </div>
            )}
            {assets.map(asset => (
                <div key={asset.id} className="omneon-asset-card">
                    <div className="omneon-asset-thumb">
                        {asset.thumbnail
                            ? <img src={asset.thumbnail} alt="" />
                            : <span>{KIND_ICON[asset.kind] || '·'}</span>}
                    </div>
                    <div className="omneon-asset-info">
                        <div className="omneon-asset-name">{asset.name}</div>
                        <div className="omneon-asset-meta">{asset.kind} · {(asset.sizeBytes / 1024).toFixed(1)} KB · {asset.origin}</div>
                        <div className="omneon-asset-actions">
                            {asset.kind === 'model' && (
                                <button onClick={() => onApplyAsset(asset, 'scene')}>Add to scene</button>
                            )}
                            {asset.kind === 'texture' && (
                                <button
                                    disabled={selection.length === 0}
                                    title={selection.length === 0 ? 'Select a mesh first' : `Apply to ${selection.length} selected`}
                                    onClick={() => onApplyAsset(asset, 'selection')}
                                >Apply to selection</button>
                            )}
                            {asset.kind === 'hdr' && (
                                <button onClick={() => onApplyAsset(asset, 'environment')}>Set as environment</button>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AssetPanel;
