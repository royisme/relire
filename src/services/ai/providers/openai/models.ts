/** OpenAI-compatible endpoints: the verified capability hints, the default host and `/models` discovery. */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { normalizeBaseUrl } from '../../baseUrl';
import { normalizeModelId } from '../../catalogue';
import { errorMessage, MissingApiKeyError } from '../../errors';
import type { ModelCapabilities, ModelCatalogue, ModelInfo } from '../../types';

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
/** A starting list for Settings; any other ID can be typed, and it reaches the provider as typed. */
export const OPENAI_TEXT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'];
/** Model IDs published as accepting images. Everything else stays unknown, never a guessed refusal. */
export const OPENAI_IMAGE_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3',
  'o3-mini',
  'o4-mini',
];

export function openaiCapabilities(model: string): ModelCapabilities {
  const id = normalizeModelId(model) ?? '';
  return {
    textGeneration: OPENAI_TEXT_MODELS.includes(id) ? 'supported' : 'unknown',
    imageInput: OPENAI_IMAGE_MODELS.includes(id) ? 'supported' : 'unknown',
    // A compatible endpoint may serve an audio model under this protocol; only a real request settles it.
    speechOutput: 'unknown',
  };
}

/** The learner's endpoint, or the default one. A malformed override fails instead of reaching another host. */
export function openaiBaseUrl(baseUrl: string | undefined): string {
  const override = baseUrl?.trim();
  if (!override) return OPENAI_DEFAULT_BASE_URL;
  const normalized = normalizeBaseUrl(override);
  if (!normalized) throw new Error(i18n.t('errors.invalidBaseUrl'));
  return normalized;
}

const modelSchema = z.object({ id: z.string().refine((id) => !!normalizeModelId(id)) });
const pageSchema = z.object({
  data: z.array(modelSchema).max(1000),
  // OpenAI's list convention for a collection that still has pages; `/models` itself returns one page.
  has_more: z.boolean().optional(),
  last_id: z
    .string()
    .max(512)
    // oxlint-disable-next-line no-control-regex -- A cursor is a request parameter.
    .regex(/^[^\u0000-\u001f\u007f]*$/)
    .optional(),
});

export const openaiCatalogue: ModelCatalogue = {
  capabilities: openaiCapabilities,
  async listModels(apiKey, signal, baseUrl) {
    const key = apiKey.trim();
    if (!key) throw new MissingApiKeyError();
    const endpoint = openaiBaseUrl(baseUrl);
    const found = new Map<string, ModelInfo>();
    const cursors = new Set<string>();
    let cursor = '';
    try {
      // Bound a broken gateway's pagination, including a repeated cursor; never return a partial success.
      for (let page = 0; page < 100; page++) {
        signal?.throwIfAborted();
        const url = new URL(`${endpoint}/models`);
        if (cursor) url.searchParams.set('after', cursor);
        const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal });
        if (!response.ok)
          throw new Error(
            `${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`,
          );
        const parsed = pageSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error(i18n.t('errors.modelListMalformed'));
        for (const model of parsed.data.data) {
          const id = normalizeModelId(model.id)!;
          if (!found.has(id)) found.set(id, { id, capabilities: openaiCapabilities(id) });
        }
        signal?.throwIfAborted();
        if (!parsed.data.has_more) return [...found.values()];
        const next = parsed.data.last_id;
        if (!next) throw new Error(i18n.t('errors.modelListPagination'));
        if (cursors.has(next)) break;
        cursors.add(next);
        cursor = next;
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
