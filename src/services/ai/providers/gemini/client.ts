import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type Part } from '@google/genai';
import i18n from '../../../../i18n';
import { parseJsonAnswer } from '../../answerJson';
import { ImageInputUnsupportedError, MissingApiKeyError, errorMessage } from '../../errors';
import type { JsonRequest, TextConfig, TextProvider } from '../../types';
import { geminiCapabilities } from './models';

/**
 * Gemini text generation through the browser SDK. The key is the user's own and
 * is sent to Google only. This file owns the SDK: key handling, model fallback,
 * retries and JSON parsing.
 */

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro'];

const cancelled = () => new DOMException('The request was cancelled.', 'AbortError');

export function geminiClient(apiKey: string) {
  const key = apiKey?.trim();
  if (!key) throw new MissingApiKeyError();
  return new GoogleGenAI({ apiKey: key });
}

const toContents = (req: JsonRequest) => {
  if (!req.audio && !req.images?.length) return req.prompt;
  const parts: Part[] = (req.images ?? []).map((image) => ({
    inlineData: { mimeType: image.mimeType, data: image.data },
  }));
  if (req.audio) parts.push({ inlineData: { mimeType: req.audio.mimeType, data: req.audio.base64 } });
  parts.push({ text: req.prompt });
  return { parts };
};

export const geminiText: TextProvider = {
  supportsAudioInput: true,
  imageInputCapability: (model) => geminiCapabilities(model).imageInput,

  async generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T> {
    const ai = geminiClient(config.apiKey);
    const preferred = config.model?.trim() ?? '';
    if (request.images?.length && geminiCapabilities(preferred).imageInput === 'unsupported')
      throw new ImageInputUnsupportedError(preferred);
    // A single attempt stays on the chosen model: the learner sees which model reads their pages.
    const candidates = request.singleAttempt
      ? [preferred || FALLBACK_MODELS[0]]
      : preferred
        ? [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)]
        : FALLBACK_MODELS;
    const attempts = request.singleAttempt ? 1 : 2;
    const contents = toContents(request);

    let lastError: unknown = null;
    for (const model of candidates) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (request.signal?.aborted) throw cancelled();
        try {
          const options: GenerateContentConfig = { responseMimeType: 'application/json' };
          if (request.signal) options.abortSignal = request.signal;
          if (request.jsonSchema) options.responseJsonSchema = request.jsonSchema;
          if (model.includes('gemini-3')) options.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          const response = await ai.models.generateContent({ model, contents, config: options });
          if (response?.text) return parseJsonAnswer<T>(response.text);
        } catch (err) {
          // A cancelled request is the learner's choice: never retry it or report it as a failure.
          if (request.signal?.aborted) throw cancelled();
          lastError = err;
          // A bad key will fail on every model; stop early instead of cycling.
          if (/API key|permission|PERMISSION_DENIED|UNAUTHENTICATED/i.test(errorMessage(err))) {
            throw new Error(errorMessage(err, config.apiKey));
          }
          if (!request.singleAttempt) await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
    throw new Error(lastError ? errorMessage(lastError, config.apiKey) : i18n.t('errors.allModelsFailed'));
  },

  async checkKey(config: TextConfig, signal?: AbortSignal): Promise<void> {
    const ai = geminiClient(config.apiKey);
    try {
      await ai.models.generateContent({
        model: config.model || FALLBACK_MODELS[0],
        contents: 'Reply with OK.',
        config: signal ? { abortSignal: signal } : undefined,
      });
    } catch (err) {
      // A cancelled check is the learner's choice: never report it as a failure.
      if (signal?.aborted) throw cancelled();
      throw new Error(errorMessage(err, config.apiKey));
    }
  },
};
