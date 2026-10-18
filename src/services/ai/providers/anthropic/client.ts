/**
 * Anthropic Claude text generation through `POST /v1/messages`, called from the browser with the learner's own
 * key. One chosen model, one attempt, no retry and no model fallback: the provider's real error comes back with
 * the key redacted. This file owns the HTTP call and the answer parsing.
 */
import { z } from 'zod';
import i18n from '../../../../i18n';
import { parseJsonAnswer } from '../../answerJson';
import { ImageInputUnsupportedError, MissingApiKeyError, errorMessage } from '../../errors';
import type { JsonRequest, TextConfig, TextProvider } from '../../types';
import { anthropicBaseUrl, anthropicCapabilities, anthropicHeaders } from './models';

/** The API requires a bound on the answer; one task's JSON answer is far shorter. */
export const ANTHROPIC_MAX_TOKENS = 4096;

const cancelled = () => new DOMException('The request was cancelled.', 'AbortError');

const answerSchema = z.object({
  content: z.array(z.object({ type: z.string().max(64), text: z.string().optional() })),
});

/** Pictures go as base64 blocks after the prompt, which is always a text block so the order is stable. */
const toContent = (request: JsonRequest) => [
  { type: 'text', text: request.prompt },
  ...(request.images ?? []).map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mimeType, data: image.data },
  })),
];

async function post(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
  return response;
}

export const anthropicText: TextProvider = {
  supportsAudioInput: false,
  imageInputCapability: (model) => anthropicCapabilities(model).imageInput,

  async generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T> {
    const key = config.apiKey?.trim();
    if (!key) throw new MissingApiKeyError();
    const model = config.model?.trim();
    if (!model) throw new Error(i18n.t('errors.invalidModelId'));
    if (request.images?.length && anthropicCapabilities(model).imageInput === 'unsupported')
      throw new ImageInputUnsupportedError(model);
    const endpoint = anthropicBaseUrl(config.baseUrl);
    try {
      if (request.signal?.aborted) throw cancelled();
      const response = await post(`${endpoint}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...anthropicHeaders(key) },
        body: JSON.stringify({
          model,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          messages: [{ role: 'user', content: toContent(request) }],
        }),
        signal: request.signal,
      });
      const parsed = answerSchema.safeParse(await response.json());
      const answer = parsed.success ? parsed.data.content.find((block) => block.type === 'text')?.text : undefined;
      if (answer === undefined) throw new Error(i18n.t('errors.badResponse'));
      return parseJsonAnswer<T>(answer);
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
      await post(`${anthropicBaseUrl(config.baseUrl)}/v1/models`, { headers: anthropicHeaders(key) });
    } catch (err) {
      throw new Error(errorMessage(err, key));
    }
  },
};
