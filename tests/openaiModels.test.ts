/** OpenAI-compatible model discovery: canonical IDs, bounded pages, header credentials, no guessed support. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { MissingApiKeyError } from '../src/services/ai/errors';
import {
  OPENAI_DEFAULT_BASE_URL,
  openaiCatalogue,
  openaiCapabilities,
} from '../src/services/ai/providers/openai/models';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const list = (signal?: AbortSignal, baseUrl?: string) => openaiCatalogue.listModels('fixture-key', signal, baseUrl);

/** The address the mock was called with, as the client wrote it. */
function requestedUrl(index = 0): string {
  const input = fetchMock.mock.calls[index][0];
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('OpenAI-compatible model catalogue', () => {
  test('reads the endpoint model list with a header key, canonicalizing and deduplicating IDs', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ data: [{ id: 'gpt-4o' }, { id: 'models/gpt-4o' }, { id: 'gpt-4o-mini' }] }),
    );
    const models = await list();
    expect(models.map((model) => model.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(models[0].capabilities.imageInput).toBe('supported');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(requestedUrl()).toBe(`${OPENAI_DEFAULT_BASE_URL}/models`);
    expect(requestedUrl()).not.toContain('fixture-key');
    expect(options?.headers).toEqual({ Authorization: 'Bearer fixture-key' });
  });

  test('follows the list cursor of a paginated compatible gateway, once per page', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gpt-4o' }], has_more: true, last_id: 'gpt-4o' }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gpt-4o' }, { id: 'custom-1' }] }));
    const models = await list(undefined, 'https://api.deepseek.com/v1/');
    expect(models.map((model) => model.id)).toEqual(['gpt-4o', 'custom-1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.get('after')).toBeNull();
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get('after')).toBe('gpt-4o');
    expect(requestedUrl(1)).toStartWith('https://api.deepseek.com/v1/models');
  });

  test('an empty list is empty, not static defaults', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] })).mockResolvedValueOnce(Response.json({ data: [] }));
    expect(await list()).toEqual([]);
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
    ]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(Response.json(malformed));
      expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListMalformed'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('a repeated or endless cursor is bounded instead of looping forever', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [], has_more: true }));
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
    expect(await failure(openaiCatalogue.listModels(' '))).toBeInstanceOf(MissingApiKeyError);
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
    fetchMock.mockClear();
    expect(((await failure(list(undefined, 'ftp://api.deepseek.com'))) as Error).message).toBe(
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
          return Response.json({ data: [{ id: 'gpt-4o' }], has_more: true, last_id: 'gpt-4o' });
        },
        { preconnect: () => {} },
      ),
    );
    expect(((await failure(list(between.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('capability hints list the verified image models and leave every other ID unknown', () => {
    for (const id of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini'])
      expect(openaiCapabilities(id).imageInput).toBe('supported');
    // o3-mini takes text only, per the model's own page: not a guessed refusal, but never a false yes.
    for (const id of ['o3-mini', 'deepseek-chat', 'qwen-max', 'gpt-4o-transcribe', '']) {
      expect(openaiCapabilities(id).imageInput).toBe('unknown');
      expect(openaiCapabilities(id).textGeneration).toBe('unknown');
    }
    expect(openaiCapabilities(' models/gpt-4o-mini ').imageInput).toBe('supported');
    expect(openaiCapabilities('gpt-4o-mini').textGeneration).toBe('supported');
  });
});
