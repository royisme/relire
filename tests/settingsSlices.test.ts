/** One AI slice: the three purpose selections and their provider keys save together; Practice stays apart. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { getApiKey, getAppSettings, saveAppSettings, type AppSettings } from '../src/utils/appSettings';
import { saveSlice, sliceOf, withSlice } from '../src/components/settings/slices';

const storage = new Map<string, string>();
let refuseWrites = false;
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  storage.clear();
  refuseWrites = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (refuseWrites) throw new Error('quota');
        storage.set(key, value);
      },
    },
  });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const draftOf = (base: AppSettings, patch: Partial<AppSettings>): AppSettings => ({ ...base, ...patch });

test('saving AI writes the text, OCR and speech selections plus one shared key, and never Practice', () => {
  saveAppSettings({ apiKeys: { gemini: 'saved-key' }, practiceStrictAccents: true, practiceDictationSpeed: 1 });
  const saved = getAppSettings();
  const draft = draftOf(saved, {
    textModel: 'custom-text-v1',
    ocrModel: 'custom-vision-v2',
    speechModel: 'custom-speech-v3',
    speechVoice: 'Zephyr',
    apiKeys: { gemini: ' draft-key ' },
    practiceStrictAccents: false,
    practiceDictationSpeed: 1.5,
  });
  const next = saveSlice(draft, 'ai');
  expect([next.textModel, next.ocrModel, next.speechModel]).toEqual([
    'custom-text-v1',
    'custom-vision-v2',
    'custom-speech-v3',
  ]);
  expect(next.speechVoice).toBe('Zephyr');
  expect(getApiKey(next, 'gemini')).toBe('draft-key');
  // Practice is its own slice: an AI save leaves it as it was stored.
  expect(next.practiceStrictAccents).toBe(true);
  expect(next.practiceDictationSpeed).toBe(1);
});

test('each purpose keeps its own model, and a Practice edit is not an AI change', () => {
  const base = getAppSettings();
  const ocrOnly = draftOf(base, { ocrModel: 'vision-x' });
  expect(sliceOf(ocrOnly, 'ai')).not.toBe(sliceOf(base, 'ai'));
  expect(withSlice(base, ocrOnly, 'ai').textModel).toBe(base.textModel);
  expect(withSlice(base, ocrOnly, 'ai').speechModel).toBe(base.speechModel);
  expect(withSlice(base, ocrOnly, 'ai').ocrModel).toBe('vision-x');
  for (const practice of [{ practiceStrictAccents: !base.practiceStrictAccents }, { practiceDictationSpeed: 1.5 }])
    expect(sliceOf(draftOf(base, practice), 'ai')).toBe(sliceOf(base, 'ai'));
});

test('one key serves every purpose that uses the same provider', () => {
  const base = getAppSettings();
  const keyed = withSlice(base, draftOf(base, { apiKeys: { gemini: 'new-key' } }), 'ai');
  expect(keyed.apiKeys).toEqual({ gemini: 'new-key' });
  expect(new Set([keyed.textProvider, keyed.ocrProvider, keyed.speechProvider])).toEqual(new Set(['gemini']));
});

test('a write the browser refuses is reported, not shown as saved', () => {
  saveAppSettings({ apiKeys: { gemini: 'saved-key' } });
  const draft = draftOf(getAppSettings(), { textModel: 'gemini-2.5-pro' });
  refuseWrites = true;
  const logged = console.error;
  console.error = () => {};
  try {
    expect(() => saveSlice(draft, 'ai')).toThrow();
  } finally {
    console.error = logged;
  }
  expect(getAppSettings().textModel).not.toBe('gemini-2.5-pro');
});
