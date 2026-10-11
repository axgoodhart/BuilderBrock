/**
 * What went wrong with a generation, in words a person can act on.
 * Persisted on the artifact as JSON in `errorMessage` (see encodeDiagnostics).
 */
import { resolveProvider, ProviderConfig } from '../providers';
import { MODELS, getModel, providerForModel, DEFAULT_TEXT_MODEL, DEFAULT_SMART_MODEL, ProviderId } from '../models';
import type { OutputWarning } from './validate';

export type IssueKind =
    | 'config' | 'auth' | 'quota' | 'rate_limit' | 'network' | 'model'
    | 'bad_request' | 'server' | 'empty' | 'db' | 'interrupted' | 'unknown';

export interface GenIssue {
    kind: IssueKind;
    message: string;
    model: string;
    at: number;
    retryAfterSec?: number;
    detail?: string; // raw provider text, for the Details disclosure
}

export type RecoveryMode = 'retry' | 'resume' | 'fix';

export interface Diagnostics {
    issue?: GenIssue;
    warnings?: OutputWarning[];
    failedAction?: RecoveryMode; // a recovery attempt that never started
}

export const ISSUE_TITLES: Record<IssueKind, string> = {
    config: 'Not configured',
    auth: 'API key rejected',
    quota: 'Quota reached',
    rate_limit: 'Rate limited',
    network: "Couldn't connect",
    model: 'Model unavailable',
    bad_request: 'Request rejected',
    server: 'Provider error',
    empty: 'Empty response',
    db: "Couldn't save",
    interrupted: 'Interrupted',
    unknown: 'Generation failed',
};

const PROVIDER_NAMES: Record<ProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI', mistral: 'Mistral' };

/** Kinds where switching provider is the likely fix, so Settings is worth offering. */
export const PROVIDER_LEVEL_KINDS: IssueKind[] = ['config', 'auth', 'quota'];

export function modelLabel(id: string): string {
    return getModel(id)?.label || id;
}

const issue = (kind: IssueKind, message: string, model: string, extra: Partial<GenIssue> = {}): GenIssue =>
    ({ kind, message, model, at: Date.now(), ...extra });

/** Missing key / model before anything is sent. Null when the model is callable. */
export function preflight(model: string, cfg: ProviderConfig): GenIssue | null {
    try {
        resolveProvider(model, cfg);
        return null;
    } catch (e: any) {
        return issue('config', e?.message || 'Provider not configured.', model);
    }
}

export function emptyIssue(model: string): GenIssue {
    return issue('empty', `${modelLabel(model)} returned nothing. Try again or use a different model.`, model);
}

export function dbIssue(e: any, model: string): GenIssue {
    return issue('db', "The local server didn't save the result — is it running?", model, { detail: String(e?.message || e) });
}

/** Map an SDK / fetch / HTTP error to a kind + plain-language message. */
export function classifyError(e: any, model: string): GenIssue {
    const raw = String(e?.message || e || 'Unknown error');
    const detail = raw.slice(0, 600);
    const provider = PROVIDER_NAMES[providerForModel(model)];
    const statusFromText = raw.match(/\b(?:status:?|error)\s*(\d{3})\b/i)?.[1];
    const status = Number(e?.status || statusFromText) || 0;
    const retryAfterSec = Number(e?.retryAfter) || Number(raw.match(/retryDelay"?\s*:\s*"(\d+)/)?.[1]) || undefined;

    if (/not set|No model set/i.test(raw)) return issue('config', raw, model);
    if (status === 401 || status === 403 || /api key not valid|invalid api key|incorrect api key|unauthori[sz]ed|permission denied/i.test(raw)) {
        return issue('auth', `${provider} rejected the API key. Check it in Settings → Providers.`, model, { detail });
    }
    if (status === 429 || /resource.?exhausted|rate.?limit/i.test(raw)) {
        if (/quota|billing|insufficient_quota|exceeded your current/i.test(raw) && !retryAfterSec) {
            return issue('quota', `${provider} quota or billing limit reached.`, model, { detail });
        }
        const wait = retryAfterSec ? ` Try again in ~${retryAfterSec}s.` : ' Wait a moment and try again.';
        return issue('rate_limit', `${provider} is rate limiting requests.${wait}`, model, { detail, retryAfterSec });
    }
    if (status === 404 || /model.{0,40}(not found|does not exist|not supported)|unknown model/i.test(raw)) {
        return issue('model', `${provider} doesn't recognise “${modelLabel(model)}”.`, model, { detail });
    }
    if (status >= 500) {
        return issue('server', `${provider} had a server problem (${status}). Try again shortly.`, model, { detail });
    }
    if (status === 400) {
        return issue('bad_request', `${provider} rejected the request: ${raw.replace(/^.*?:\s*/, '').slice(0, 160)}`, model, { detail });
    }
    if (/failed to fetch|networkerror|load failed|fetch failed|network|ECONN|ENOTFOUND|timed? ?out/i.test(raw)) {
        return issue('network', `Couldn't reach ${provider}. Check your connection or the base URL.`, model, { detail });
    }
    return issue('unknown', raw.slice(0, 200), model, { detail });
}

/** A different, callable model to offer as "Retry with …". Prefers another provider. */
export function suggestFallbackModel(failed: string, cfg: ProviderConfig, needsImage = false): string | null {
    const failedProvider = providerForModel(failed);
    const ordered = [DEFAULT_TEXT_MODEL, DEFAULT_SMART_MODEL, ...MODELS.map(m => m.id)];
    const usable = ordered.filter((id, i) =>
        ordered.indexOf(id) === i
        && id !== failed
        && id !== 'openai-custom'
        && (!needsImage || getModel(id)?.capabilities.image)
        && !preflight(id, cfg)
    );
    return usable.find(id => providerForModel(id) !== failedProvider) || usable[0] || null;
}

export function encodeDiagnostics(d: Diagnostics): string | null {
    return d.issue || d.warnings?.length ? JSON.stringify(d) : null;
}

export function parseDiagnostics(s?: string | null): Diagnostics {
    if (!s) return {};
    try {
        return JSON.parse(s);
    } catch {
        return { issue: issue('unknown', s, '') }; // legacy plain-text errorMessage
    }
}
