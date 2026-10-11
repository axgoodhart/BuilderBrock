/**
 * Provider-agnostic request/response shapes. Every call site speaks this
 * normalized vocabulary; each adapter (gemini.ts, openai.ts) translates it to
 * the provider's native SDK/API.
 */

export interface GenImage {
  /** Base64 payload, WITHOUT the `data:` URI prefix. */
  data: string;
  mimeType: string;
}

export interface GenRequest {
  /** Concrete model id to call. */
  model: string;
  /** System / persona instructions. */
  system?: string;
  /** The user-facing prompt text. */
  prompt: string;
  /** Optional reference image for vision/image-grounded generation. */
  image?: GenImage | null;
  /** Optional multiple reference images (e.g. one per screen in multi-screen mode). Takes precedence over `image`. */
  images?: GenImage[] | null;
  temperature?: number;
  /** Ask the model to return strict JSON when supported. */
  json?: boolean;
  /** Reasoning effort for thinking-capable models (gated by the provider layer). */
  reasoningEffort?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}

export interface LLMProvider {
  id: string;
  /** Single-shot completion, returns the full text. */
  generate(req: GenRequest): Promise<string>;
  /** Streaming completion, yields text deltas as they arrive. */
  generateStream(req: GenRequest): AsyncGenerator<string, void, unknown>;
}
