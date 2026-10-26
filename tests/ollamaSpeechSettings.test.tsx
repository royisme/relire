/** Phonon in Settings: a speech engine on Ollama, its help line only there, and names from the locales. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { getAppSettings, type AppSettings } from '../src/utils/appSettings';

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const { ModelField } = await import('../src/components/settings/ModelField');
const { providerRequiresKey, speechProviders } = await import('../src/services/ai/providers');
const { ollamaSpeech } = await import('../src/services/ai/providers/ollama/tts');

const translator = i18next.createInstance();
await translator.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});

const field = async (language: 'en' | 'zh', purpose: 'text' | 'speech', patch: Partial<AppSettings>) => {
  await translator.changeLanguage(language);
  const draft = { ...getAppSettings(), ...patch };
  return renderToStaticMarkup(
    <I18nextProvider i18n={translator}>
      <ModelField
        draft={draft}
        purpose={purpose}
        catalogue={{ models: undefined, loading: false, error: undefined, async fetchModels() {} }}
        onChange={() => {}}
      />
    </I18nextProvider>,
  );
};

test('the registry offers Phonon as a keyless speech engine with its two local models', () => {
  const ollama = speechProviders().find((provider) => provider.info.id === 'ollama');
  expect(ollama).toBeDefined();
  expect(ollama!.speech).toBe(ollamaSpeech);
  expect(ollama!.info.speech?.models).toEqual(['phonon:40m-multilingual', 'phonon:40m-fr']);
  expect(ollama!.info.speech?.defaultModel).toBe('phonon:40m-multilingual');
  expect(ollama!.info.speech?.voices).toEqual([]);
  expect(ollama!.info.speech?.defaultVoice).toBe('');
  expect(providerRequiresKey('ollama')).toBe(false);
});

for (const language of ['en', 'zh'] as const) {
  const locale = language === 'en' ? en : zh;

  test(`${language}: the Phonon help line shows for speech on Ollama only, with localized model names`, async () => {
    const speech = await field(language, 'speech', {
      speechProvider: 'ollama',
      speechModel: 'phonon:40m-multilingual',
      speechVoice: '',
    });
    expect(speech).toContain(locale.aiSettings.ollamaSpeechHelp);
    // A model id that contains ':' resolves to its name, never back to the raw id.
    expect(speech).toContain(
      `<option value="phonon:40m-multilingual">${locale.models['phonon:40m-multilingual'].name}</option>`,
    );
    expect(speech).toContain(`<option value="phonon:40m-fr">${locale.models['phonon:40m-fr'].name}</option>`);
    expect(locale.models['phonon:40m-multilingual'].name).not.toBe('phonon:40m-multilingual');

    // The same field on the same provider for another purpose, and another speech engine: no Phonon line.
    const text = await field(language, 'text', { textProvider: 'ollama', textModel: 'llama3.1' });
    expect(text).toContain('value="llama3.1"');
    expect(text).not.toContain(locale.aiSettings.ollamaSpeechHelp);

    const fish = await field(language, 'speech', {
      speechProvider: 'fish-audio',
      speechModel: 'fish-audio/s2.1-pro-free',
      speechVoice: '',
    });
    expect(fish).toContain('value="fish-audio/s2.1-pro-free"');
    expect(fish).not.toContain(locale.aiSettings.ollamaSpeechHelp);
  });

  test(`${language}: both locales carry the Phonon help and model names`, () => {
    expect(locale.aiSettings.ollamaSpeechHelp.trim()).not.toBe('');
    for (const id of ['phonon:40m-multilingual', 'phonon:40m-fr'] as const)
      expect(locale.models[id].name.trim()).not.toBe('');
  });
}
