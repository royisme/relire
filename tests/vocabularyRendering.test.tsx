/** Static real-component visibility and escaping; visual and browser interaction acceptance remain owner-manual. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { ReactNode } from 'react';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { VocabularyAnswer } from '../src/components/vocabulary/VocabularyAnswer';
import { Flashcard } from '../src/components/vocabulary/Flashcard';
import { testRow, testAnalysis, testLookup } from './fixtures/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';

await import('../src/i18n');
// Settings → Words owns the wordbook controls; the cache hook itself is covered by its own tests and e2e.
// A spy on the actual export restores itself; a module mock would leak into the other test files.
const bookContent = {
  book: undefined,
  busy: false,
  progress: null,
  error: null as string | null,
  restart: false,
  configured: true,
  async download() {},
};
const bookHook = await import('../src/hooks/useVocabularyBook');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
const { VocabularyReview } = await import('../src/components/vocabulary/VocabularyReview');
const { WordsSection } = await import('../src/components/settings/WordsSection');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => {
  // Browser-only speech stores have no server snapshot; read their idle state for this static render.
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, getSnapshot, getServerSnapshot) =>
    useStore(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot),
  );
  const book = spyOn(bookHook, 'useVocabularyBook').mockImplementation((() => bookContent) as never);
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
    book.mockRestore();
  }
};
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

test('Settings Words and waiting Review show the actual bounded reason before any details Sheet is opened in both locales', async () => {
  for (const language of ['en', 'zh']) {
    await i18n.changeLanguage(language);
    for (const error of [
      'HTTP 410: version-unavailable',
      'HTTP 429: rate-limited',
      'Vocabulary content hash mismatch',
      'TEST cache disk refused',
    ]) {
      bookContent.error = error;
      const html = render(
        <WordsSection model={model} draft={{ value: null, onChange: () => {}, onSaved: () => {} }} />,
      );
      expect(html).toContain(error);
      expect(html).toContain('line-clamp-2');
      expect(html).not.toContain('role="dialog"');
    }
    bookContent.error = null;
    const html = render(<VocabularyReview model={{ ...model, error: 'TEST card read refused' }} />);
    expect(html).toContain('TEST card read refused');
    expect(html).not.toContain('role="dialog"');
  }
});
test('Today counts stay and the Words settings link replaces the moved forms', async () => {
  await i18n.changeLanguage('en');
  const html = render(<VocabularyHome model={model} />);
  expect(html).toContain('New remaining today');
  expect(html).toContain('href="#/settings/words"');
  expect(html).not.toContain('New words per day');
  expect(html).not.toContain('Built-in wordbook');
  expect(html).not.toContain('data-vocabulary-download-status');
});
test('the locked real card contains no answer DOM or visible flip action', async () => {
  await i18n.changeLanguage('en');
  const html = render(
    <Flashcard word="test-mot" answer={null} face="front" busy={false} onFlip={() => {}} onListen={() => {}} />,
  );
  expect(html).toContain('aria-label="Flip card"');
  expect(html).toMatch(/data-vocabulary-flip[^>]*><\/button>/);
  expect(html).not.toContain('data-vocabulary-face="back"');
  expect(html).not.toContain('TEST meaning');
  expect(html).not.toMatch(/>Flip card</);
});
test('the unlocked real card leads with the word and complete prose, not Answer or Built-in headings', async () => {
  await i18n.changeLanguage('en');
  const row = testRow();
  row.bookSource!.senses = [
    {
      pos: 'nom TEST',
      gloss: { en: '<script>TEST meaning</script>', zh: 'TEST' },
      examples: [{ fr: 'TEST example', en: 'TEST translation', zh: 'TEST' }],
    },
    { gloss: { en: 'TEST second sense', zh: 'TEST' }, examples: [] },
  ];
  const word = { ...row, row, builtIn: true };
  const html = render(
    <Flashcard word={row.word} answer={word} face="back" busy={false} onFlip={() => {}} onListen={() => {}} />,
  );
  expect(html).toContain('data-vocabulary-face="back"');
  expect(html).toContain('aria-label="Flip to front"');
  expect(html).not.toMatch(/>Flip (?:card|to front)</);
  expect(html).not.toMatch(/<h[1-6][^>]*>(?:Answer|Built-in)<\/h[1-6]>/);
  expect(html).toContain('nom TEST');
  expect(html).toContain('TEST second sense');
  expect(html).toContain('TEST example');
  expect(html).toContain('TEST translation');
  expect(html).toContain('&lt;script&gt;TEST meaning&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
  expect(html).not.toContain('role="button"');
  const detail = render(<VocabularyAnswer word={word} />);
  expect(detail).toContain('Built-in</p>');
  expect(detail).not.toContain('<h3');
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
