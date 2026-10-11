/**
 * Gemini adapter — wraps @google/genai behind the LLMProvider interface.
 * This is the only file in the app that imports the Gemini SDK.
 */
import { GoogleGenAI } from '@google/genai';
import { GenRequest, LLMProvider } from './types';

function buildContents(req: GenRequest): any {
  const images = req.images?.length ? req.images : (req.image ? [req.image] : []);
  if (images.length) {
    return {
      parts: [
        ...images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: req.prompt },
      ],
    };
  }
  return req.prompt;
}

// Categorical effort → a thinking budget valid across Gemini thinking models
// (pro: 128–32768, flash: 0–24576). Kept within both ranges.
const GEMINI_THINKING_BUDGET: Record<string, number> = { low: 4096, medium: 12288, high: 24576 };

function buildConfig(req: GenRequest): any {
  const config: any = {};
  if (typeof req.temperature === 'number') config.temperature = req.temperature;
  if (req.system) config.systemInstruction = req.system;
  if (req.json) config.responseMimeType = 'application/json';
  if (req.reasoningEffort) {
    config.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET[req.reasoningEffort] };
  }
  return config;
}

export function createGeminiProvider(apiKey: string): LLMProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    id: 'gemini',
    async generate(req) {
      const res = await ai.models.generateContent({
        model: req.model,
        contents: buildContents(req),
        config: buildConfig(req),
      });
      return res.text || '';
    },
    async *generateStream(req) {
      const stream = await ai.models.generateContentStream({
        model: req.model,
        contents: buildContents(req),
        config: buildConfig(req),
      });
      for await (const chunk of stream) {
        if (typeof chunk.text === 'string') yield chunk.text;
      }
    },
  };
}
