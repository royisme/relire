/** Fish Audio's fixed OpenAI-compatible endpoint, its verified speech models and `/models` discovery. */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { normalizeModelId } from '../../catalogue';
import { errorMessage } from '../../errors';
import type { ModelCapabilities, ModelCatalogue, ModelInfo } from '../../types';

/** Fixed host: Fish Audio has no learner-editable endpoint, so Settings shows no Base URL field. */
export const FISH_BASE_URL = 'https://api.fish.audio/compat/v1';

/** The free model is the default; nothing here ever falls back to a paid one. */
export const FISH_DEFAULT_MODEL = 'fish-audio/s2.1-pro-free';
/** A starting list for Settings; any other ID can be typed, and it reaches the provider as typed. */
export const FISH_SPEECH_MODELS = [FISH_DEFAULT_MODEL, 'fish-audio/s2.1-pro', 'fish-audio/s2-pro', 'fish-audio/s1'];
/** Listed by the same endpoint but a transcription model: never offered as a voice model. */
export const FISH_NON_SPEECH_MODELS = ['fish-audio/transcribe-1'];

export function fishCapabilities(model: string): ModelCapabilities {
  const id = normalizeModelId(model) ?? '';
  if (FISH_SPEECH_MODELS.includes(id))
    return { textGeneration: 'unsupported', imageInput: 'unsupported', speechOutput: 'supported' };
  if (FISH_NON_SPEECH_MODELS.includes(id))
    return { textGeneration: 'unsupported', imageInput: 'unsupported', speechOutput: 'unsupported' };
  // A typed id is not evidence either way; only a real request settles it.
  return { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' };
}

const modelSchema = z.object({
  id: z.string().refine((id) => !!normalizeModelId(id)),
  name: z.string().max(256).optional(),
  canonical_slug: z.string().max(512).optional(),
});
const listSchema = z.object({ data: z.array(modelSchema).max(1000) });

export const fishCatalogue: ModelCatalogue = {
  capabilities: fishCapabilities,
  async listModels(apiKey, signal) {
    // This list answers without a key; the learner's key is still sent when there is one.
    const key = apiKey.trim();
    try {
      signal?.throwIfAborted();
      const response = await fetch(`${FISH_BASE_URL}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal,
      });
      if (!response.ok)
        throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
      const parsed = listSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error(i18n.t('errors.modelListMalformed'));
      signal?.throwIfAborted();
      const found = new Map<string, ModelInfo>();
      for (const model of parsed.data.data) {
        const id = normalizeModelId(model.id)!;
        if (!found.has(id))
          found.set(id, {
            id,
            displayName: model.name ?? model.canonical_slug,
            capabilities: fishCapabilities(id),
          });
      }
      return [...found.values()];
    } catch (err) {
      if (signal?.aborted) signal.throwIfAborted();
      throw new Error(errorMessage(err, key));
    }
  },
};
