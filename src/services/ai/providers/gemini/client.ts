import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import i18n from '../../../../i18n';
import { MissingApiKeyError, errorMessage } from '../../errors';
import type { JsonRequest, TextConfig, TextProvider } from '../../types';

/**
 * Gemini text generation through the browser SDK. The key is the user's own and
 * is sent to Google only. This file owns the SDK: key handling, model fallback,
 * retries and JSON parsing.
 */

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro'];

export function geminiClient(apiKey: string) {
  const key = apiKey?.trim();
  if (!key) throw new MissingApiKeyError();
  return new GoogleGenAI({ apiKey: key });
}

function parseJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  try {
    return JSON.parse(cleaned.trim()) as T;
  } catch {
    throw new Error(i18n.t('errors.badResponse'));
  }
}

const toContents = (req: JsonRequest) =>
  req.audio
    ? { parts: [{ inlineData: { mimeType: req.audio.mimeType, data: req.audio.base64 } }, { text: req.prompt }] }
    : req.prompt;

export const geminiText: TextProvider = {
  supportsAudioInput: true,

  async generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T> {
    const ai = geminiClient(config.apiKey);
    const preferred = config.model?.trim();
    const candidates = preferred ? [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)] : FALLBACK_MODELS;
    const contents = toContents(request);

    let lastError: unknown = null;
    for (const model of candidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const options: any = { responseMimeType: 'application/json' };
          if (model.includes('gemini-3')) options.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          const response = await ai.models.generateContent({ model, contents, config: options });
          if (response?.text) return parseJson<T>(response.text);
        } catch (err) {
          lastError = err;
          // A bad key will fail on every model; stop early instead of cycling.
          if (/API key|permission|PERMISSION_DENIED|UNAUTHENTICATED/i.test(errorMessage(err))) {
            throw new Error(errorMessage(err));
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
    throw new Error(lastError ? errorMessage(lastError) : i18n.t('errors.allModelsFailed'));
  },

  async checkKey(config: TextConfig): Promise<void> {
    const ai = geminiClient(config.apiKey);
    try {
      await ai.models.generateContent({ model: config.model || FALLBACK_MODELS[0], contents: 'Reply with OK.' });
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  },
};
