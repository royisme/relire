/** Wordbook listing, the one study-book rule and the queue it filters: invented rows only, no storage. */
import { expect, test } from 'bun:test';
import type { VocabularyRow } from '../src/types/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import {
  BUILTIN_WORDS,
  MY_WORDS,
  deckStudyBook,
  deckSummaries,
  effectiveStudyBook,
  inMyWords,
  inStudyBook,
} from '../src/services/vocabulary/wordbooks';
import { joinVocabulary, vocabularyQueue } from '../src/services/vocabulary/queue';
import { initialVocabularySchedule } from '../src/utils/srs';
import { testBook, testDefinition, testLookup, testRow } from './fixtures/vocabulary';
import { testReaderDefinition, testReaderLookup } from './fixtures/vocabularyReader';

type Context = VocabularyRow['contexts'][number];
const now = new Date(2026, 9, 26, 12).getTime();

const aiContext = (word: string): Context => ({
  id: vocabularyContextKey(testLookup(word)),
  sentence: `Une phrase ${word}.`,
  savedAt: 1,
  requestLanguage: 'en',
  definition: testDefinition(word),
});
const readerLookup = testReaderLookup();
const readerContext: Context = {
  id: vocabularyContextKey(readerLookup),
  sentence: readerLookup.sentence,
  savedAt: 1,
  requestLanguage: 'en',
  ...(readerLookup.source ? { source: readerLookup.source } : {}),
  definition: testReaderDefinition(),
};
const importContext = (deck: string, title: string, noteId: string, word: string): Context => ({
  id: vocabularyContextKey({
    source: { kind: 'import', id: deck, title, noteId },
    sentence: '',
    requestLanguage: 'en',
  }),
  sentence: '',
  savedAt: 1,
  requestLanguage: 'en',
  source: { kind: 'import', id: deck, title, noteId },
  definition: { kind: 'imported', front: word, back: 'TEST back', tags: [] },
});
/** A row with no book source, so only its contexts decide which wordbooks it belongs to. */
function row(word: string, contexts: Context[], schedule = false, bookmarkedAt = 1): VocabularyRow {
  const { bookSource: _book, ...base } = testRow(word);
  return {
    ...base,
    bookmarked: contexts.length > 0,
    bookmarkedAt: contexts.length ? bookmarkedAt : null,
    contexts,
    ...(schedule ? { schedule: initialVocabularySchedule(now - 1000), introducedAt: now - 1000 } : {}),
  };
}
const ALPHA = 'deck-alpha';
const BETA = 'deck-beta';
const ALPHA_TITLE = 'Zeta deck';
const BETA_TITLE = 'Alpha deck';

test('deck summaries group by deck id, title from the deck, count rows not notes and histories, order by title', () => {
  const rows = [
    // Two notes of the same deck on one row: one word.
    row('chat', [
      importContext(ALPHA, ALPHA_TITLE, 'n1', 'chat'),
      importContext(ALPHA, ALPHA_TITLE, 'n2', 'chat'),
      importContext(BETA, BETA_TITLE, 'n1', 'chat'),
    ]),
    row('chien', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'chien')], true),
    row('loup', [importContext(BETA, BETA_TITLE, 'n1', 'loup')], true),
    row('perso', [aiContext('perso')]),
  ];
  expect(deckSummaries(rows)).toEqual([
    { id: BETA, title: BETA_TITLE, words: 2, withHistory: 1 },
    { id: ALPHA, title: ALPHA_TITLE, words: 2, withHistory: 1 },
  ]);
  expect(deckSummaries([])).toEqual([]);
});

test('My words is the rows saved from reading or an AI lookup; a deck note alone is not', () => {
  expect(inMyWords(row('perso', [aiContext('perso')]))).toBe(true);
  expect(inMyWords(row('test-mots', [readerContext]))).toBe(true);
  expect(inMyWords(row('chat', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'chat')]))).toBe(false);
  expect(inMyWords(testRow())).toBe(false);
});

test('the effective study book is the saved choice when it exists now, otherwise My words', async () => {
  const book = await testBook(1);
  const rows = [row('chat', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'chat')])];
  expect(effectiveStudyBook(MY_WORDS, book, rows)).toBe(MY_WORDS);
  expect(effectiveStudyBook(MY_WORDS, undefined, rows)).toBe(MY_WORDS);
  expect(effectiveStudyBook(BUILTIN_WORDS, book, rows)).toBe(BUILTIN_WORDS);
  expect(effectiveStudyBook(BUILTIN_WORDS, undefined, rows)).toBe(MY_WORDS);
  expect(effectiveStudyBook(deckStudyBook(ALPHA), book, rows)).toBe(deckStudyBook(ALPHA));
  // The deck was deleted, or never existed: the choice falls back to My words.
  expect(effectiveStudyBook(deckStudyBook('deck-gone'), book, rows)).toBe(MY_WORDS);
  expect(effectiveStudyBook('garbage', book, rows)).toBe(MY_WORDS);
  expect(effectiveStudyBook('', book, rows)).toBe(MY_WORDS);
});

