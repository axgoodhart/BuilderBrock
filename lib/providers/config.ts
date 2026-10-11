/**
 * Provider credentials/config. Generation runs client-side, so keys live in
 * the browser: seeded from the Vite-injected env (Gemini) and overridable at
 * runtime via Settings → Providers (persisted to localStorage).
 *
 * NOTE: client-side keys are visible in the bundle/localStorage — fine for
 * local/prototype use, not for a public deployment. Move to a server proxy
 * before shipping publicly.
 */

// `process.env.API_KEY` is statically replaced by Vite (see vite.config.ts).
// Referenced as the exact token so the define substitution applies.
const ENV_GEMINI_KEY: string = (process.env.API_KEY as string) || '';

export interface ProviderConfig {
  geminiApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  /** Concrete model used when the selected model id is `openai-custom`. */
  openaiCustomModel: string;
  /** Mistral uses an OpenAI-compatible API; key + base URL live here. */
  mistralApiKey: string;
  mistralBaseUrl: string;
}

const LS_KEY = 'builderbrock.providerConfig';

export function defaultProviderConfig(): ProviderConfig {
  return {
    geminiApiKey: ENV_GEMINI_KEY,
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiCustomModel: '',
    mistralApiKey: '',
    mistralBaseUrl: 'https://api.mistral.ai/v1',
  };
}

export function loadProviderConfig(): ProviderConfig {
  const base = defaultProviderConfig();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    // Keep env-provided Gemini key as fallback if the user never set one.
    return { ...base, ...saved, geminiApiKey: saved.geminiApiKey || base.geminiApiKey };
  } catch {
    return base;
  }
}

export function saveProviderConfig(cfg: ProviderConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}
