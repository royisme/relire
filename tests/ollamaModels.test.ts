/** Ollama model discovery: the local `/api/tags` list, canonical IDs, no key, no guessed capability. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import {
  OLLAMA_DEFAULT_BASE_URL,
  ollamaCatalogue,
  ollamaCapabilities,
} from '../src/services/ai/providers/ollama/models';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const list = (signal?: AbortSignal, baseUrl?: string) => ollamaCatalogue.listModels('', signal, baseUrl);

const requestedUrl = (index = 0) => fetchMock.mock.calls[index][0] as string;

describe('Ollama model catalogue', () => {
  test('reads the local model list without a key, canonicalizing and deduplicating IDs', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ models: [{ name: 'llama3.1' }, { name: 'models/llama3.1' }, { name: 'qwen2.5:14b' }] }),
    );
    const models = await list();
    expect(models.map((model) => model.id)).toEqual(['llama3.1', 'qwen2.5:14b']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl()).toBe(`${OLLAMA_DEFAULT_BASE_URL}/api/tags`);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });

  test('a configured endpoint replaces the local default, and a malformed one fails before any request', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ models: [] }));
    await list(undefined, ' http://192.168.1.20:11434/ ');
    expect(requestedUrl()).toBe('http://192.168.1.20:11434/api/tags');

    for (const invalid of ['ftp://localhost:11434', 'http://user:pw@localhost:11434', 'localhost:11434']) {
      fetchMock.mockClear();
      expect(((await failure(list(undefined, invalid))) as Error).message).toBe(i18n.t('errors.invalidBaseUrl'));
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  test('an empty list is empty, not the shipped defaults', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ models: [] }));
    expect(await list()).toEqual([]);
  });

  test('malformed lists reject the whole result and never fall back to the shipped list', async () => {
    for (const malformed of [
      null,
      [],
      {},
      { models: 'wrong' },
      { models: [{}] },
      { models: [{ name: 3 }] },
      { models: [{ name: 'models/' }] },
      { models: [{ name: 'bad\nname' }] },
    ]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(Response.json(malformed));
      expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListMalformed'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('a stopped server or a refused request surfaces its own reason once', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    expect(((await failure(list())) as Error).message).toBe('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'forbidden origin' }, { status: 403 }));
    expect(((await failure(list())) as Error).message).toContain('forbidden origin');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('abort before a request never returns a list', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(((await failure(list(controller.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('every ID stays unknown, because a local model name proves nothing', () => {
    for (const id of ['llama3.1', 'llama3.2-vision', 'llava', 'my-own:latest', '']) {
      expect(ollamaCapabilities()).toEqual({
        textGeneration: 'unknown',
        imageInput: 'unknown',
        speechOutput: 'unknown',
      });
      expect(ollamaCatalogue.capabilities(id)).toEqual(ollamaCapabilities());
    }
  });
});
