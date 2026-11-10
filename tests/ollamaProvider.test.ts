/** Ollama chat: one local request with no key, inline base64 pictures, JSON output required. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { ollamaText } from '../src/services/ai/providers/ollama/client';
import { OLLAMA_DEFAULT_BASE_URL, ollamaCapabilities } from '../src/services/ai/providers/ollama/models';
import type { JsonRequest } from '../src/services/ai/types';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const answer = (content: unknown, status = 200) =>
  Response.json({ message: { role: 'assistant', content } }, { status });

const generate = (request: Partial<JsonRequest> = {}, config: { apiKey?: string; baseUrl?: string } = {}) =>
  ollamaText.generateJson<{ ok: boolean }>(
    { prompt: 'Bonjour', ...request },
    { apiKey: config.apiKey ?? '', model: 'llama3.1', ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) },
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

describe('Ollama text generation', () => {
  test('posts to the local chat endpoint without a key, the chosen model and one attempt', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    expect(await generate()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sent();
    expect(url).toBe(`${OLLAMA_DEFAULT_BASE_URL}/api/chat`);
    expect(init.method).toBe('POST');
    // No key is needed, and no empty Authorization header is invented.
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(Object.keys(body).sort()).toEqual(['format', 'messages', 'model', 'stream']);
    expect(body.model).toBe('llama3.1');
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect(body.messages).toEqual([{ role: 'user', content: 'Bonjour' }]);
  });

  test('a key the learner typed for a proxy in front of Ollama is sent as a Bearer header', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await generate({}, { apiKey: ' fixture-key ' });
    expect(sent().init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer fixture-key',
    });
  });

  test('pictures go inline as base64, and an unknown local model is sent as typed', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await ollamaText.generateJson(
      { prompt: 'Read this page', images: [{ data: 'AAAA', mimeType: 'image/png' }] },
      { apiKey: '', model: 'my-own:latest' },
    );
    expect(ollamaCapabilities().imageInput).toBe('unknown');
    expect(sent().body.model).toBe('my-own:latest');
    expect(sent().body.messages).toEqual([{ role: 'user', content: 'Read this page', images: ['AAAA'] }]);
  });

  test('without pictures the message has no images field', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await generate();
    expect(sent().body.messages).toEqual([{ role: 'user', content: 'Bonjour' }]);
  });

  test('a fenced JSON answer parses, an unusable one fails with the response message once', async () => {
    fetchMock.mockResolvedValueOnce(answer('```json\n{"ok":true}\n```'));
    expect(await generate()).toEqual({ ok: true });
    for (const body of [answer('not json'), answer('```json\n[unterminated\n```'), Response.json({ done: true })]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(body);
      expect(((await failure(generate())) as Error).message).toBe(i18n.t('errors.badResponse'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('a stopped server or a refused model surfaces its own reason, once, with a key redacted', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    const offline = (await failure(generate())) as Error;
    expect(offline.message).toBe('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: `model "nope" not found for fixture-key` }, { status: 404 }),
    );
    const error = (await failure(generate({}, { apiKey: 'fixture-key' }))) as Error;
    expect(error.message).toContain('model "nope" not found');
    expect(error.message).not.toContain('fixture-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('no key is required, and a cancelled request aborts without a request', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(((await failure(generate({ signal: controller.signal }))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();

    const live = new AbortController();
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

  test('a configured endpoint replaces the local default, and a malformed one fails before any request', async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await generate({}, { baseUrl: ' http://192.168.1.20:11434/ ' });
    expect(sent().url).toBe('http://192.168.1.20:11434/api/chat');

    for (const invalid of ['ftp://localhost:11434', 'http://user:pw@localhost:11434', 'localhost:11434']) {
      fetchMock.mockClear();
      expect(((await failure(generate({}, { baseUrl: invalid }))) as Error).message).toBe(
        i18n.t('errors.invalidBaseUrl'),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }

    // Empty is the provider default, not a malformed address.
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    await ollamaText.generateJson({ prompt: 'Bonjour' }, { apiKey: '', model: 'llama3.1', baseUrl: '' });
    expect(sent().url).toBe(`${OLLAMA_DEFAULT_BASE_URL}/api/chat`);
  });

  test('the check is one GET on the local model list, with no key', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ models: [] }));
    await ollamaText.checkKey({ apiKey: '', model: 'llama3.1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(requestedUrl()).toBe(`${OLLAMA_DEFAULT_BASE_URL}/api/tags`);
    expect(init?.method).toBeUndefined();
    expect(init?.headers).toEqual({});

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ models: [] }));
    await ollamaText.checkKey({ apiKey: 'fixture-key', model: 'llama3.1', baseUrl: 'http://box.test:11434' });
    expect(requestedUrl()).toBe('http://box.test:11434/api/tags');
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer fixture-key' });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'model list failed' }, { status: 500 }));
    expect(((await failure(ollamaText.checkKey({ apiKey: '', model: 'llama3.1' }))) as Error).message).toContain(
      'model list failed',
    );
  });
});
