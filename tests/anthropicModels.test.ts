/** Claude model discovery: canonical IDs, bounded cursor pages, header credentials, family image hints only. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { MissingApiKeyError } from '../src/services/ai/errors';
import {
  ANTHROPIC_DEFAULT_BASE_URL,
  anthropicCatalogue,
  anthropicCapabilities,
} from '../src/services/ai/providers/anthropic/models';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const list = (signal?: AbortSignal, baseUrl?: string) => anthropicCatalogue.listModels('fixture-key', signal, baseUrl);

/** The address the mock was called with, as the client wrote it. */
function requestedUrl(index = 0): string {
  const input = fetchMock.mock.calls[index][0];
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('Claude model catalogue', () => {
  test('reads the model list with the key and browser headers, canonicalizing and deduplicating IDs', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: [
          { id: 'claude-3-7-sonnet-latest', display_name: 'Claude 3.7 Sonnet' },
          { id: 'models/claude-3-7-sonnet-latest' },
          { id: 'claude-3-5-haiku-latest' },
        ],
        has_more: false,
      }),
    );
    const models = await list();
    expect(models.map((model) => model.id)).toEqual(['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest']);
    expect(models[0].displayName).toBe('Claude 3.7 Sonnet');
    expect(models[0].capabilities.imageInput).toBe('supported');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, options] = fetchMock.mock.calls[0];
    expect((input as URL).searchParams.get('after_id')).toBeNull();
    expect((input as URL).searchParams.get('limit')).toBe('1000');
    expect(options?.headers).toEqual({
      'x-api-key': 'fixture-key',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(requestedUrl()).toStartWith(`${ANTHROPIC_DEFAULT_BASE_URL}/v1/models`);
    expect(requestedUrl()).not.toContain('fixture-key');
  });

  test('follows the list cursor of a paginated endpoint, once per page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: 'claude-3-7-sonnet-latest' }],
          has_more: true,
          last_id: 'claude-3-7-sonnet-latest',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: 'claude-3-7-sonnet-latest' }, { id: 'claude-custom-1' }],
          has_more: false,
          last_id: null,
        }),
      );
    const models = await list(undefined, 'https://claude-proxy.test/');
    expect(models.map((model) => model.id)).toEqual(['claude-3-7-sonnet-latest', 'claude-custom-1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.get('after_id')).toBeNull();
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get('after_id')).toBe('claude-3-7-sonnet-latest');
    expect(requestedUrl(1)).toStartWith('https://claude-proxy.test/v1/models');
  });

  test('an empty list is empty, not the shipped defaults', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [], has_more: false }));
    expect(await list()).toEqual([]);
  });

  test('malformed pages reject the whole result and never fall back to the shipped list', async () => {
    for (const malformed of [
      null,
      [],
      {},
      { data: 'wrong' },
      { data: [{ id: 3 }] },
      { data: [{ id: 'models/' }] },
      { data: [{ id: 'bad\nid' }] },
      { data: [], has_more: 'yes' },
      { data: [], has_more: true, last_id: 'bad\ncursor' },
    ]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(Response.json(malformed));
      expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListMalformed'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('a repeated or endless cursor is bounded instead of looping forever', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [], has_more: true, last_id: null }));
    expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListPagination'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockImplementation(
      Object.assign(async () => Response.json({ data: [], has_more: true, last_id: 'same' }), {
        preconnect: () => {},
      }),
    );
    expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListPagination'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    let page = 0;
    fetchMock.mockImplementation(
      Object.assign(async () => Response.json({ data: [], has_more: true, last_id: String(++page) }), {
        preconnect: () => {},
      }),
    );
    expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListPagination'));
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  test('missing credentials fail locally and provider errors redact the key', async () => {
    expect(await failure(anthropicCatalogue.listModels(' '))).toBeInstanceOf(MissingApiKeyError);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'Permission denied for fixture-key' } }, { status: 403 }),
    );
    const error = (await failure(list())) as Error;
    expect(error.message).toContain('Permission denied');
    expect(error.message).not.toContain('fixture-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a malformed endpoint fails before any request', async () => {
    expect(((await failure(list(undefined, 'ftp://claude-proxy.test'))) as Error).message).toBe(
      i18n.t('errors.invalidBaseUrl'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('abort before a request and between pages never returns stale partial results', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(((await failure(list(controller.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();

    const between = new AbortController();
    fetchMock.mockImplementationOnce(
      Object.assign(
        async () => {
          between.abort();
          return Response.json({
            data: [{ id: 'claude-3-7-sonnet-latest' }],
            has_more: true,
            last_id: 'claude-3-7-sonnet-latest',
          });
        },
        { preconnect: () => {} },
      ),
    );
    expect(((await failure(list(between.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('image hints cover the Claude families and leave every other ID unknown', () => {
    for (const id of [
      'claude-3-7-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-20240229',
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-haiku-4-5',
      'claude-5-sonnet',
      ' models/claude-sonnet-4-5 ',
    ])
      expect(anthropicCapabilities(id).imageInput).toBe('supported');
    for (const id of ['gpt-4o', 'deepseek-chat', 'claude-my-own-build', '']) {
      expect(anthropicCapabilities(id).imageInput).toBe('unknown');
      expect(anthropicCapabilities(id).textGeneration).toBe('unknown');
      expect(anthropicCapabilities(id).speechOutput).toBe('unknown');
    }
    expect(anthropicCapabilities('claude-3-7-sonnet-latest').textGeneration).toBe('supported');
    // The Messages API has no speech endpoint at all.
    expect(anthropicCapabilities('claude-3-7-sonnet-latest').speechOutput).toBe('unsupported');
  });
});
