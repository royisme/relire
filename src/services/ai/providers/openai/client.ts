/**
 * OpenAI-compatible text generation through `POST /chat/completions`, called from the browser with the
 * learner's own key. One chosen model, one attempt, no retry and no model fallback: the provider's real
 * error comes back, with the key redacted. This file owns the HTTP call and the answer parsing.
 */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { parseJsonAnswer } from '../../answerJson';
import { ImageInputUnsupportedError, MissingApiKeyError, errorMessage } from '../../errors';
import type { JsonRequest, TextConfig, TextProvider } from '../../types';
import { openaiBaseUrl, openaiCapabilities } from './models';

const cancelled = () => new DOMException('The request was cancelled.', 'AbortError');

const answerSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

/** Pictures go as data-URI parts; without them the prompt is the plain string the protocol expects. */
const toContent = (request: JsonRequest) =>
  request.images?.length
    ? [
        { type: 'text', text: request.prompt },
        ...request.images.map((image) => ({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.data}` },
        })),
      ]
    : request.prompt;

async function post(apiKey: string, url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
  return response;
}

export const openaiText: TextProvider = {
  supportsAudioInput: false,
  imageInputCapability: (model) => openaiCapabilities(model).imageInput,

  async generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T> {
    const key = config.apiKey?.trim();
    if (!key) throw new MissingApiKeyError();
    const model = config.model?.trim();
    if (!model) throw new Error(i18n.t('errors.invalidModelId'));
    if (request.images?.length && openaiCapabilities(model).imageInput === 'unsupported')
      throw new ImageInputUnsupportedError(model);
    const endpoint = openaiBaseUrl(config.baseUrl);
    try {
      if (request.signal?.aborted) throw cancelled();
      const response = await post(key, `${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: toContent(request) }] }),
        signal: request.signal,
      });
      const parsed = answerSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error(i18n.t('errors.badResponse'));
      return parseJsonAnswer<T>(parsed.data.choices[0].message.content);
    } catch (err) {
      // A cancelled request is the learner's choice: never report it as a failure.
      if (request.signal?.aborted) throw cancelled();
      throw new Error(errorMessage(err, key));
    }
  },

  async checkKey(config: TextConfig): Promise<void> {
    const key = config.apiKey?.trim();
    if (!key) throw new MissingApiKeyError();
    try {
      await post(key, `${openaiBaseUrl(config.baseUrl)}/models`, { headers: { Authorization: `Bearer ${key}` } });
    } catch (err) {
      throw new Error(errorMessage(err, key));
    }
  },
};
