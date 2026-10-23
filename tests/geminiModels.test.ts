/** Official Gemini model discovery: no billable generation, persistence or guessed capability support. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import { normalizeModelId, purposeCapability } from '../src/services/ai/catalogue';
import { MissingApiKeyError } from '../src/services/ai/errors';
import { geminiCatalogue } from '../src/services/ai/providers/gemini/models';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const list = (signal?: AbortSignal) => geminiCatalogue.listModels('fixture-key', signal);

describe('Gemini model catalogue', () => {
  test('canonicalizes IDs and follows all pages using header credentials; never calls generateContent', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: 'models/gemini-2.5-flash',
              displayName: 'Flash',
              inputTokenLimit: 100,
              supportedGenerationMethods: ['generateContent'],
            },
          ],
          nextPageToken: 'next page/2',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          models: [
            { name: 'gemini-2.5-flash' },
            {
              name: 'models/custom-model',
              description: 'A discovered model',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      );
    const models = await list();
    expect(models.map((model) => model.id)).toEqual(['gemini-2.5-flash', 'custom-model']);
    expect(models[0].displayName).toBe('Flash');
    expect(models[0].inputTokenLimit).toBe(100);
    expect(models[1].capabilities).toEqual({
      textGeneration: 'unknown',
      imageInput: 'unknown',
      speechOutput: 'unknown',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect((url as URL).href).toStartWith('https://generativelanguage.googleapis.com/v1beta/models?');
      expect((url as URL).href).not.toContain('fixture-key');
      expect(options?.headers).toEqual({ 'x-goog-api-key': 'fixture-key' });
    }
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get('pageToken')).toBe('next page/2');
  });

  test('an empty response is empty, not static defaults', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ models: [] })).mockResolvedValueOnce(Response.json({}));
    expect(await list()).toEqual([]);
    expect(await list()).toEqual([]);
  });

  test('known hints and generation methods do not turn generateContent into evidence of image or audio support', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        models: [
          { name: 'models/gemini-new-tts', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-model', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-3.8-flash-lite-tts', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    );
    const models = await list();
    expect(purposeCapability(models[0].capabilities, 'ocr')).toBe('unknown');
    expect(purposeCapability(models[0].capabilities, 'speech')).toBe('unknown');
    expect(purposeCapability(models[1].capabilities, 'text')).toBe('unsupported');
    expect(purposeCapability(models[1].capabilities, 'ocr')).toBe('unsupported');
    expect(purposeCapability(models[2].capabilities, 'ocr')).toBe('unsupported');
    expect(purposeCapability(models[2].capabilities, 'speech')).toBe('supported');
  });

  test('missing credentials fail locally, and provider errors redact credentials', async () => {
    expect(await failure(geminiCatalogue.listModels(' '))).toBeInstanceOf(MissingApiKeyError);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'Permission denied for fixture-key' } }, { status: 403 }),
    );
    const error = (await failure(list())) as Error;
    expect(error.message).toContain('Permission denied');
    expect(error.message).not.toContain('fixture-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('malformed pages reject the entire result instead of returning partial discovery', async () => {
    for (const malformed of [
      null,
      [],
      { models: 'wrong' },
      { models: [{ name: 3 }] },
      { models: [{ name: 'models/' }] },
      { models: [{ name: 'bad\nmodel' }] },
      { models: [{ name: 'ok', supportedGenerationMethods: [7] }] },
      { nextPageToken: 4 },
    ]) {
      fetchMock
        .mockResolvedValueOnce(Response.json({ models: [{ name: 'first' }], nextPageToken: 'more' }))
        .mockResolvedValueOnce(Response.json(malformed));
      expect(await failure(list())).toBeInstanceOf(Error);
    }
  });

  test('repeated tokens and an unbounded list are rejected', async () => {
    fetchMock.mockImplementation(
      Object.assign(async () => Response.json({ nextPageToken: 'same' }), { preconnect: () => {} }),
    );
    expect(await failure(list())).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    let page = 0;
    fetchMock.mockImplementation(
      Object.assign(async () => Response.json({ nextPageToken: String(++page) }), { preconnect: () => {} }),
    );
    expect(await failure(list())).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  test('abort before a request and between pages never returns stale partial results', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(((await failure(list(controller.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();
    const between = new AbortController();
    fetchMock.mockImplementationOnce((async (_url, options) => {
      expect(options?.signal).toBe(between.signal);
      between.abort();
      return Response.json({ models: [{ name: 'first' }], nextPageToken: 'more' });
    }) as typeof fetch);
    expect(((await failure(list(between.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('model normalization accepts custom IDs, not empty, nonstring, control or overlong IDs', () => {
    expect(normalizeModelId(' models/custom-v1 ')).toBe('custom-v1');
    for (const value of [undefined, null, {}, 7, '', 'models/', 'bad\nmodel', 'x'.repeat(513)])
      expect(normalizeModelId(value)).toBeUndefined();
  });
});
