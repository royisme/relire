/** Anthropic Claude text generation: one Messages request, the browser-access header, pictures as base64 blocks. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { MissingApiKeyError } from '../src/services/ai/errors';
import { ANTHROPIC_MAX_TOKENS, anthropicText } from '../src/services/ai/providers/anthropic/client';
import { ANTHROPIC_DEFAULT_BASE_URL, anthropicCapabilities } from '../src/services/ai/providers/anthropic/models';
import type { JsonRequest } from '../src/services/ai/types';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const answer = (content: unknown, status = 200) => Response.json({ content }, { status });

const generate = (request: Partial<JsonRequest> = {}, config: { apiKey?: string; baseUrl?: string } = {}) =>
  anthropicText.generateJson<{ ok: boolean }>(
    { prompt: 'Bonjour', ...request },
    {
      apiKey: config.apiKey ?? 'fixture-key',
      model: 'claude-3-7-sonnet-latest',
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

const headers = {
  'content-type': 'application/json',
  'x-api-key': 'fixture-key',
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
};

describe('Anthropic text generation', () => {
  test('posts to the default endpoint with the key and browser headers, the chosen model and one attempt', async () => {
    fetchMock.mockResolvedValueOnce(answer([{ type: 'text', text: '{"ok":true}' }]));
    expect(await generate()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sent();
    expect(url).toBe(`${ANTHROPIC_DEFAULT_BASE_URL}/v1/messages`);
    expect(init.method).toBe('POST');
    // Without the browser-access opt-in the API refuses a call made from a page's origin.
    expect(init.headers).toEqual(headers);
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model']);
    expect(body.model).toBe('claude-3-7-sonnet-latest');
    expect(body.max_tokens).toBe(ANTHROPIC_MAX_TOKENS);
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }]);
  });

  test('a configured endpoint replaces the host, without a trailing slash and without the key in the URL', async () => {
    fetchMock.mockResolvedValueOnce(answer([{ type: 'text', text: '{"ok":true}' }]));
    await generate({}, { baseUrl: ' https://claude-proxy.test/ ' });
    expect(sent().url).toBe('https://claude-proxy.test/v1/messages');
    expect(sent().url).not.toContain('fixture-key');

    for (const invalid of ['ftp://claude-proxy.test', 'https://user:pw@claude-proxy.test', 'claude-proxy.test']) {
      fetchMock.mockClear();
      const error = (await failure(generate({}, { baseUrl: invalid }))) as Error;
      expect(error.message).toBe(i18n.t('errors.invalidBaseUrl'));
      expect(fetchMock).not.toHaveBeenCalled();
    }

    // Empty is the provider default, not a malformed address.
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(answer([{ type: 'text', text: '{"ok":true}' }]));
    await anthropicText.generateJson(
      { prompt: 'Bonjour' },
      { apiKey: 'fixture-key', model: 'claude-3-7-sonnet-latest', baseUrl: '' },
    );
    expect(sent().url).toBe(`${ANTHROPIC_DEFAULT_BASE_URL}/v1/messages`);
  });

  test('pictures are base64 image blocks after the text, and an unknown model is sent as typed', async () => {
    fetchMock.mockResolvedValueOnce(answer([{ type: 'text', text: '{"ok":true}' }]));
    await anthropicText.generateJson(
      { prompt: 'Read this page', images: [{ data: 'AAAA', mimeType: 'image/png' }] },
      { apiKey: 'fixture-key', model: 'claude-my-own-build' },
    );
    expect(anthropicCapabilities('claude-my-own-build').imageInput).toBe('unknown');
    expect(sent().body.model).toBe('claude-my-own-build');
    expect(sent().body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read this page' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      },
    ]);
  });

  test('the first text block is read, so a leading non-text block does not break the answer', async () => {
    fetchMock.mockResolvedValueOnce(
      answer([
        { type: 'tool_use', id: 'tool-1' },
        { type: 'text', text: '```json\n{"ok":true}\n```' },
      ]),
    );
    expect(await generate()).toEqual({ ok: true });
  });

  test('an unusable answer fails with the response message once, never with a fallback', async () => {
    for (const content of [
      [{ type: 'text', text: 'not json' }],
      [{ type: 'text', text: '```json\n[unterminated\n```' }],
      [],
      [{ type: 'tool_use' }],
      'wrong',
    ]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(answer(content));
      expect(((await failure(generate())) as Error).message).toBe(i18n.t('errors.badResponse'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('a provider failure surfaces its own reason, once, with the key redacted', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'invalid x-api-key: fixture-key' } }, { status: 401 }),
    );
    const error = (await failure(generate())) as Error;
    expect(error.message).toContain('invalid x-api-key');
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

  test('the key check is one GET on the endpoint model list, with the same headers', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] }));
    await anthropicText.checkKey({ apiKey: ' fixture-key ', model: 'claude-3-7-sonnet-latest' });
    const [, init] = fetchMock.mock.calls[0];
    expect(requestedUrl()).toBe(`${ANTHROPIC_DEFAULT_BASE_URL}/v1/models`);
    expect(requestedUrl()).not.toContain('fixture-key');
    expect(init?.method).toBeUndefined();
    const { 'content-type': _contentType, ...credentialHeaders } = headers;
    expect(init?.headers).toEqual(credentialHeaders);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'bad key fixture-key' } }, { status: 401 }));
    const error = (await failure(
      anthropicText.checkKey({ apiKey: 'fixture-key', model: 'claude-3-7-sonnet-latest' }),
    )) as Error;
    expect(error.message).not.toContain('fixture-key');
    expect(await failure(anthropicText.checkKey({ apiKey: '', model: 'claude-3-7-sonnet-latest' }))).toBeInstanceOf(
      MissingApiKeyError,
    );
  });
});
