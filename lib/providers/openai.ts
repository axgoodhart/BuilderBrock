/**
 * OpenAI-compatible adapter — talks to any `/chat/completions` endpoint
 * (OpenAI, OpenRouter, Ollama, LM Studio, vLLM, …) using fetch, so no extra
 * SDK ships in the bundle. Configure base URL + key via Settings → Providers.
 */
import { GenRequest, LLMProvider } from './types';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
}

function buildMessages(req: GenRequest): any[] {
  const messages: any[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  const images = req.images?.length ? req.images : (req.image ? [req.image] : []);
  if (images.length) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: req.prompt },
        ...images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } })),
      ],
    });
  } else {
    messages.push({ role: 'user', content: req.prompt });
  }
  return messages;
}

function buildBody(req: GenRequest, stream: boolean): any {
  const body: any = { model: req.model, messages: buildMessages(req), stream };
  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (req.json) body.response_format = { type: 'json_object' };
  if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;
  return body;
}

export function createOpenAIProvider(cfg: OpenAIConfig): LLMProvider {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
  });

  async function ensureOk(res: Response) {
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err: any = new Error(`OpenAI-compatible API error ${res.status}: ${detail.slice(0, 300)}`);
      err.status = res.status;
      err.retryAfter = Number(res.headers.get('retry-after')) || undefined;
      throw err;
    }
  }

  return {
    id: 'openai',
    async generate(req) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(buildBody(req, false)),
        signal: req.signal,
      });
      await ensureOk(res);
      const json = await res.json();
      return json?.choices?.[0]?.message?.content || '';
    },
    async *generateStream(req) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(buildBody(req, true)),
        signal: req.signal,
      });
      await ensureOk(res);
      if (!res.body) {
        // Endpoint ignored stream:true — fall back to the whole payload.
        const json = await res.json().catch(() => null);
        const text = json?.choices?.[0]?.message?.content;
        if (typeof text === 'string') yield text;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue; // keep-alives / partial frames
          }
          if (parsed?.error) { // provider failed mid-stream
            const err: any = new Error(`OpenAI-compatible API error ${parsed.error.code || ''}: ${parsed.error.message || JSON.stringify(parsed.error)}`);
            err.status = Number(parsed.error.status || parsed.error.code) || undefined;
            throw err;
          }
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) yield delta;
        }
      }
    },
  };
}
