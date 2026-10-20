/** Static real-component error visibility and escaping; browser focus/geometry are asserted separately. */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { ReactNode } from 'react';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { VocabularyAnswer } from '../src/components/vocabulary/VocabularyAnswer';
import { testRow, testAnalysis, testLookup } from './fixtures/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';

await import('../src/i18n');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
const { VocabularyReview } = await import('../src/components/vocabulary/VocabularyReview');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const model: VocabularyModel = {
  rows: [],
  preferences: { newPerDay: 20 },
  day: { date: '2026-10-20', introducedKeys: [] },
  epoch: 0,
  now: 1,
  error: null,
  async refresh() {},
  async savePreferences() {},
};

test('Home and waiting Review show the actual bounded reason before any details Sheet is opened in both locales', async () => {
  for (const language of ['en', 'zh']) {
    await i18n.changeLanguage(language);
    for (const error of [
      'HTTP 410: version-unavailable',
      'HTTP 429: rate-limited',
      'Vocabulary content hash mismatch',
      'TEST cache disk refused',
    ]) {
      const html = render(
        <VocabularyHome
          model={model}
          content={{
            book: undefined,
            busy: false,
            progress: null,
            error,
            restart: false,
            configured: true,
            async download() {},
          }}
        />,
      );
      expect(html).toContain(error);
      expect(html).toContain('line-clamp-2');
      expect(html).not.toContain('role="dialog"');
    }
    const html = render(<VocabularyReview model={{ ...model, error: 'TEST card read refused' }} />);
    expect(html).toContain('TEST card read refused');
    expect(html).not.toContain('role="dialog"');
  }
});
test('personal source, sentence and analysis markup render as escaped text, never HTML elements', async () => {
  const literal = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const lookup = { ...testLookup(), sentence: literal };
  const row = {
    ...testRow(),
    contexts: [
      {
        id: vocabularyContextKey(lookup),
        sentence: literal,
        savedAt: 1,
        requestLanguage: 'en' as const,
        source: { kind: 'unit' as const, id: 'test', title: literal },
        analysis: {
          ...testAnalysis(),
          translation: literal,
          usageExamples: [{ fr: literal, zh: literal, en: literal }],
        },
      },
    ],
  };
  const html = render(<VocabularyAnswer word={{ ...row, row, builtIn: false }} snapshot />);
  expect(html).toContain('&lt;img');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toMatch(/<(?:img|script)\b/);
  expect(html).not.toContain('dangerouslySetInnerHTML');
});
