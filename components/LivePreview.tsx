import React, { useState, useRef, useCallback, useEffect } from 'react';
import { DesktopIcon, TabletIcon, PhoneIcon, RefreshIcon, EditIcon, GridIcon, LayerUpIcon } from './Icons';
import GenerationNotice, { GenerationNoticeView } from './GenerationNotice';

type Viewport = 'desktop' | 'tablet' | 'mobile';

// ==== ZOOM ====
const ZOOM_MIN = 25;     // %
const ZOOM_MAX = 200;    // %
const ZOOM_STEP = 5;     // %
const VIEWPORT_MAX_WIDTH: Record<Viewport, number> = { desktop: Infinity, tablet: 768, mobile: 375 };

interface LivePreviewProps {
    html: string | null;
    artifactId: string | null;
    isStreaming: boolean;
    overrideHtml?: string | null;
    onOpenRefinement?: () => void;
    onOpenMockup?: () => void;
    onOpenWireframe?: () => void;
    notice?: GenerationNoticeView | null;
    noticeDisabled?: boolean;
}

const LivePreview: React.FC<LivePreviewProps> = ({ html, artifactId, isStreaming, overrideHtml, onOpenRefinement, onOpenMockup, onOpenWireframe, notice, noticeDisabled }) => {
    const [viewport, setViewport] = useState<Viewport>('desktop');
    const [refreshKey, setRefreshKey] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [frameBox, setFrameBox] = useState({ w: 0, h: 0 });
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);

    const handleRefresh = useCallback(() => {
        setRefreshKey(k => k + 1);
    }, []);

    const viewportClass = viewport === 'desktop' ? '' : viewport;

    // If the code editor has live changes, show those via srcDoc
    const displayHtml = overrideHtml ?? html;
    // During streaming or live editing: use srcDoc for progressive rendering.
    // After streaming: use a real server URL so the iframe gets a proper
    // document context (import maps, ES modules, WebGL all work).
    const useServerPreview = !overrideHtml && !isStreaming && artifactId;

    // Track the container's content box: the artifact always lays out at its 100% size, then is scaled.
    const hasFrame = !!displayHtml;
    useEffect(() => {
        const el = frameRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setFrameBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, [hasFrame]);

    const scale = zoom / 100;
    const layoutW = Math.min(frameBox.w, VIEWPORT_MAX_WIDTH[viewport]);
    const layoutH = frameBox.h;
    const measured = frameBox.w > 0;
    const sizerStyle = measured ? { width: layoutW * scale, height: layoutH * scale } : undefined;
    const iframeStyle = measured ? { width: layoutW, height: layoutH, transform: `scale(${scale})` } : undefined;

    return (
        <div className="live-preview">
            <div className="preview-toolbar">
                <div className="viewport-buttons">
                    <button
                        className={viewport === 'desktop' ? 'active' : ''}
                        onClick={() => setViewport('desktop')}
                        title="Desktop"
                    >
                        <DesktopIcon />
                    </button>
                    <button
                        className={viewport === 'tablet' ? 'active' : ''}
                        onClick={() => setViewport('tablet')}
                        title="Tablet"
                    >
                        <TabletIcon />
                    </button>
                    <button
                        className={viewport === 'mobile' ? 'active' : ''}
                        onClick={() => setViewport('mobile')}
                        title="Mobile"
                    >
                        <PhoneIcon />
                    </button>
                </div>
                <div className="preview-zoom">
                    <button className="preview-zoom-label" onClick={() => setZoom(100)} title="Reset zoom to 100%">
                        {zoom}%
                    </button>
                    <input
                        type="range"
                        className="preview-zoom-slider"
                        min={ZOOM_MIN}
                        max={ZOOM_MAX}
                        step={ZOOM_STEP}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        onDoubleClick={() => setZoom(100)}
                        aria-label="Preview zoom"
                    />
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {onOpenWireframe && !isStreaming && (
                        <button className="refine-btn open-wireframe-btn" onClick={onOpenWireframe} title="Open the wireframe this design was generated from">
                            <LayerUpIcon /> <span>Wireframe</span>
                        </button>
                    )}
                    {onOpenMockup && !isStreaming && (
                        <button className="refine-btn" onClick={onOpenMockup} title="Mockup Studio (compose a new design)">
                            <GridIcon />
                        </button>
                    )}
                    {html && !isStreaming && onOpenRefinement && (
                        <button className="refine-btn" onClick={onOpenRefinement} title="Refine with AI">
                            <EditIcon />
                        </button>
                    )}
                    <button className="refresh-btn" onClick={handleRefresh} title="Refresh preview">
                        <RefreshIcon />
                    </button>
                </div>
            </div>
            {notice && !overrideHtml && (
                <div className="preview-notice">
                    <GenerationNotice notice={notice} disabled={noticeDisabled} />
                </div>
            )}
            {displayHtml ? (
                <div className={`preview-frame-container ${zoom > 100 ? 'zoomed-in' : ''}`} ref={frameRef}>
                    <div className="preview-zoom-sizer" style={sizerStyle}>
                        {useServerPreview ? (
                            <iframe
                                key={`${artifactId}-${refreshKey}`}
                                ref={iframeRef}
                                src={`/api/artifacts/${artifactId}/preview?v=${refreshKey}`}
                                title="Live Preview"
                                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                                className={`preview-iframe ${viewportClass}`}
                                style={iframeStyle}
                            />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={displayHtml}
                                title="Live Preview"
                                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                                className={`preview-iframe ${viewportClass}`}
                                style={iframeStyle}
                            />
                        )}
                    </div>
                </div>
            ) : notice ? null : (
                <div className="preview-empty">
                    <div className="preview-empty-icon"><DesktopIcon /></div>
                    <div className="preview-empty-title">No preview</div>
                    <div className="preview-empty-hint">Select an artifact from the file tree, or use Implement mode to generate new designs.</div>
                    {onOpenMockup && (
                        <button className="preview-empty-action" onClick={onOpenMockup}>
                            <GridIcon /> Compose in Mockup Studio
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default LivePreview;
