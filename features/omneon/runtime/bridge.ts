/**
 * Host-side bridge to the persistent sandboxed Three.js runtime.
 * The iframe loads ONCE and survives document edits; structural changes
 * rebuild inside the runtime while ordinary transforms/materials stay
 * incremental — camera, selection and playback are never reset.
 */
import { wrapCommand, isRuntimeEvent, RuntimeCommand, RuntimeEvent } from './protocol';

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

export class RuntimeBridge {
    private iframe: HTMLIFrameElement | null = null;
    private handlers = new Set<RuntimeEventHandler>();
    private ready = false;
    private queue: RuntimeCommand[] = [];

    constructor(private runtimeUrl = '/omneon-runtime.html') {
        window.addEventListener('message', this.onMessage);
    }

    attach(iframe: HTMLIFrameElement) {
        this.iframe = iframe;
        this.iframe.src = this.runtimeUrl;
    }

    dispose() {
        window.removeEventListener('message', this.onMessage);
        this.handlers.clear();
        this.queue = [];
        this.iframe = null;
    }

    on(handler: RuntimeEventHandler): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    private onMessage = (e: MessageEvent) => {
        if (!this.iframe || e.source !== this.iframe.contentWindow) return;
        if (!isRuntimeEvent(e.data)) return;
        if (e.data.type === 'runtimeReady') {
            this.ready = true;
            for (const cmd of this.queue) this.post(cmd);
            this.queue = [];
        }
        for (const h of this.handlers) h(e.data);
    };

    send(command: RuntimeCommand) {
        if (!this.ready) {
            this.queue.push(command);
            return;
        }
        this.post(command);
    }

    private post(command: RuntimeCommand) {
        this.iframe?.contentWindow?.postMessage(wrapCommand(command), '*');
    }
}
