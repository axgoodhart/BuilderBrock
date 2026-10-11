/**
 * Model registry — single source of truth for which models exist, who provides
 * them, and what they can do. The pipeline routes by *capability* (see
 * lib/providers), so adding a model here is enough to make it selectable and
 * correctly routed; no call site should hardcode a model id.
 *
 * Capabilities here are derived from ModelParams.json (the provider parameter
 * spec). Two things that spec makes explicit and that the code now respects:
 *   - `image` means the model accepts image INPUT (vision) — i.e. the chat
 *     models whose spec lists `supported: ["image"]`. It is NOT the `-image`
 *     generation models (those emit images and are not used for HTML output).
 *   - `temperature` is false for models that list it in `removeParams`
 *     (reasoning-class models such as GPT-6 Astra and GPT-6.1 Sol). The provider layer
 *     omits the temperature param for those, instead of erroring.
 */

export type ProviderId = 'gemini' | 'openai' | 'mistral';

export interface ModelCapabilities {
  /** Accepts text prompts (essentially always true). */
  text: boolean;
  /** Accepts image INPUT (vision). */
  image: boolean;
  /** Supports a structured/JSON output mode. */
  json: boolean;
  /** Supports token streaming. */
  stream: boolean;
  /** Accepts a `temperature` param. False for reasoning models that reject it. */
  temperature: boolean;
  /** Reasoning / "thinking" model (slower, higher quality). */
  thinking?: boolean;
}

export interface ModelDef {
  id: string;
  label: string;
  provider: ProviderId;
  desc?: string;
  capabilities: ModelCapabilities;
}

const cap = (over: Partial<ModelCapabilities>): ModelCapabilities => ({
  text: true,
  image: false,
  json: true,
  stream: true,
  temperature: true,
  ...over,
});

/**
 * Curated, current set of chat/vision models suitable for UI generation.
 * (ModelParams.json carries many more — embeddings, TTS, audio, video, image
 * generation, realtime — which this app doesn't use.) The OpenAI-compatible
 * "custom" entry can point at any base URL (OpenRouter, Ollama, LM Studio, …).
 */
export const MODELS: ModelDef[] = [
  // --- Gemini (Google) ---
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'gemini', desc: 'Latest Pro · vision', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'gemini', desc: 'Fast · vision · thinking', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-omni-flash', label: 'Gemini Omni Flash', provider: 'gemini', desc: 'Omnimodal · thinking', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', desc: 'Efficient · vision', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', desc: 'Stable Pro · vision', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', provider: 'gemini', desc: 'Newest Flash · vision', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'gemini', desc: 'Fast · vision · thinking', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'gemini', desc: 'Fast · vision · thinking', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', provider: 'gemini', desc: 'Lighter & faster · vision', capabilities: cap({ image: true, thinking: true }) },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', provider: 'gemini', desc: 'Lightweight · vision', capabilities: cap({ image: true, thinking: true }) },
  { id: 'deep-research-pro-preview-12-2025', label: 'Deep Research Pro', provider: 'gemini', desc: 'Advanced reasoning', capabilities: cap({ thinking: true }) },

  // --- OpenAI / OpenAI-compatible ---
  { id: 'gpt-5.6-astra', label: 'GPT-5.6 Astra', provider: 'openai', desc: 'Frontier reasoning · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', provider: 'openai', desc: 'Complex work · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'openai', desc: 'Balanced · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'openai', desc: 'Fast · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', provider: 'openai', desc: 'Frontier reasoning · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol', provider: 'openai', desc: 'Workhorse · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai', desc: 'Latest Sol · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-6-terra', label: 'GPT-6 Terra', provider: 'openai', desc: 'Balanced · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai', desc: 'Fast · vision', capabilities: cap({ image: true, thinking: true, temperature: false }) },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai', desc: 'Default · vision', capabilities: cap({ image: true }) },
  { id: 'openai-custom', label: 'Custom endpoint', provider: 'openai', desc: 'OpenAI-compatible (set base URL + model)', capabilities: cap({ image: true }) },

  // --- Mistral (OpenAI-compatible API) ---
  { id: 'mistral-large-latest', label: 'Mistral Large', provider: 'mistral', desc: 'Flagship', capabilities: cap({}) },
  { id: 'mistral-medium-latest', label: 'Mistral Medium', provider: 'mistral', desc: 'Balanced', capabilities: cap({}) },
  { id: 'magistral-medium-latest', label: 'Magistral Medium', provider: 'mistral', desc: 'Reasoning', capabilities: cap({ thinking: true }) },
  { id: 'pixtral-large-latest', label: 'Pixtral Large', provider: 'mistral', desc: 'Vision', capabilities: cap({ image: true }) },
  { id: 'codestral-latest', label: 'Codestral', provider: 'mistral', desc: 'Code-specialized', capabilities: cap({}) },
];

/** Keep saved Settings choices on OpenAI models included in the picker. */
const RETIRED_OPENAI_MODEL_REPLACEMENTS: Record<string, string> = {
  'gpt-5.4': 'gpt-5.6-sol',
  'gpt-5.5': 'gpt-5.6-sol',
};

export function replaceRetiredModelId(id: string): string {
  if (/^(?:gpt-4o|chatgpt-4o)(?:-|$)/.test(id)) {
    return /^gpt-4o-mini(?:-|$)/.test(id) ? 'gpt-6-luna' : 'gpt-4.1';
  }
  if (/^o[134](?:-|$)/.test(id)) {
    return /^o[134]-mini(?:-|$)/.test(id) ? 'gpt-6-luna' : 'gpt-6.1-sol';
  }
  return RETIRED_OPENAI_MODEL_REPLACEMENTS[id] || id;
}

export const DEFAULT_TEXT_MODEL = 'gemini-3-flash-preview';
export const DEFAULT_SMART_MODEL = 'gemini-3.1-pro-preview';
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-pro-preview';

export function getModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

export function listModels(): ModelDef[] {
  return MODELS;
}

export function listModelsByProvider(): Record<ProviderId, ModelDef[]> {
  return MODELS.reduce((acc, m) => {
    (acc[m.provider] ||= []).push(m);
    return acc;
  }, {} as Record<ProviderId, ModelDef[]>);
}

/** Infer the provider for an id even if it isn't in the registry. */
export function providerForModel(id: string): ProviderId {
  const def = getModel(id);
  if (def) return def.provider;
  if (id.startsWith('gemini') || id.startsWith('gemma') || id.startsWith('deep-research')) return 'gemini';
  if (id.startsWith('mistral') || id.startsWith('pixtral') || id.startsWith('codestral') || id.startsWith('magistral') || id.startsWith('ministral') || id.startsWith('devstral')) return 'mistral';
  return 'openai';
}

export function hasCapability(id: string, capability: keyof ModelCapabilities): boolean {
  return Boolean(getModel(id)?.capabilities[capability]);
}

/**
 * Resolve a model suitable for image-grounded (vision) work. Prefers the
 * caller's selected model if it accepts image input, then a vision model from
 * the same provider, then the global default vision model.
 */
export function pickImageModel(preferredId?: string): string {
  if (preferredId) {
    const m = getModel(preferredId);
    if (m?.capabilities.image) return preferredId;
    if (m) {
      const sameProvider = MODELS.find((x) => x.provider === m.provider && x.capabilities.image);
      if (sameProvider) return sameProvider.id;
    }
  }
  return DEFAULT_IMAGE_MODEL;
}
