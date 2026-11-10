/** A keyless provider (Ollama) is ready without a key: access, Settings keys and the AI save all agree. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import { createByokAccess } from '../src/services/ai/access';
import { providerRequiresKey } from '../src/services/ai/providers';
import { saveSlice } from '../src/components/settings/slices';
import { getAppSettings, hasOcrKey, hasTextKey, saveAppSettings, type AppSettings } from '../src/utils/appSettings';

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchMock.mockRestore();
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const localText = (): AppSettings => ({
  ...getAppSettings(),
  textProvider: 'ollama',
  textModel: 'llama3.1',
  ocrProvider: 'ollama',
  ocrModel: 'llama3.1',
  apiKeys: {},
});

describe('keyless local provider', () => {
  test('only a provider that declares itself keyless skips the key', () => {
    expect(providerRequiresKey('ollama')).toBe(false);
    for (const id of ['gemini', 'openai', 'anthropic', 'fish-audio', 'not-a-provider'])
      expect(providerRequiresKey(id)).toBe(true);
  });

  test('access reports a keyless selection as configured without a key, and still asks others for one', () => {
    const local = createByokAccess(localText());
    expect(local.isConfigured('text')).toBe(true);
    expect(local.isConfigured('ocr')).toBe(true);

    const hosted = createByokAccess({ ...getAppSettings(), apiKeys: {} });
    expect(hosted.isConfigured('text')).toBe(false);
  });

  test('saved settings count a keyless provider as ready, so no feature asks for a key', () => {
    saveAppSettings({ textProvider: 'ollama', textModel: 'llama3.1', ocrProvider: 'ollama', ocrModel: 'llama3.1' });
    expect(hasTextKey()).toBe(true);
    expect(hasOcrKey()).toBe(true);

    saveAppSettings({ textProvider: 'gemini', textModel: 'gemini-2.5-flash' });
    expect(hasTextKey()).toBe(false);
  });

  test('the AI save keeps an Ollama selection with no key and reports it stored', () => {
    const next = saveSlice(localText(), 'ai');
    expect(next.textProvider).toBe('ollama');
    expect(next.textModel).toBe('llama3.1');
    expect(next.apiKeys.ollama ?? '').toBe('');
    expect(getAppSettings().textProvider).toBe('ollama');
  });

  test('queries and checks go out with no Authorization header and never raise a missing key', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ message: { role: 'assistant', content: '{"ok":true}' } }))
      .mockResolvedValueOnce(Response.json({ models: [] }));
    const local = createByokAccess(localText());
    expect(await local.text('text').generateJson({ prompt: 'Bonjour' })).toEqual({ ok: true });
    await local.checkConnection('text');
    for (const [, init] of fetchMock.mock.calls) expect(init?.headers).not.toHaveProperty('Authorization');
    expect(fetchMock.mock.calls[1][0] as string).toEndWith('/api/tags');
  });
});
