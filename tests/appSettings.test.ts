/** BYOK settings keep independent purpose selections and custom model IDs, never a legacy inheritance rule. */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getApiKey, getAppSettings, saveAppSettings } from '../src/utils/appSettings';

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('appSettings BYOK configuration', () => {
  test('custom text, OCR and speech models roundtrip independently, with one shared provider key', () => {
    saveAppSettings({
      textModel: 'custom-text-v1',
      ocrProvider: 'gemini',
      ocrModel: 'models/custom-vision-v2',
      speechModel: 'custom-speech-v3',
      apiKeys: { gemini: ' fixture-key ' },
    });
    const saved = getAppSettings();
    expect(saved.textModel).toBe('custom-text-v1');
    expect(saved.ocrModel).toBe('custom-vision-v2');
    expect(saved.speechModel).toBe('custom-speech-v3');
    expect(getApiKey(saved, saved.ocrProvider)).toBe('fixture-key');
    saveAppSettings({ textModel: 'different-text' });
    expect(getAppSettings().ocrModel).toBe('custom-vision-v2');
    expect(getAppSettings().speechModel).toBe('custom-speech-v3');
  });

  test('malformed model IDs fall back, but missing OCR is not inherited from text', () => {
    storage.set('relire_app_settings_v1', JSON.stringify({ textModel: 'custom-text' }));
    expect(getAppSettings().ocrModel).toBe('gemini-2.5-flash');
    for (const textModel of ['', '  ', 'bad\nmodel', 'bad\u0000model', 'x'.repeat(513), 7, {}]) {
      storage.set('relire_app_settings_v1', JSON.stringify({ textModel }));
      expect(getAppSettings().textModel).toBe('gemini-2.5-flash');
    }
  });

  test('malformed settings and key values cannot escape the storage trust boundary', () => {
    for (const raw of [null, [], { apiKeys: { gemini: 7 } }, { textProvider: 4 }]) {
      storage.set('relire_app_settings_v1', JSON.stringify(raw));
      const settings = getAppSettings();
      expect(settings.textProvider).toBe('gemini');
      expect(getApiKey(settings, 'gemini')).toBe('');
    }
  });
});
