import React, { useEffect, useRef, useState } from 'react';
import { SceneDocument } from './scene/document';
import { RuntimeBridge } from './runtime/bridge';

/** An isolated view: previews never send edits back to the workbench. */
export default function ScenePreview({ document, label }: { document: SceneDocument; label: string }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const bridge = useRef<RuntimeBridge | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        setReady(false);
        setError('');
        const runtime = new RuntimeBridge();
        bridge.current = runtime;
        const timeout = window.setTimeout(() => setError('Preview could not load. Try again.'), 15000);
        const off = runtime.on(event => {
            if (event.type === 'runtimeReady') { clearTimeout(timeout); setReady(true); setError(''); }
            if (event.type === 'runtimeError') setError(event.message);
        });
        if (frame.current) runtime.attach(frame.current);
        return () => { clearTimeout(timeout); off(); runtime.dispose(); };
    }, [attempt]);
    useEffect(() => {
        if (!ready) return;
        bridge.current?.send({ type: 'loadScene', document: {
            ...document,
            nodes: document.nodes.map(node => ({ ...node, customScript: null, interactions: [], physics: null })),
        } });
        bridge.current?.send({ type: 'setTransformMode', mode: null });
    }, [document, ready]);
    return <figure className="omneon-preview">
        <iframe ref={frame} title={label} sandbox="allow-scripts" tabIndex={-1} />
        <figcaption>{label}</figcaption>
        {!ready && !error && <span className="omneon-preview-state" role="status">Loading preview…</span>}
        {error && <div className="omneon-preview-state" role="status">{error}<button onClick={() => setAttempt(n => n + 1)}>Retry preview</button></div>}
    </figure>;
}
