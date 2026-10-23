/** BYOK settings keep independent purpose selections and custom model IDs, never a legacy inheritance rule. */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getApiKey, getAppSettings, getBaseUrl, saveAppSettings, speechAfterCheck } from '../src/utils/appSettings';
import { sliceOf, withSlice } from '../src/components/settings/slices';
import { exportSettingsBackup, restoreSettingsBackup } from '../src/components/settings/backupSettings';

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

  test('an endpoint override is trimmed on save, and an unusable one never reaches storage', () => {
    saveAppSettings({ baseUrls: { openai: ' https://api.deepseek.com/v1/ ' } });
    expect(getAppSettings().baseUrls).toEqual({ openai: 'https://api.deepseek.com/v1' });
    expect(getBaseUrl(getAppSettings(), 'openai')).toBe('https://api.deepseek.com/v1');
    expect(getBaseUrl(getAppSettings(), 'gemini')).toBe('');

    for (const invalid of [
      'ftp://example.com',
      'https://user:pw@example.com/v1',
      'https://example.com/v1?key=1',
      'https://example.com/v1#fragment',
      'api.deepseek.com',
      'not a url',
      `https://example.com/${'a'.repeat(2048)}`,
      7,
      null,
    ]) {
      storage.set('relire_app_settings_v1', JSON.stringify({ baseUrls: { openai: invalid } }));
      expect(getAppSettings().baseUrls).toEqual({});
    }
    storage.set('relire_app_settings_v1', JSON.stringify({ baseUrls: [] }));
    expect(getAppSettings().baseUrls).toEqual({});
  });

  test('a speech provider with a free-text voice keeps an id it accepts and drops one it refuses', () => {
    const voice = '0123456789abcdef0123456789abcdef';
    saveAppSettings({
      speechProvider: 'fish-audio',
      speechModel: 'fish-audio/s2.1-pro-free',
      speechVoice: ` ${voice} `,
    });
    expect(getAppSettings().speechVoice).toBe(voice);
    // An OpenAI preset is not a Fish voice: storage falls back to the provider's default (empty).
    for (const invalid of ['alloy', 'nova', 'bad voice', 7, null]) {
      storage.set('relire_app_settings_v1', JSON.stringify({ speechProvider: 'fish-audio', speechVoice: invalid }));
      expect(getAppSettings().speechVoice).toBe('');
    }
    // A fixed voice list stays the whitelist it always was.
    saveAppSettings({ speechProvider: 'gemini', speechVoice: voice });
    expect(getAppSettings().speechVoice).toBe('Kore');
  });

  test('the device engine stores neither a model nor a voice, and hand-written ones do not survive', () => {
    saveAppSettings({ speechProvider: 'device' });
    expect([getAppSettings().speechProvider, getAppSettings().speechModel, getAppSettings().speechVoice]).toEqual([
      'device',
      '',
      '',
    ]);
    for (const raw of [
      { speechModel: 'gemini-2.5-flash', speechVoice: 'Kore' },
      { speechModel: 'Kore', speechVoice: 7 },
    ]) {
      storage.set('relire_app_settings_v1', JSON.stringify({ speechProvider: 'device', ...raw }));
      expect([getAppSettings().speechModel, getAppSettings().speechVoice]).toEqual(['', '']);
    }
    // An unregistered speech provider is not kept either.
    storage.set('relire_app_settings_v1', JSON.stringify({ speechProvider: 'not-registered' }));
    expect(getAppSettings().speechProvider).toBe('gemini');
  });

  test('each speech engine keeps its own model and voice, and storage drops the values it cannot keep', () => {
    const voice = '0123456789abcdef0123456789abcdef';
    storage.set(
      'relire_app_settings_v1',
      JSON.stringify({
        speechProvider: 'fish-audio',
        speechModel: 'fish-audio/s2.1-pro',
        speechVoice: voice,
        speechChoices: {
          gemini: { model: 'gemini-3.8-flash-tts', voice: 'Zephyr' },
          'fish-audio': { model: 'fish-audio/s2.1-pro', voice },
          // Not a registered speech engine: bounded by the registry, so dropped.
          'not-registered': { model: 'any-model', voice: 'any-voice' },
          openai: { model: 'gpt-4o-mini', voice: 'alloy' },
          // The device engine has no model or voice, whatever was written.
          device: { model: 'gemini-2.5-flash', voice: 'Kore' },
        },
      }),
    );
    const choices = getAppSettings().speechChoices;
    expect(choices).toEqual({
      gemini: { model: 'gemini-3.8-flash-tts', voice: 'Zephyr' },
      'fish-audio': { model: 'fish-audio/s2.1-pro', voice },
      device: { model: '', voice: '' },
    });
    // A model storage cannot keep drops that engine's whole entry...
    expect(
      saveAppSettings({ speechChoices: { 'fish-audio': { model: 'bad\u0000id', voice: '' } } }).speechChoices,
    ).toEqual({});
    // ...and a voice outside a fixed list becomes that engine's default, as the current selection does.
    expect(
      saveAppSettings({ speechChoices: { gemini: { model: 'gemini-3.8-flash-tts', voice: 'Klingon' } } }).speechChoices,
    ).toEqual({ gemini: { model: 'gemini-3.8-flash-tts', voice: 'Kore' } });
    // A value that is not even an object is ignored, not guessed at.
    expect(saveAppSettings({ speechChoices: { gemini: 'nope' } as never }).speechChoices).toEqual({});
  });

  test('a check replays with the selected engine only after the remote opt-in, else with the device voice', () => {
    const base = getAppSettings();
    // Gemini is a remote engine: without the opt-in, a checked dictation replays with the device voice,
    // at no cost and without synthesizing or storing anything remotely.
    expect(speechAfterCheck({ ...base, practiceSpeakAfterCheck: true })).toBe('device');
    expect(speechAfterCheck({ ...base, practiceSpeakAfterCheck: true, practiceRemoteAutoSpeak: true })).toBe(
      'selected',
    );
    // The opt-in never overrides the dictation preference itself: master off, nothing speaks.
    expect(speechAfterCheck({ ...base, practiceSpeakAfterCheck: false, practiceRemoteAutoSpeak: true })).toBe(null);
    // The device voice costs nothing, so the selected engine speaks without the opt-in.
    expect(speechAfterCheck({ ...base, speechProvider: 'device', practiceSpeakAfterCheck: true })).toBe('selected');
    expect(speechAfterCheck({ ...base, speechProvider: 'device', practiceSpeakAfterCheck: false })).toBe(null);
  });

  test('an existing install has no endpoint, and a restored backup keeps the endpoint but never a key', () => {
    storage.set('relire_app_settings_v1', JSON.stringify({ textProvider: 'openai', textModel: 'gpt-4o-mini' }));
    expect(getAppSettings().baseUrls).toEqual({});

    saveAppSettings({ baseUrls: { openai: 'https://api.qwen.test/v1' }, apiKeys: { openai: 'local-key' } });
    const exported = exportSettingsBackup();
    storage.clear();
    restoreSettingsBackup(exported);
    expect(getAppSettings().baseUrls).toEqual({ openai: 'https://api.qwen.test/v1' });
    expect(getApiKey(getAppSettings(), 'openai')).toBe('');
  });
});

