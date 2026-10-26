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
import { VocabularyImportResult } from '../src/components/vocabulary/VocabularyImport';
import { prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';
import { testReaderDefinition, testReaderLookup } from './fixtures/vocabularyReader';
import { VocabularyContextSchema } from '../src/types/vocabulary';
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
const { VocabularyBrowser } = await import('../src/components/vocabulary/VocabularyBrowser');
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
const { VocabularyView } = await import('../src/components/VocabularyView');
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
  preferences: { newPerDay: 20, retentionPercent: 90 },
  ready: true,
  day: { date: '2026-10-20', introducedKeys: [] },
  epoch: 0,
  now: 1,
  error: null,
  async refresh() {},
  async savePreferences() {},
};

test('Words and Overview use the owner-approved labels in the real en/zh locales', () => {
  for (const [copy, words, overview] of [
    [en, 'Words', 'Overview'],
    [zh, '\u8bcd\u6c47', '\u6982\u89c8'],
  ] as const) {
    expect(copy.nav.words).toBe(words);
    expect(copy.vocab.title).toBe(words);
    expect(copy.settings.sections.words.title).toBe(words);
    expect(copy.today.practice.words).toBe(words);
    expect(copy.vocab.overview).toBe(overview);
    expect(copy.vocab).not.toHaveProperty('today');
  }
});

test('Words home owns Overview, All words and Map links outside My study in both locales', async () => {
  for (const language of ['en', 'zh']) {
    await i18n.changeLanguage(language);
    const html = render(<VocabularyView model={model} />);
    const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    const links = nav.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(links).toHaveLength(3);
    expect(links[0]).toContain('href="#/words" aria-current="page"');
    expect(links[0]).toContain(`>${i18n.t('vocab.overview')}</a>`);
    expect(links[1]).toContain('href="#/words/all"');
    expect(links[1]).toContain(`>${i18n.t('vocab.allWords')}</a>`);
    expect(links[2]).toContain('href="#/words/map"');
    expect(links[2]).toContain(`>${i18n.t('vocab.map.title')}</a>`);
    expect(nav).not.toContain('#/study');
    expect(links.filter((link) => link.includes('aria-current'))).toHaveLength(1);
  }
});

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
        <WordsSection
          model={model}
          draft={{ value: null, retention: null, onChange: () => {}, onRetentionChange: () => {}, onSaved: () => {} }}
        />,
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
test('Overview shows the real wordbook error, never C0 or a busy action, and prefers a model error when both fail', async () => {
  try {
    for (const language of ['en', 'zh'] as const) {
      await i18n.changeLanguage(language);
      bookContent.error = 'TEST wordbook cache read refused';
      for (const error of [null, 'TEST learner rows read refused']) {
        const html = render(<VocabularyView place="home" model={{ ...model, error }} />);
        const status = html.match(/<p\b[^>]*role="alert"[^>]*>(.*?)<\/p>/)?.[0];
        expect(status).toContain(`>${error ?? bookContent.error}</p>`);
        expect(status).toContain('h-12');
        if (error) expect(html).not.toContain(bookContent.error);
        const slot = html.match(/<div class="space-y-8"><div\b([^>]*)>([\s\S]*?)<\/div>/);
        expect(slot).not.toBeNull();
        expect(slot![1]).toContain('h-12');
        expect(slot![1]).not.toContain('aria-busy');
        expect(slot![2]).toBe('');
        expect(html).not.toContain(i18n.t('vocab.action.empty'));
        expect(html).not.toContain('href="#/words/review"');
        expect([...html.matchAll(/<dd\b[^>]*>(.*?)<\/dd>/g)].map((stat) => stat[1])).toEqual([
          '\u2013',
          '\u2013',
          '\u2013',
        ]);
      }
    }
  } finally {
    bookContent.error = null;
  }
});

