/**
 * Provider resolution + convenience wrappers. Call sites import `llmGenerate`
 * / `llmGenerateStream`, pass a normalized GenRequest with a registry model id,
 * and never touch a vendor SDK directly.
 */
import { providerForModel, getModel } from '../models';
import { GenRequest, LLMProvider } from './types';
import { createGeminiProvider } from './gemini';
import { createOpenAIProvider } from './openai';
import { ProviderConfig, loadProviderConfig } from './config';

export type { GenRequest, GenImage, LLMProvider } from './types';
export type { ProviderConfig } from './config';
export { loadProviderConfig, saveProviderConfig, defaultProviderConfig } from './config';

/**
 * Build the right adapter for a model id and return the concrete model string
 * to call with (resolving the `openai-custom` alias to the configured model).
 */
export function resolveProvider(
  modelId: string,
  cfg: ProviderConfig
): { provider: LLMProvider; modelId: string } {
  const providerId = providerForModel(modelId);

  if (providerId === 'gemini') {
    if (!cfg.geminiApiKey) {
      throw new Error('Gemini API key not set. Add it in Settings → Providers.');
    }
    return { provider: createGeminiProvider(cfg.geminiApiKey), modelId };
  }

  if (providerId === 'mistral') {
    if (!cfg.mistralApiKey) {
      throw new Error('Mistral API key not set. Add it in Settings → Providers.');
    }
    // Mistral exposes an OpenAI-compatible /chat/completions API.
    return {
      provider: createOpenAIProvider({ apiKey: cfg.mistralApiKey, baseUrl: cfg.mistralBaseUrl }),
      modelId,
    };
  }

  // OpenAI-compatible
  const realModel = modelId === 'openai-custom' ? cfg.openaiCustomModel.trim() : modelId;
  if (!realModel) {
    throw new Error('No model set for the custom endpoint. Add one in Settings → Providers.');
  }
  const usingOpenAiCloud = /(^|\.)openai\.com/.test(cfg.openaiBaseUrl);
  if (usingOpenAiCloud && !cfg.openaiApiKey) {
    throw new Error('OpenAI API key not set. Add it in Settings → Providers.');
  }
  return {
    provider: createOpenAIProvider({ apiKey: cfg.openaiApiKey, baseUrl: cfg.openaiBaseUrl }),
    modelId: realModel,
  };
}

/**
 * Reconcile a request with a model's spec, so we never send params it rejects:
 *   - `temperature` is dropped for reasoning-class models (GPT-5.6/6/6.1, …)
 *     that list it in removeParams — sending it would error.
 *   - `reasoningEffort` is dropped unless the model is a known thinking model,
 *     so it's never sent to a model (or generic endpoint) that doesn't accept it.
 * Unknown/custom models keep temperature (user stays in control of that one).
 */
function applyModelSchema(req: GenRequest): GenRequest {
  const def = getModel(req.model);
  let out: GenRequest = req;

  if (def && def.capabilities.temperature === false && out.temperature !== undefined) {
    const { temperature, ...rest } = out;
    out = rest;
  }
  if (out.reasoningEffort && !(def && def.capabilities.thinking)) {
    const { reasoningEffort, ...rest } = out;
    out = rest;
  }
  return out;
}

export async function llmGenerate(req: GenRequest, cfg?: ProviderConfig): Promise<string> {
  const config = cfg || loadProviderConfig();
  const shaped = applyModelSchema(req);
  const { provider, modelId } = resolveProvider(shaped.model, config);
  return provider.generate({ ...shaped, model: modelId });
}

export async function* llmGenerateStream(
  req: GenRequest,
  cfg?: ProviderConfig
): AsyncGenerator<string, void, unknown> {
  const config = cfg || loadProviderConfig();
  const shaped = applyModelSchema(req);
  const { provider, modelId } = resolveProvider(shaped.model, config);
  yield* provider.generateStream({ ...shaped, model: modelId });
}
