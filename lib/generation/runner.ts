/**
 * One streaming pipeline for every HTML generation (implement, mockup, retry,
 * resume, fix). Never throws: it returns what happened and how far it got.
 */
import { llmGenerateStream, GenRequest, ProviderConfig } from '../providers';
import { GenIssue, preflight, classifyError, emptyIssue, dbIssue } from './issues';
import { checkOutput, OutputWarning } from './validate';

// ==== RUNNER ====
const CHECKPOINT_MS = 4000; // how often partial HTML is persisted mid-stream

export interface RunHooks {
    onStart?: () => Promise<void>; // first token arrived — create DB rows here
    onText?: (html: string) => void;
    onCheckpoint?: (html: string) => Promise<unknown>;
}

export type RunResult =
    | { ok: true; started: true; html: string; warnings: OutputWarning[] }
    | { ok: false; started: boolean; html: string; issue: GenIssue };

export function stripFences(raw: string): string {
    return raw.replace(/^\s*```(?:html)?[^\n]*\n?/i, '').replace(/\n?```\s*$/, '');
}

/** `prefix` is existing HTML to continue from (resume); new text is appended to it. */
export async function runGeneration(req: GenRequest, cfg: ProviderConfig, hooks: RunHooks = {}, prefix = ''): Promise<RunResult> {
    const pre = preflight(req.model, cfg);
    if (pre) return { ok: false, started: false, html: prefix, issue: pre };

    let raw = '';
    let started = false;
    let lastCheckpoint = Date.now();
    let checkpoints: Promise<unknown> = Promise.resolve();
    const current = () => prefix + stripFences(raw);

    try {
        for await (const chunk of llmGenerateStream(req, cfg)) {
            if (!chunk) continue;
            if (!started) {
                try {
                    await hooks.onStart?.();
                } catch (e) {
                    return { ok: false, started: false, html: prefix, issue: dbIssue(e, req.model) };
                }
                started = true;
            }
            raw += chunk;
            hooks.onText?.(current());
            if (hooks.onCheckpoint && Date.now() - lastCheckpoint > CHECKPOINT_MS) {
                lastCheckpoint = Date.now();
                const snapshot = current();
                checkpoints = checkpoints.then(() => hooks.onCheckpoint!(snapshot)).catch(() => {});
            }
        }
    } catch (e) {
        await checkpoints;
        return { ok: false, started, html: started ? current().trim() : prefix, issue: classifyError(e, req.model) };
    }

    await checkpoints;
    const html = current().trim();
    if (!started || !stripFences(raw).trim()) return { ok: false, started, html: prefix, issue: emptyIssue(req.model) };
    return { ok: true, started: true, html, warnings: checkOutput(html) };
}
