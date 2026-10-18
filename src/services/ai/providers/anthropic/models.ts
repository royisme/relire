/** Anthropic's verified capability hints, default host and paginated `/v1/models` discovery. */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { normalizeBaseUrl } from '../../baseUrl';
import { normalizeModelId } from '../../catalogue';
import { errorMessage, MissingApiKeyError } from '../../errors';
import type { ModelCapabilities, ModelCatalogue, ModelInfo } from '../../types';

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
/** The API version this client speaks; not the learner's choice, so it is not a setting. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** A starting list for Settings; any other Claude ID can be typed, and it reaches the provider as typed. */
export const ANTHROPIC_TEXT_MODELS = ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'];

/** Claude families published as accepting images; 3.x names the family first. */
const IMAGE_MODEL_FAMILIES = ['claude-3', 'claude-4', 'claude-5'];
/** Claude 4 and later name the tier first, so the version sits after it (`claude-sonnet-4-5`). */
const TIER_FIRST_IMAGE_MODELS = ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4', 'claude-sonnet-5'];

export function anthropicCapabilities(model: string): ModelCapabilities {
  const id = (normalizeModelId(model) ?? '').toLowerCase();
  const known = ANTHROPIC_TEXT_MODELS.includes(id);
  // A short family list, never a pattern over every model: an id outside it stays unknown, so at worst the
  // provider's own error answers.
  const image =
    IMAGE_MODEL_FAMILIES.some((family) => id.startsWith(family)) ||
    TIER_FIRST_IMAGE_MODELS.some((family) => id.startsWith(family));
  return {
    textGeneration: known ? 'supported' : 'unknown',
    imageInput: image ? 'supported' : 'unknown',
    // The Messages API has no speech endpoint; Settings offers this provider for text and image reading only.
    speechOutput: known ? 'unsupported' : 'unknown',
  };
}

/** The learner's endpoint, or the default one. A malformed override fails instead of reaching another host. */
export function anthropicBaseUrl(baseUrl: string | undefined): string {
  const override = baseUrl?.trim();
  if (!override) return ANTHROPIC_DEFAULT_BASE_URL;
  const normalized = normalizeBaseUrl(override);
  if (!normalized) throw new Error(i18n.t('errors.invalidBaseUrl'));
  return normalized;
}

/**
 * The credential headers every Anthropic request carries. The browser-access header is an explicit opt-in:
 * without it the API refuses a call made from a page's origin.
 */
export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

const modelSchema = z.object({
  id: z.string().refine((id) => !!normalizeModelId(id)),
  display_name: z.string().max(256).optional(),
  created_at: z.string().max(64).optional(),
});
const pageSchema = z.object({
  data: z.array(modelSchema).max(1000),
  has_more: z.boolean().optional(),
  last_id: z
    .string()
    .max(512)
    // oxlint-disable-next-line no-control-regex -- A cursor is a request parameter.
    .regex(/^[^\u0000-\u001f\u007f]*$/)
    .nullish(),
});

export const anthropicCatalogue: ModelCatalogue = {
  capabilities: anthropicCapabilities,
  async listModels(apiKey, signal, baseUrl) {
    const key = apiKey.trim();
    if (!key) throw new MissingApiKeyError();
    const endpoint = anthropicBaseUrl(baseUrl);
    const found = new Map<string, ModelInfo>();
    const cursors = new Set<string>();
    let cursor = '';
    try {
      // Bound a broken gateway's pagination, including a repeated cursor; never return a partial success.
      for (let page = 0; page < 100; page++) {
        signal?.throwIfAborted();
        const url = new URL(`${endpoint}/v1/models`);
        url.searchParams.set('limit', '1000');
        if (cursor) url.searchParams.set('after_id', cursor);
        const response = await fetch(url, { headers: anthropicHeaders(key), signal });
        if (!response.ok)
          throw new Error(
            `${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`,
          );
        const parsed = pageSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error(i18n.t('errors.modelListMalformed'));
        for (const model of parsed.data.data) {
          const id = normalizeModelId(model.id)!;
          if (!found.has(id))
            found.set(id, { id, displayName: model.display_name, capabilities: anthropicCapabilities(id) });
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
