/** Deck delete on real disposable IndexedDB: what goes, what stays, token invalidation and the study choice. */
import { beforeEach, expect, test } from 'bun:test';
import { failure, freshDb } from './fixtures/storage';
import { testCandidate, testDefinition, testLookup } from './fixtures/vocabulary';
import { testReaderDefinition, testReaderLookup } from './fixtures/vocabularyReader';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';
import { prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import { exportData, importData } from '../src/storage/db';
import {
  deleteVocabularyCard,
  deleteVocabularyDeck,
  getVocabularySnapshot,
  importVocabularyNotes,
  introduceVocabularyCard,
  rateVocabularyCard,
  readVocabulary,
  saveVocabularyBookmark,
  saveVocabularyPreferences,
  StaleVocabularyError,
} from '../src/storage/vocabulary';
import { deckStudyBook } from '../src/services/vocabulary/wordbooks';

const now = new Date(2026, 9, 26, 12).getTime();
const zero = { epoch: 0, resetToken: 0, revision: 0 };
const DECK_A = 'TEST deck A';
const DECK_B = 'TEST deck B';
const columns = { front: 0, back: 1, example: null };
const prepare = (text: string, deck: string) => prepareVocabularyImport(parsePlainText(text), columns, deck, 'en', now);
/** Introduces an already-stored row from itself (no book source) and rates it once. */
async function reviewed(key: string, at = now) {
  const row = (await getVocabularySnapshot(key)).row!;
  const tokens = (await getVocabularySnapshot(key)).tokens;
  const introduced = await introduceVocabularyCard({ key: row.key, word: row.word }, tokens, at);
  return rateVocabularyCard(key, introduced.tokens, `rate-${key}`, 'remembered', at);
}
beforeEach(freshDb);

test('a deck-only row goes with its schedule and history; a row in another deck keeps it all', async () => {
  await importVocabularyNotes(prepare('chat\tcat', DECK_A).notes, now);
  await importVocabularyNotes(prepare('chien\tdog', DECK_A).notes, now);
  await importVocabularyNotes(prepare('chat\tchat', DECK_B).notes, now);
  await reviewed('chat');
  await reviewed('chien');
  await saveVocabularyPreferences({ newPerDay: 20, retentionPercent: 90, studyBook: deckStudyBook(DECK_A) });
  // Tokens read after the rating: their revision still matches, so only a bumped reset token can refuse them.
  const chatTokens = (await getVocabularySnapshot('chat')).tokens;
  const chienTokens = (await getVocabularySnapshot('chien')).tokens;
  const chat = (await getVocabularySnapshot('chat')).row!;
  const chien = (await getVocabularySnapshot('chien')).row!;
  expect(chien.schedule).not.toBeNull();
  expect(chien.history).toHaveLength(1);

  expect(await deleteVocabularyDeck(DECK_A)).toEqual({ deleted: 1, kept: 1 });

  expect((await getVocabularySnapshot('chien')).row).toBeUndefined();
  const kept = (await getVocabularySnapshot('chat')).row!;
  expect(kept.contexts.map((context) => context.source)).toEqual([
    { kind: 'import', id: DECK_B, title: DECK_B, noteId: '1' },
  ]);
  expect(kept.schedule).toEqual(chat.schedule);
  expect(kept.history).toEqual(chat.history);
  expect(kept.bookmarked).toBe(true);
  // Every touched row's reset token moved: an open card on either word is now stale.
  for (const [key, tokens] of [
    ['chat', chatTokens],
    ['chien', chienTokens],
  ] as const) {
    expect((await getVocabularySnapshot(key)).tokens.resetToken).toBe(tokens.resetToken + 1);
    expect(await failure(rateVocabularyCard(key, tokens, `late-${key}`, 'remembered', now + 1))).toBeInstanceOf(
      StaleVocabularyError,
    );
    expect(await failure(deleteVocabularyCard(key, tokens))).toBeInstanceOf(StaleVocabularyError);
  }
  // The deleted deck was the study book, so the choice falls back to My words.
  expect((await readVocabulary(now)).preferences.studyBook).toBe('mine');
});

test('a deck row that also carries an AI or reader context keeps that context, its bookmark and its tokens bumped', async () => {
  await importVocabularyNotes(prepare('chat\tcat\nchien\tdog', DECK_A).notes, now);
  await saveVocabularyBookmark(testLookup('chat'), testDefinition('chat'), undefined, now);
  await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition(), undefined, now);
  await importVocabularyNotes(prepare('test-mots\ttest word', DECK_A).notes, now);
  const before = {
    chat: (await getVocabularySnapshot('chat')).tokens,
    reader: (await getVocabularySnapshot('test-mots')).tokens,
  };

  expect(await deleteVocabularyDeck(DECK_A)).toEqual({ deleted: 1, kept: 2 });

  const chat = (await getVocabularySnapshot('chat')).row!;
  expect(chat.contexts.map((context) => context.definition.kind)).toEqual(['ai']);
  expect(chat.bookmarked).toBe(true);
  const reader = (await getVocabularySnapshot('test-mots')).row!;
  expect(reader.contexts.map((context) => context.definition.kind)).toEqual(['reader']);
  expect((await getVocabularySnapshot('chien')).row).toBeUndefined();
  for (const [key, tokens] of [
    ['chat', before.chat],
    ['test-mots', before.reader],
  ] as const) {
    expect((await getVocabularySnapshot(key)).tokens.resetToken).toBe(tokens.resetToken + 1);
    expect(await failure(rateVocabularyCard(key, tokens, `late-${key}`, 'remembered', now + 1))).toBeInstanceOf(
      StaleVocabularyError,
    );
  }
});

