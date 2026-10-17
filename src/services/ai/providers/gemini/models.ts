/** Gemini's small verified capability hints and explicit, paginated model discovery. No persistent cache. */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { normalizeModelId } from '../../catalogue';
import { errorMessage, MissingApiKeyError } from '../../errors';
import type { ModelCapabilities, ModelCatalogue, ModelInfo } from '../../types';

export const GEMINI_TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
export const GEMINI_SPEECH_MODELS = ['gemini-3.8-flash-lite-tts'];

export function geminiCapabilities(model: string): ModelCapabilities {
  const id = normalizeModelId(model) ?? '';
  if (GEMINI_TEXT_MODELS.includes(id))
    return { textGeneration: 'supported', imageInput: 'supported', speechOutput: 'unsupported' };
  if (GEMINI_SPEECH_MODELS.includes(id))
    return { textGeneration: 'unsupported', imageInput: 'unsupported', speechOutput: 'supported' };
  return { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' };
}

const modelSchema = z.object({
  name: z.string().refine((name) => !!normalizeModelId(name)),
  displayName: z.string().optional(),
  description: z.string().optional(),
  inputTokenLimit: z.number().int().nonnegative().optional(),
  outputTokenLimit: z.number().int().nonnegative().optional(),
  supportedGenerationMethods: z.array(z.string()).optional(),
});
const pageSchema = z.object({
  models: z.array(modelSchema).max(1000).optional(),
  nextPageToken: z
    .string()
    .max(2048)
    // oxlint-disable-next-line no-control-regex -- Pagination tokens must be safe request parameters.
    .regex(/^[^\u0000-\u001f\u007f]*$/)
    .optional(),
});

export const geminiCatalogue: ModelCatalogue = {
  capabilities: geminiCapabilities,
  async listModels(apiKey, signal) {
    const key = apiKey.trim();
    if (!key) throw new MissingApiKeyError();
    const found = new Map<string, ModelInfo>();
    const tokens = new Set<string>();
    let token = '';
    try {
      // Bound a broken provider's pagination, including repeated tokens; never return a partial success.
      for (let page = 0; page < 100; page++) {
        signal?.throwIfAborted();
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('pageSize', '1000');
        if (token) url.searchParams.set('pageToken', token);
        const response = await fetch(url, { headers: { 'x-goog-api-key': key }, signal });
        if (!response.ok)
          throw new Error(
            `${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`,
          );
        const parsed = pageSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error(i18n.t('errors.modelListMalformed'));
        for (const model of parsed.data.models ?? []) {
          const id = normalizeModelId(model.name)!;
          const supportedActions = model.supportedGenerationMethods;
          const capabilities =
            supportedActions && !supportedActions.includes('generateContent')
              ? {
                  textGeneration: 'unsupported' as const,
                  imageInput: 'unsupported' as const,
                  speechOutput: 'unsupported' as const,
                }
              : geminiCapabilities(id);
          if (!found.has(id))
            found.set(id, {
              id,
              displayName: model.displayName,
              description: model.description,
              inputTokenLimit: model.inputTokenLimit,
              outputTokenLimit: model.outputTokenLimit,
              supportedActions,
              capabilities,
            });
        }
        signal?.throwIfAborted();
        token = parsed.data.nextPageToken ?? '';
        if (!token) return [...found.values()];
        if (tokens.has(token)) break;
        tokens.add(token);
      }
      throw new Error(i18n.t('errors.modelListPagination'));
    } catch (err) {
      if (signal?.aborted) {
        signal.throwIfAborted();
      }
      throw new Error(errorMessage(err, key));
    }
  },
};