test('import results reserve a live status slot in every state, and imported answers render without AI/reader assumptions', async () => {
  for (const language of ['en', 'zh'] as const) {
    await i18n.changeLanguage(language);
    const note = prepareVocabularyImport(
      parsePlainText('chat\tTEST cat'),
      { front: 0, back: 1, example: null },
      'TEST deck',
      language,
      1,
    ).notes[0];
    const row = { ...testRow('chat'), bookSource: undefined, contexts: [note.context] };
    const answer = render(<VocabularyAnswer word={{ key: row.key, word: row.word, builtIn: false, row }} />);
    expect(answer).toContain('TEST cat');
    expect(answer).toContain('TEST deck');
    expect(answer).not.toContain('undefined');
    for (const state of [
      { error: null, result: null, ready: null },
      { error: null, result: null, ready: { rows: 3, accepted: 2, rejected: 1 } },
      { error: 'TEST disk refused', result: null, ready: null },
      {
        error: null,
        result: { imported: 2, merged: 1, rejected: [{ row: 7, reason: 'TEST missing column' }] },
        ready: null,
      },
    ]) {
      const html = render(<VocabularyImportResult {...state} />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-atomic="true"');
      const slot = html.match(/<div\b[^>]*role="status"[^>]*>/)![0];
      expect(slot).toContain('min-h-12');
      expect(slot).not.toContain('h-32');
      expect(slot).not.toContain('h-40');
      expect(slot).not.toContain('overflow-auto');
      if (state.ready) expect(html).toContain(i18n.t('vocab.import.ready', { accepted: 2, rejected: 1 }));
      if (state.error) expect(html).toContain(state.error);
      if (state.result) {
        expect(html).toContain('7');
        expect(html).toContain('TEST missing column');
        expect(html.match(/<ul\b[^>]*>/)![0]).toContain('max-h-40 overflow-auto');
        expect(html.match(/overflow-auto/g)).toHaveLength(1);
      }
    }
  }
});

test('Overview counts stay and keep no Words settings link or form', async () => {
  await i18n.changeLanguage('en');
  const html = render(<VocabularyHome model={model} book={undefined} pending={false} />);
  const labels = [...html.matchAll(/<dt\b[^>]*>(.*?)<\/dt>/g)].map((match) => match[1]);
  expect(labels).toEqual([i18n.t('vocab.due'), i18n.t('vocab.learning'), i18n.t('vocab.available')]);
  expect(labels[2]).toBe('New words available today');
  expect(html).not.toContain('href="#/settings/words"');
  expect(html).not.toContain('New words per day');
  expect(html).not.toContain('Built-in wordbook');
  expect(html).not.toContain('data-vocabulary-download-status');
});
test('Review has only Back to Words, with no footer Browse words link', async () => {
  await i18n.changeLanguage('en');
  const html = render(<VocabularyReview model={model} />);
  expect(html).toContain('Back to Words');
  expect(html).toContain('href="#/words"');
  expect(html).not.toContain('href="#/words/all"');
  expect(html).not.toContain('Browse words');
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
        definition: {
          kind: 'ai' as const,
          analysis: {
            ...testAnalysis(),
            translation: literal,
            usageExamples: [{ fr: literal, zh: literal, en: literal }],
          },
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

const readerLookup = testReaderLookup();
const readerDefinition = testReaderDefinition();
const readerContext = VocabularyContextSchema.parse({
  sentence: readerLookup.sentence,
  source: readerLookup.source,
  requestLanguage: readerLookup.requestLanguage,
  id: vocabularyContextKey(readerLookup),
  savedAt: 1,
  definition: readerDefinition,
});
const readerRow = { ...testRow(readerLookup.word), bookSource: undefined, contexts: [readerContext] };
const aiLookup = testLookup('test-ai');
const aiDefinition = {
  kind: 'ai' as const,
  analysis: { ...testAnalysis(aiLookup.word), translation: '\u6d4b\u8bd5 AI', translationEn: 'TEST AI gloss' },
};
const aiRow = {
  ...testRow(aiLookup.word),
  bookSource: undefined,
  contexts: [
    VocabularyContextSchema.parse({
      sentence: aiLookup.sentence,
      requestLanguage: aiLookup.requestLanguage,
      id: vocabularyContextKey(aiLookup),
      savedAt: 1,
      definition: aiDefinition,
    }),
  ],
};
for (const language of ['en', 'zh'] as const) {
  test(`${language}: authored answer uses the stored gloss, noun gender and sentence translation, never AI language/provenance or fabricated examples`, async () => {
    await i18n.changeLanguage(language);
    const html = render(<VocabularyAnswer word={{ ...readerRow, row: readerRow, builtIn: false }} snapshot />);
    expect(html).toContain(readerDefinition.entry.gloss[language]);
    expect(html).toContain(readerDefinition.sentenceTranslation[language]);
    expect(html).toContain(readerLookup.sentence);
    expect(html).toContain(readerLookup.source!.title);
    expect(html).toContain(i18n.t('practice.genderMasculine'));
    expect(html).not.toContain(i18n.t('vocab.savedLanguage', { language: i18n.t('vocab.language.en') }));
    expect(html).not.toContain('TEST guide');
    expect(html).not.toContain('/test/');
    expect(html).not.toContain('Une phrase TEST.');
    expect(html).not.toContain(i18n.t('vocab.builtIn'));
    const ai = render(<VocabularyAnswer word={{ ...aiRow, row: aiRow, builtIn: false }} snapshot />);
    expect(ai).toContain(language === 'en' ? aiDefinition.analysis.translationEn : aiDefinition.analysis.translation);
    expect(ai).toContain(i18n.t('vocab.savedLanguage', { language: i18n.t('vocab.language.en') }));
    expect(ai).toContain('Une phrase TEST.');
  });
  test(`${language}: real browser search finds either definition variant and authored sentence translations`, async () => {
    await i18n.changeLanguage(language);
    for (const [query, expected, absent] of [
      [readerDefinition.entry.gloss[language], readerRow.word, aiRow.word],
      [readerDefinition.sentenceTranslation[language], readerRow.word, aiRow.word],
      [readerLookup.sentence, readerRow.word, aiRow.word],
      [
        language === 'en' ? aiDefinition.analysis.translationEn : aiDefinition.analysis.translation,
        aiRow.word,
        readerRow.word,
      ],
      ['No TEST match', null, readerRow.word],
    ] as const) {
      const useState = React.useState;
      const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
        const actual = useState(initial);
        return initial === '' ? [query, () => {}] : actual;
      }) as typeof React.useState);
      try {
        const html = render(<VocabularyBrowser rows={[readerRow, aiRow]} />);
        if (expected) expect(html).toContain(`>${expected}</button>`);
        else expect(html).toContain(i18n.t('vocab.noResults'));
        expect(html).not.toContain(`>${absent}</button>`);
      } finally {
        state.mockRestore();
      }
    }
  });
}
