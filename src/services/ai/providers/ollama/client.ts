/**
 * Ollama text generation through its native `POST /api/chat`, called from the browser against the learner's own
 * server. No key, no cost, nothing leaving the device; one chosen model, one attempt, no retry and no fallback.
 * The answer must be JSON, and the provider's real error comes back as it is.
 */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { parseJsonAnswer } from '../../answerJson';
import { ImageInputUnsupportedError, errorMessage } from '../../errors';
import type { JsonRequest, TextConfig, TextProvider } from '../../types';
import { ollamaBaseUrl, ollamaCapabilities, ollamaHeaders } from './models';

const cancelled = () => new DOMException('The request was cancelled.', 'AbortError');

const answerSchema = z.object({ message: z.object({ content: z.string() }) });

/** A message carries its pictures inline as base64; without them the message has no `images` field. */
const toMessage = (request: JsonRequest) => ({
  role: 'user',
  content: request.prompt,
  ...(request.images?.length ? { images: request.images.map((image) => image.data) } : {}),
});

async function post(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
  return response;
}

export const ollamaText: TextProvider = {
  supportsAudioInput: false,
  imageInputCapability: () => ollamaCapabilities().imageInput,

  async generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T> {
    // No key to require: a local server answers without one, and no empty Authorization header is invented.
    const key = config.apiKey?.trim() ?? '';
    const model = config.model?.trim();
    if (!model) throw new Error(i18n.t('errors.invalidModelId'));
    if (request.images?.length && ollamaCapabilities().imageInput === 'unsupported')
      throw new ImageInputUnsupportedError(model);
    const endpoint = ollamaBaseUrl(config.baseUrl);
    try {
      if (request.signal?.aborted) throw cancelled();
      const response = await post(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ollamaHeaders(key) },
        body: JSON.stringify({
          model,
          messages: [toMessage(request)],
          stream: false,
          format: 'json',
        }),
        signal: request.signal,
      });
      const parsed = answerSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error(i18n.t('errors.badResponse'));
      return parseJsonAnswer<T>(parsed.data.message.content);
    } catch (err) {
      // A cancelled request is the learner's choice: never report it as a failure.
      if (request.signal?.aborted) throw cancelled();
      throw new Error(errorMessage(err, key));
    }
  },

  async checkKey(config: TextConfig, signal?: AbortSignal): Promise<void> {
    const key = config.apiKey?.trim() ?? '';
    try {
      await post(`${ollamaBaseUrl(config.baseUrl)}/api/tags`, { headers: ollamaHeaders(key), signal });
    } catch (err) {
      // A cancelled check is the learner's choice: never report it as a failure.
      if (signal?.aborted) throw cancelled();
      throw new Error(errorMessage(err, key));
    }
  },
};
