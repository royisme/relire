/** Fish Audio model discovery: structural, deduplicated, bounded and honest about a transcription model. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { purposeCapability } from '../src/services/ai/catalogue';
import { FISH_BASE_URL, fishCapabilities, fishCatalogue } from '../src/services/ai/providers/fish/models';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const list = (apiKey = 'fixture-key', signal?: AbortSignal) => fishCatalogue.listModels(apiKey, signal);

const catalogue = (data: unknown[]) => Response.json({ data });

/** The address the mock was called with, as the catalogue wrote it. */
function requestedUrl(index = 0): string {
  const input = fetchMock.mock.calls[index][0];
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

const SPEECH_IDS = ['fish-audio/s2.1-pro', 'fish-audio/s2.1-pro-free', 'fish-audio/s2-pro', 'fish-audio/s1'];

describe('Fish Audio model catalogue', () => {
  test('reads the compat list with the learner key, keeping canonical ids and dropping duplicates', async () => {
    fetchMock.mockResolvedValueOnce(
      catalogue([
        { id: 'fish-audio/s2.1-pro', canonical_slug: 's2.1-pro', name: 'S2.1 Pro' },
        { id: 'models/fish-audio/s2.1-pro-free', canonical_slug: 's2.1-pro-free' },
        { id: 'fish-audio/s2.1-pro', name: 'S2.1 Pro again' },
        { id: 'fish-audio/custom-voice-model' },
      ]),
    );
    const models = await list();
    expect(models.map((model) => model.id)).toEqual([
      'fish-audio/s2.1-pro',
      'fish-audio/s2.1-pro-free',
      'fish-audio/custom-voice-model',
    ]);
    expect(models[0]).toMatchObject({ displayName: 'S2.1 Pro', capabilities: fishCapabilities('fish-audio/s2.1-pro') });
    expect(models[1].displayName).toBe('s2.1-pro-free');
    expect(models[2].capabilities).toEqual({
      textGeneration: 'unknown',
      imageInput: 'unknown',
      speechOutput: 'unknown',
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(requestedUrl()).toBe(`${FISH_BASE_URL}/models`);
    expect(requestedUrl()).not.toContain('fixture-key');
    expect(init?.headers).toEqual({ Authorization: 'Bearer fixture-key' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('the list answers without a key, and a typed id stays requestable as unknown', async () => {
    fetchMock.mockResolvedValueOnce(catalogue([{ id: 'fish-audio/s2-pro' }]));
    expect(await list('  ')).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
    expect(purposeCapability(fishCapabilities('fish-audio/typed-by-hand'), 'speech')).toBe('unknown');
  });

  test('the four speech models are supported and transcribe-1 stays out of the voice candidates', async () => {
    for (const id of SPEECH_IDS) {
      expect(purposeCapability(fishCapabilities(id), 'speech')).toBe('supported');
      expect(fishCapabilities(id).textGeneration).toBe('unsupported');
    }
    expect(fishCapabilities('fish-audio/transcribe-1')).toEqual({
      textGeneration: 'unsupported',
      imageInput: 'unsupported',
      speechOutput: 'unsupported',
    });
    fetchMock.mockResolvedValueOnce(
      catalogue([...SPEECH_IDS.map((id) => ({ id })), { id: 'fish-audio/transcribe-1' }]),
    );
    const models = await list();
    expect(models.map((model) => model.id)).toHaveLength(5);
    expect(models.filter((model) => purposeCapability(model.capabilities, 'speech') !== 'unsupported')).toHaveLength(4);
  });

  test('an empty list is empty, not the shipped models', async () => {
    fetchMock.mockResolvedValueOnce(catalogue([]));
    expect(await list()).toEqual([]);
  });

  test('a malformed or unbounded list is refused instead of partly returned', async () => {
    const malformed: unknown[] = [
      { models: [] },
      { data: 'nope' },
      { data: [{ id: '' }] },
      { data: [{ name: 'no id' }] },
      { data: Array.from({ length: 1001 }, (_, index) => ({ id: `fish-audio/model-${index}` })) },
    ];
    for (const body of malformed) {
      fetchMock.mockResolvedValueOnce(Response.json(body));
      expect(((await failure(list())) as Error).message).toBe(i18n.t('errors.modelListMalformed'));
    }
  });

  test('a provider failure keeps its status, and the key is redacted', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'key fixture-key is invalid' } }, { status: 401 }),
    );
    const error = (await failure(list())) as Error;
    expect(error.message).toStartWith('401: ');
    expect(error.message).not.toContain('fixture-key');
    expect(error.message).toContain('[redacted]');
  });

  test('a cancelled discovery never returns a partial list', async () => {
    const before = new AbortController();
    before.abort();
    expect(((await failure(list('fixture-key', before.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();

    const live = new AbortController();
    fetchMock.mockImplementationOnce(
      Object.assign(
        async () => {
          live.abort();
          return catalogue([{ id: 'fish-audio/s1' }]);
        },
        { preconnect: () => {} },
      ),
    );
    expect(((await failure(list('fixture-key', live.signal))) as Error).name).toBe('AbortError');
  });
});
