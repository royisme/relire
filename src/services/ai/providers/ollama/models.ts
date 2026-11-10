/** Ollama's local host, the verified starting list and `/api/tags` discovery. No key is normally involved. */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { normalizeBaseUrl } from '../../baseUrl';
import { normalizeModelId } from '../../catalogue';
import { errorMessage } from '../../errors';
import type { ModelCapabilities, ModelCatalogue, ModelInfo } from '../../types';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
/** Likely already pulled on the learner's machine; any other local model can be typed. */
export const OLLAMA_DEFAULT_MODEL = 'llama3.1';
export const OLLAMA_TEXT_MODELS = [OLLAMA_DEFAULT_MODEL, 'qwen2.5:14b', 'llama3.2-vision'];

/**
 * Ollama serves arbitrary local models and a name is no proof of anything, so every id stays unknown:
 * pictures are sent, and the model's own answer or error settles whether it reads them.
 */
export function ollamaCapabilities(): ModelCapabilities {
  return { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' };
}

/** The learner's endpoint, or the default one. A malformed override fails instead of reaching another host. */
export function ollamaBaseUrl(baseUrl: string | undefined): string {
  const override = baseUrl?.trim();
  if (!override) return OLLAMA_DEFAULT_BASE_URL;
  const normalized = normalizeBaseUrl(override);
  if (!normalized) throw new Error(i18n.t('errors.invalidBaseUrl'));
  return normalized;
}

/** Ollama takes no key; one the learner typed for a proxy in front of it still goes as a Bearer header. */
export function ollamaHeaders(apiKey: string): Record<string, string> {
  const key = apiKey.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

const listSchema = z.object({
  // `/api/tags` answers one page; a bigger body is refused instead of buffered into Settings.
  models: z.array(z.object({ name: z.string().refine((name) => !!normalizeModelId(name)) })).max(1000),
});

export const ollamaCatalogue: ModelCatalogue = {
  capabilities: ollamaCapabilities,
  async listModels(apiKey, signal, baseUrl) {
    const key = apiKey.trim();
    try {
      signal?.throwIfAborted();
      const response = await fetch(`${ollamaBaseUrl(baseUrl)}/api/tags`, { headers: ollamaHeaders(key), signal });
      if (!response.ok)
        throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
      const parsed = listSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error(i18n.t('errors.modelListMalformed'));
      signal?.throwIfAborted();
      const found = new Map<string, ModelInfo>();
      for (const model of parsed.data.models) {
        const id = normalizeModelId(model.name)!;
        if (!found.has(id)) found.set(id, { id, capabilities: ollamaCapabilities() });
      }
      return [...found.values()];
    } catch (err) {
      if (signal?.aborted) signal.throwIfAborted();
      throw new Error(errorMessage(err, key));
    }
  },
};