describe('browser speech recognition opt-in', () => {
  test('it is off by default, and a stored true roundtrips', () => {
    expect(getAppSettings().practiceBrowserRecognition).toBe(false);
    expect(saveAppSettings({ practiceBrowserRecognition: true }).practiceBrowserRecognition).toBe(true);
    expect(getAppSettings().practiceBrowserRecognition).toBe(true);
    saveAppSettings({ practiceBrowserRecognition: false });
    expect(getAppSettings().practiceBrowserRecognition).toBe(false);
    // Unreadable storage falls back to the built-in defaults, which are off too.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('TEST ONLY unreadable storage');
        },
        setItem: () => undefined,
      },
    });
    expect(getAppSettings().practiceBrowserRecognition).toBe(false);
  });

  test('a malformed stored value falls back to off', () => {
    for (const value of ['true', 1, null, {}, []]) {
      storage.set('relire_app_settings_v1', JSON.stringify({ practiceBrowserRecognition: value }));
      expect(getAppSettings().practiceBrowserRecognition).toBe(false);
    }
  });

  test('the practice slice carries the field, so Save notices it and copies it into the stored settings', () => {
    const base = getAppSettings();
    const changed = { ...base, practiceBrowserRecognition: true };
    expect(sliceOf(changed, 'practice')).not.toBe(sliceOf(base, 'practice'));
    expect(withSlice(base, changed, 'practice').practiceBrowserRecognition).toBe(true);
    // The AI slice never carries it.
    expect(withSlice(base, changed, 'ai').practiceBrowserRecognition).toBe(base.practiceBrowserRecognition);
  });
});