test('a built-in word whose only context was the deck stays, unbookmarked, with its progress', async () => {
  const candidate = testCandidate('test-0');
  const introduced = await introduceVocabularyCard(candidate, zero, now);
  const rated = await rateVocabularyCard(candidate.key, introduced.tokens, 'book-front', 'remembered', now);
  await importVocabularyNotes(prepare('test-0\tTEST back', DECK_A).notes, now);
  const tokens = (await getVocabularySnapshot(candidate.key)).tokens;
  expect((await getVocabularySnapshot(candidate.key)).row!.bookmarked).toBe(true);

  expect(await deleteVocabularyDeck(DECK_A)).toEqual({ deleted: 0, kept: 1 });

  const kept = (await getVocabularySnapshot(candidate.key)).row!;
  expect(kept.contexts).toEqual([]);
  expect(kept.bookSource).toEqual(candidate.bookSource!);
  expect(kept.bookmarked).toBe(false);
  expect(kept.bookmarkedAt).toBeNull();
  expect(kept.schedule).toEqual(rated.row.schedule);
  expect(kept.history).toEqual(rated.row.history);
  expect(await failure(rateVocabularyCard(candidate.key, tokens, 'late-book', 'fuzzy', now + 1))).toBeInstanceOf(
    StaleVocabularyError,
  );
});

test('only a study choice naming the deleted deck resets, and an unknown deck changes nothing', async () => {
  await importVocabularyNotes(prepare('chat\tcat', DECK_A).notes, now);
  await importVocabularyNotes(prepare('chien\tdog', DECK_B).notes, now);
  await saveVocabularyPreferences({ newPerDay: 20, retentionPercent: 90, studyBook: deckStudyBook(DECK_B) });

  expect(await deleteVocabularyDeck('TEST deck unknown')).toEqual({ deleted: 0, kept: 0 });
  expect((await readVocabulary(now)).preferences.studyBook).toBe(deckStudyBook(DECK_B));
  expect((await getVocabularySnapshot('chat')).row).toBeDefined();

  await deleteVocabularyDeck(DECK_A);
  // The choice names another deck, so it is untouched even though deck A is gone.
  expect((await readVocabulary(now)).preferences.studyBook).toBe(deckStudyBook(DECK_B));
  expect((await readVocabulary(now)).preferences).toEqual({
    newPerDay: 20,
    retentionPercent: 90,
    studyBook: deckStudyBook(DECK_B),
  });

  await deleteVocabularyDeck(DECK_B);
  expect((await readVocabulary(now)).preferences.studyBook).toBe('mine');
});

test('a backup keeps the study choice through export and restore', async () => {
  await saveVocabularyPreferences({ newPerDay: 5, retentionPercent: 85, studyBook: deckStudyBook(DECK_A) });
  const backup = await exportData();
  expect(backup.vocabularyMeta.preferences).toEqual({
    newPerDay: 5,
    retentionPercent: 85,
    studyBook: deckStudyBook(DECK_A),
  });
  await saveVocabularyPreferences({ newPerDay: 20, retentionPercent: 90, studyBook: 'builtin' });
  expect((await readVocabulary(now)).preferences.studyBook).toBe('builtin');
  await importData(backup);
  expect((await readVocabulary(now)).preferences).toEqual(backup.vocabularyMeta.preferences);
  expect((await exportData()).vocabularyMeta).toEqual(backup.vocabularyMeta);
});
