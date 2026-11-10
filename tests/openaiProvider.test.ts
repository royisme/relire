/** OpenAI-compatible text generation: one request, the learner's endpoint, pictures only as image parts. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { MissingApiKeyError } from '../src/services/ai/errors';
import { openaiText } from '../src/services/ai/providers/openai/client';
import { OPENAI_DEFAULT_BASE_URL, openaiCapabilities } from '../src/services/ai/providers/openai/models';
import type { JsonRequest } from '../src/services/ai/types';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const answer = (content: unknown, status = 200) => Response.json({ choices: [{ message: { content } }] }, { status });

const generate = (request: Partial<JsonRequest> = {}, config: { apiKey?: string; baseUrl?: string } = {}) =>
  openaiText.generateJson<{ ok: boolean }>(
    { prompt: 'Bonjour', ...request },
    {
      apiKey: config.apiKey ?? 'fixture-key',
      model: 'gpt-4o-mini',
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    },
  );

/** The address the mock was called with, as the client wrote it. */
function requestedUrl(index = 0): string {
  const input = fetchMock.mock.calls[index][0];
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

const sent = () => {
  const [, init] = fetchMock.mock.calls[0];
  return { url: requestedUrl(), init: init!, body: JSON.parse(init!.body as string) as Record<string, unknown> };
};

describe('OpenAI-compatible text generation', () => {
  test('posts to the default endpoint with a Bearer key, the chosen model and no extra attempts', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    expect(await generate()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sent();
    expect(url).toBe(`${OPENAI_DEFAULT_BASE_URL}/chat/completions`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer fixture-key' });
    expect(Object.keys(body).sort()).toEqual(['messages', 'model']);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([{ role: 'user', content: 'Bonjour' }]);
  });

  test('a configured endpoint replaces the host, without a trailing slash and without credentials in the URL', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await generate({}, { baseUrl: ' https://api.deepseek.com/v1/ ' });
    expect(sent().url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(sent().url).not.toContain('fixture-key');

    for (const invalid of ['ftp://api.deepseek.com', 'https://user:pw@api.deepseek.com/v1', 'api.deepseek.com']) {
      fetchMock.mockClear();
      const error = (await failure(generate({}, { baseUrl: invalid }))) as Error;
      expect(error.message).toBe(i18n.t('errors.invalidBaseUrl'));
      expect(fetchMock).not.toHaveBeenCalled();
    }

    // Empty is the provider default, not a malformed address.
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await openaiText.generateJson({ prompt: 'Bonjour' }, { apiKey: 'fixture-key', model: 'gpt-4o-mini', baseUrl: '' });
    expect(sent().url).toBe(`${OPENAI_DEFAULT_BASE_URL}/chat/completions`);
  });

  test('pictures are image_url data-URI parts, and an unknown model is sent as typed instead of refused', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await openaiText.generateJson(
      {
        prompt: 'Read this page',
        images: [{ data: 'AAAA', mimeType: 'image/png' }],
      },
      { apiKey: 'fixture-key', model: 'some-compatible-vision-model' },
    );
    expect(openaiCapabilities('some-compatible-vision-model')).toEqual({
      textGeneration: 'unknown',
      imageInput: 'unknown',
      speechOutput: 'unknown',
    });
    expect(openaiCapabilities('gpt-4o-mini').imageInput).toBe('supported');
    expect(openaiCapabilities('deepseek-chat').imageInput).toBe('unknown');
    expect(sent().body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read this page' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
    ]);
  });

  test('a fenced JSON answer parses, an unusable one fails with the response message once', async () => {
    fetchMock.mockResolvedValueOnce(answer('```json\n{"ok":true}\n```'));
    expect(await generate()).toEqual({ ok: true });
    for (const body of [answer('not json'), answer('```json\n[unterminated\n```'), Response.json({ choices: [] })]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(body);
      expect(((await failure(generate())) as Error).message).toBe(i18n.t('errors.badResponse'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('a provider failure surfaces its own reason, once, with the key redacted', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'Incorrect API key provided: fixture-key' } }, { status: 401 }),
    );
    const error = (await failure(generate())) as Error;
    expect(error.message).toContain('Incorrect API key provided');
    expect(error.message).not.toContain('fixture-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('network down for fixture-key'));
    const network = (await failure(generate())) as Error;
    expect(network.message).toBe('network down for [redacted]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a missing key fails locally and a cancelled request aborts without a request', async () => {
    expect(await failure(generate({}, { apiKey: ' ' }))).toBeInstanceOf(MissingApiKeyError);
    expect(fetchMock).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    expect(((await failure(generate({ signal: controller.signal }))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();

    const live = new AbortController();
    // A real fetch rejects with AbortError once its signal fires; the client reports that as the cancellation.
    fetchMock.mockImplementationOnce(
      Object.assign(
        async () => {
          live.abort();
          throw new DOMException('The request was cancelled.', 'AbortError');
        },
        { preconnect: () => {} },
      ),
    );
    expect(((await failure(generate({ signal: live.signal }))) as Error).name).toBe('AbortError');
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(live.signal);
  });

  test('the key check is one GET on the endpoint model list, never a generation call', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] }));
    await openaiText.checkKey({ apiKey: ' fixture-key ', model: 'gpt-4o-mini', baseUrl: 'https://api.qwen.test/v1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(requestedUrl()).toBe('https://api.qwen.test/v1/models');
    expect(init?.method).toBeUndefined();
    expect(init?.headers).toEqual({ Authorization: 'Bearer fixture-key' });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'bad key fixture-key' } }, { status: 401 }));
    const error = (await failure(openaiText.checkKey({ apiKey: 'fixture-key', model: 'gpt-4o-mini' }))) as Error;
    expect(error.message).not.toContain('fixture-key');
    expect(await failure(openaiText.checkKey({ apiKey: '', model: 'gpt-4o-mini' }))).toBeInstanceOf(MissingApiKeyError);
  });
});