test('membership follows each kind, and a word can belong to several wordbooks', async () => {
  const book = await testBook(2);
  const rows = [
    row('perso', [aiContext('perso')]),
    row('test-mots', [readerContext]),
    row('chat', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'chat')]),
    row('chien', [importContext(BETA, BETA_TITLE, 'n1', 'chien')]),
    row('mixte', [aiContext('mixte'), importContext(ALPHA, ALPHA_TITLE, 'n1', 'mixte')]),
  ];
  const joined = new Map(joinVocabulary(rows, book).map((word) => [word.key, word]));
  const member = (key: string, studyBook: string) => inStudyBook(joined.get(key)!, studyBook);
  // A book front belongs to the built-in book, not to My words or a deck.
  expect(member('test-0', BUILTIN_WORDS)).toBe(true);
  expect(member('test-0', MY_WORDS)).toBe(false);
  expect(member('test-0', deckStudyBook(ALPHA))).toBe(false);
  for (const key of ['perso', 'test-mots', 'mixte']) expect(member(key, MY_WORDS)).toBe(true);
  for (const key of ['chat', 'chien']) expect(member(key, MY_WORDS)).toBe(false);
  expect(member('chat', deckStudyBook(ALPHA))).toBe(true);
  expect(member('chat', deckStudyBook(BETA))).toBe(false);
  expect(member('chien', deckStudyBook(BETA))).toBe(true);
  expect(member('chien', deckStudyBook(ALPHA))).toBe(false);
  // The same word in My words and in a deck.
  expect(member('mixte', deckStudyBook(ALPHA))).toBe(true);
  for (const key of ['perso', 'chat', 'mixte']) expect(member(key, BUILTIN_WORDS)).toBe(false);
});

test('the queue selects only the study book, and a deleted or unknown choice falls back to My words', async () => {
  const book = await testBook(2);
  const rows = [
    // Distinct bookmark times so the personal order is the saved order, not the alphabet.
    row('perso', [aiContext('perso')], false, 1),
    row('chat', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'chat')]),
    row('chien', [importContext(BETA, BETA_TITLE, 'n1', 'chien')]),
    row('deux', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'deux'), importContext(BETA, BETA_TITLE, 'n1', 'deux')]),
    row('mixte', [aiContext('mixte'), importContext(ALPHA, ALPHA_TITLE, 'n1', 'mixte')], false, 2),
  ];
  const day = { date: '2026-10-26', introducedKeys: [] };
  const keys = (studyBook: string) =>
    vocabularyQueue(rows, book, day, 20, now, new Set(), studyBook).candidates.map((word) => word.key);
  expect(keys(MY_WORDS)).toEqual(['perso', 'mixte']);
  expect(keys(deckStudyBook(ALPHA))).toEqual(['chat', 'deux', 'mixte']);
  expect(keys(deckStudyBook(BETA))).toEqual(['chien', 'deux']);
  expect(keys(BUILTIN_WORDS)).toEqual(['test-0', 'test-1']);
  // A deck that was deleted, an unknown value and a built-in choice with no book all mean My words.
  expect(keys(deckStudyBook('deck-gone'))).toEqual(['perso', 'mixte']);
  expect(keys('garbage')).toEqual(['perso', 'mixte']);
  expect(vocabularyQueue(rows, undefined, day, 20, now, new Set(), BUILTIN_WORDS).candidates.map((w) => w.key)).toEqual(
    ['perso', 'mixte'],
  );
  // Nothing of the chosen wordbook: the queue is empty, not "everything".
  expect(vocabularyQueue([], book, day, 20, now, new Set(), MY_WORDS).candidates).toEqual([]);
  expect(vocabularyQueue([], book, day, 20, now, new Set(), deckStudyBook(ALPHA)).candidates).toEqual([]);
});

test('a scheduled deck word is queued only while its deck is studied; a book front needs no row', async () => {
  const book = await testBook(1);
  const scheduled = row('chat', [importContext(ALPHA, ALPHA_TITLE, 'n1', 'chat')], true);
  const day = { date: '2026-10-26', introducedKeys: [] };
  const keys = (studyBook: string) =>
    vocabularyQueue([scheduled], book, day, 20, now, new Set(), studyBook).candidates.map((word) => word.key);
  expect(keys(deckStudyBook(ALPHA))).toEqual(['chat']);
  expect(keys(MY_WORDS)).toEqual([]);
  // The built-in book keeps its own front, joined from the catalogue with no learner row.
  expect(keys(BUILTIN_WORDS)).toEqual(['test-0']);
  expect(vocabularyQueue([scheduled], book, day, 20, now, new Set(), BUILTIN_WORDS).candidates[0].row).toBeUndefined();
});
