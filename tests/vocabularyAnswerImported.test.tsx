/** Invented TEST cards. Imported answers drop the import label and source title; other kinds keep theirs. */
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { VocabularyAnswer } from '../src/components/vocabulary/VocabularyAnswer';
import type { VocabularyJoined } from '../src/services/vocabulary/queue';
import { vocabularyContextKey, vocabularyId, vocabularyKey } from '../src/services/vocabulary/identity';
import type { VocabularyBookSource, VocabularyRow } from '../src/types/vocabulary';

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);

// Hand-written en copy: vocab.savedContext and the import label the card must not show.
const SAVED_CONTEXT = 'Personal context';
const IMPORTED_NOTE = 'Imported note';
const HEADER = 'class="space-y-1 text-xs text-ink-600"';

const WORD = 'test-mot';
const KEY = vocabularyKey(WORD);

type Context = VocabularyRow['contexts'][number];

function joined(contexts: Context[], bookSource?: VocabularyBookSource): VocabularyJoined {
  const row: VocabularyRow = {
    id: vocabularyId(KEY),
    key: KEY,
    word: WORD,
    createdAt: 1,
    bookmarked: false,
    bookmarkedAt: null,
    contexts,
    schedule: null,
    introducedAt: null,
    revision: 0,
    history: [],
    ...(bookSource ? { bookSource } : {}),
  };
  return { key: KEY, word: WORD, builtIn: bookSource !== undefined, row, ...(bookSource ? { bookSource } : {}) };
}

function imported(back: string, tags: string[], title: string, noteId: string): Context {
  const source = { kind: 'import' as const, id: 'TEST import deck', title, noteId };
  const sentence = '';
  const requestLanguage = 'en' as const;
  return {
    id: vocabularyContextKey({ source, sentence, requestLanguage }),
    sentence,
    savedAt: 1,
    requestLanguage,
    source,
    definition: { kind: 'imported', front: WORD, back, tags },
  };
}

function reader(title: string): Context {
  const source = { kind: 'reader' as const, id: 'TEST reader source', title };
  const sentence = 'TEST reader sentence.';
  const requestLanguage = 'en' as const;
  return {
    id: vocabularyContextKey({ source, sentence, requestLanguage }),
    sentence,
    savedAt: 1,
    requestLanguage,
    source,
    definition: {
      kind: 'reader',
      readerId: 'test-reader',
      version: 'b'.repeat(64),
      entry: {
        id: 'test-adverb',
        lemma: WORD,
        pos: 'adverb',
        sense: 'test-sense',
        forms: [WORD],
        gloss: { en: 'TEST reader gloss', zh: '测试' },
      },
      sentenceTranslation: { en: 'TEST reader translation', zh: '测试句' },
    },
  };
}

const sectionOf = (html: string) => html.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';

test('imported context with a source title and tags shows the tags and answer, not the title or Imported note', () => {
  const title = 'TEST imported source title';
  const back = 'TEST imported answer';
  const tags = ['TEST tag one', 'TEST tag two'];
  const html = render(<VocabularyAnswer word={joined([imported(back, tags, title, 'TEST note 1')])} />);
  const header = html.match(/<div class="space-y-1 text-xs text-ink-600">([\s\S]*?)<\/div>/)?.[1] ?? '';
  expect(html).toContain(back);
  expect(header).toContain(tags.join(' \u00b7 '));
  expect(html).not.toContain(title);
  expect(html).not.toContain(IMPORTED_NOTE);
  expect(html).not.toContain(SAVED_CONTEXT);
});

test('imported context without tags renders the answer and no header element', () => {
  const title = 'TEST tagless source title';
  const back = 'TEST tagless imported answer';
  const html = render(<VocabularyAnswer word={joined([imported(back, [], title, 'TEST note 2')])} />);
  const section = sectionOf(html);
  expect(section).toContain(back);
  expect(section).not.toContain(title);
  expect(section).not.toContain(IMPORTED_NOTE);
  expect(section).not.toContain(SAVED_CONTEXT);
  expect(section).not.toContain(HEADER);
  expect(section.match(/<div\b[^>]*>\s*<\/div>/g) ?? []).toEqual([]);
});

test('a reader context still shows Personal context and its source title', () => {
  const title = 'TEST reader source title';
  const html = render(<VocabularyAnswer word={joined([reader(title)])} />);
  expect(html).toContain(SAVED_CONTEXT);
  expect(html).toContain(title);
  expect(html).not.toContain(IMPORTED_NOTE);
});

test('a built-in example sentence still shows beside an imported context', () => {
  const example = 'TEST built-in example sentence';
  const back = 'TEST imported beside the book';
  const bookSource: VocabularyBookSource = {
    bookId: 'tcf-7000',
    version: 'c'.repeat(64),
    sourceIds: ['TEST source'],
    senses: [
      {
        gloss: { en: 'TEST built-in gloss', zh: '测试' },
        examples: [{ fr: example, en: 'TEST built-in example translation', zh: '测试例句' }],
      },
    ],
  };
  const html = render(
    <VocabularyAnswer
      word={joined([imported(back, ['TEST book tag'], 'TEST book import title', 'TEST note 4')], bookSource)}
    />,
  );
  const exampleAt = html.indexOf(example);
  const answerAt = html.indexOf(back);
  expect(exampleAt).toBeGreaterThanOrEqual(0);
  expect(answerAt).toBeGreaterThan(exampleAt);
});
