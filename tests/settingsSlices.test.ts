/** One AI slice: the three purpose selections and their provider keys save together; Practice stays apart. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import i18n from '../src/i18n';
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

test('a model typed with padding or a models/ prefix saves as its canonical ID', () => {
  saveAppSettings({});
  const draft = draftOf(getAppSettings(), {
    textModel: ' models/gemini-2.5-flash ',
    ocrModel: 'models/custom-vision-2',
  });
  const next = saveSlice(draft, 'ai');
  expect([next.textModel, next.ocrModel]).toEqual(['gemini-2.5-flash', 'custom-vision-2']);
  expect([getAppSettings().textModel, getAppSettings().ocrModel]).toEqual(['gemini-2.5-flash', 'custom-vision-2']);
});

test('an invalid model refuses the AI save with its own message and leaves the stored models unchanged', () => {
  saveAppSettings({ textModel: 'gemini-2.5-pro' });
  const draft = draftOf(getAppSettings(), { textModel: 'gemini-2.5-pro' });
  for (const invalid of ['bad\u0000id', 'x'.repeat(513)]) {
    expect(() => saveSlice({ ...draft, ocrModel: invalid }, 'ai')).toThrow(i18n.t('aiSettings.modelNotValid'));
    expect(getAppSettings().textModel).toBe('gemini-2.5-pro');
  }
});

test('the device engine saves with an empty speech model, while the text and OCR models stay required', () => {
  saveAppSettings({});
  const device = draftOf(getAppSettings(), { speechProvider: 'device', speechModel: '', speechVoice: '' });
  const saved = saveSlice(device, 'ai');
  expect([saved.speechProvider, saved.speechModel, saved.speechVoice]).toEqual(['device', '', '']);
  expect(getAppSettings().speechProvider).toBe('device');
  // Its empty model is not a refusal, but the other purposes' models still are.
  expect(() => saveSlice(draftOf(device, { textModel: '' }), 'ai')).toThrow(i18n.t('aiSettings.modelNotValid'));
});

test('one shared key saves with all three purposes', () => {
  saveAppSettings({});
  const draft = draftOf(getAppSettings(), {
    textModel: ' custom-text-9 ',
    ocrModel: ' custom-ocr-9 ',
    speechModel: ' custom-speech-9 ',
    apiKeys: { gemini: ' shared-key ' },
  });
  const next = saveSlice(draft, 'ai');
  expect(new Set([next.textProvider, next.ocrProvider, next.speechProvider])).toEqual(new Set(['gemini']));
  expect(getApiKey(next, 'gemini')).toBe('shared-key');
  expect([next.textModel, next.ocrModel, next.speechModel]).toEqual([
    'custom-text-9',
    'custom-ocr-9',
    'custom-speech-9',
  ]);
});

test('a voice id the speech provider refuses never saves silently', () => {
  saveAppSettings({});
  const voice = '0123456789abcdef0123456789abcdef';
  const fish = { speechProvider: 'fish-audio', speechModel: 'fish-audio/s2.1-pro-free' };
  // The free-text voice is trimmed and kept, and it is part of the AI slice.
  const kept = saveSlice(draftOf(getAppSettings(), { ...fish, speechVoice: ` ${voice} ` }), 'ai');
  expect(kept.speechVoice).toBe(voice);
  expect(getAppSettings().speechVoice).toBe(voice);
  // An OpenAI preset would be replaced by the default on read-back: refuse the save instead.
  for (const invalid of ['alloy', 'bad voice']) {
    expect(() => saveSlice(draftOf(getAppSettings(), { speechVoice: invalid }), 'ai')).toThrow(
      i18n.t('aiSettings.voiceNotValid'),
    );
    expect(getAppSettings().speechVoice).toBe(voice);
  }
});

test('a speech engine with no voice list saves a typed voice instead of refusing it', () => {
  saveAppSettings({});
  // Ollama has no voice list and names voices per model, so Save accepts the trimmed typed name.
  const saved = saveSlice(
    draftOf(getAppSettings(), {
      speechProvider: 'ollama',
      speechModel: 'phonon:40m-multilingual',
      speechVoice: ' Zoey ',
    }),
    'ai',
  );
  expect(saved.speechVoice).toBe('Zoey');
  expect(getAppSettings().speechVoice).toBe('Zoey');
});

test('each speech engine comes back with its own model and voice after a save and a reload', () => {
  saveAppSettings({});
  const voice = '0123456789abcdef0123456789abcdef';
  // Gemini's choice is saved first.
  saveSlice(draftOf(getAppSettings(), { speechModel: 'gemini-3.8-flash-tts', speechVoice: 'Zephyr' }), 'ai');
  // Switching to Fish keeps Gemini's choice in the draft, as the AI page does, and saves both.
  const fish = draftOf(getAppSettings(), {
    speechProvider: 'fish-audio',
    speechModel: 'fish-audio/s2.1-pro',
    speechVoice: voice,
    speechChoices: { gemini: { model: 'gemini-3.8-flash-tts', voice: 'Zephyr' } },
  });
  saveSlice(fish, 'ai');

  // A reload keeps both engines' choices, so switching back reads Gemini's own instead of a default.
  const reloaded = getAppSettings();
  expect(reloaded.speechChoices).toEqual({
    gemini: { model: 'gemini-3.8-flash-tts', voice: 'Zephyr' },
    'fish-audio': { model: 'fish-audio/s2.1-pro', voice },
  });
  expect(reloaded.speechProvider).toBe('fish-audio');
  expect([reloaded.speechModel, reloaded.speechVoice]).toEqual(['fish-audio/s2.1-pro', voice]);

  // Changing one engine's memory is an AI change, so it needs a save like the selection itself.
  const unsaved = draftOf(reloaded, {
    speechChoices: { ...reloaded.speechChoices, gemini: { model: 'gemini-3.8-flash-tts', voice: 'Puck' } },
  });
  expect(sliceOf(unsaved, 'ai')).not.toBe(sliceOf(reloaded, 'ai'));
  expect(saveSlice(unsaved, 'ai').speechChoices.gemini).toEqual({ model: 'gemini-3.8-flash-tts', voice: 'Puck' });
});

test('a remembered model or voice storage would replace refuses the AI save', () => {
  saveAppSettings({});
  const base = getAppSettings();
  const remembered = (choice: { model: string; voice: string }) =>
    draftOf(base, { speechChoices: { 'fish-audio': choice } });
  expect(() => saveSlice(remembered({ model: 'fish-audio/s2.1-pro', voice: 'alloy' }), 'ai')).toThrow(
    i18n.t('aiSettings.voiceNotValid'),
  );
  expect(() => saveSlice(remembered({ model: 'bad\u0000id', voice: '' }), 'ai')).toThrow(
    i18n.t('aiSettings.modelNotValid'),
  );
  expect(getAppSettings().speechChoices).toEqual({});
});

test('an endpoint override is part of the AI slice, saved with it and refused when unusable', () => {
  saveAppSettings({});
  const base = getAppSettings();
  const draft = draftOf(base, { baseUrls: { gemini: 'https://gemini.example/v1beta' } });
  expect(sliceOf(draft, 'ai')).not.toBe(sliceOf(base, 'ai'));
  expect(saveSlice(draft, 'ai').baseUrls).toEqual({ gemini: 'https://gemini.example/v1beta' });
  expect(getAppSettings().baseUrls).toEqual({ gemini: 'https://gemini.example/v1beta' });

  for (const invalid of ['ftp://x.test', 'https://x.test/v1?a=1', 'x.test']) {
    expect(() => saveSlice(draftOf(getAppSettings(), { baseUrls: { gemini: invalid } }), 'ai')).toThrow(
      i18n.t('aiSettings.baseUrlNotValid'),
    );
    expect(getAppSettings().baseUrls).toEqual({ gemini: 'https://gemini.example/v1beta' });
  }
});

test('an empty endpoint saves as the provider default, and one no purpose uses is not saved', () => {
  saveAppSettings({ baseUrls: { gemini: 'https://gemini.example/v1beta' } });
  expect(saveSlice(draftOf(getAppSettings(), { baseUrls: { gemini: '  ' } }), 'ai').baseUrls).toEqual({});
  expect(getAppSettings().baseUrls).toEqual({});

  saveAppSettings({});
  const unused = saveSlice(draftOf(getAppSettings(), { baseUrls: { openai: 'nonsense' } }), 'ai');
  expect(unused.baseUrls).toEqual({});
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
