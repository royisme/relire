/** Row-owned vocabulary transactions, invalidation tokens and durable-first change notifications. */
import type { IDBPTransaction } from 'idb';
import { TokenBindingSchema } from '../types/gradedReader';
import { readerWords } from '../utils/readerTokens';
import {
  VocabularyRowSchema,
  VocabularyDefinitionSchema,
  VocabularyContextSchema,
  type VocabularyDefinition,
  VocabularyPreferencesSchema,
  VocabularyDaySchema,
  type VocabularyRow,
  type VocabularyCandidate,
  type VocabularyTokens,
  type VocabularyOutcome,
  type VocabularyPreferences,
  DEFAULT_VOCABULARY_PREFERENCES,
} from '../types/vocabulary';
import {
  vocabularyContextKey,
  vocabularyId,
  vocabularyKey,
  type VocabularyLookup,
} from '../services/vocabulary/identity';
import { deckStudyBook } from '../services/vocabulary/wordbooks';
import { formatDate, initialVocabularySchedule, nextVocabularySchedule } from '../utils/srs';
import { db, type RelireDB } from './db';
import type { ImportedNote } from '../services/vocabulary/import/prepare';

const listeners = new Set<() => void | Promise<void>>();
export const subscribeVocabulary = (listener: () => void | Promise<void>) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export async function vocabularyChanged() {
  await Promise.allSettled([...listeners].map(async (listener) => listener()));
}
export class StaleVocabularyError extends Error {
  constructor() {
    super('Vocabulary changed; reload the card');
  }
}
export class VocabularyQuotaError extends Error {
  constructor() {
    super('Daily introduction allowance reached');
  }
}
type Transaction = IDBPTransaction<RelireDB, ['vocab', 'meta'], 'readwrite'>;
async function write<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = (await db()).transaction(['vocab', 'meta'], 'readwrite');
  let result: T;
  try {
    result = await action(tx);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already aborted. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
  await tx.done;
  await vocabularyChanged();
  return result;
}
const tokenKey = (key: string) => `vocabularyReset:${key}`;
async function tokens(tx: Transaction, key: string, revision: number): Promise<VocabularyTokens> {
  const meta = tx.objectStore('meta');
  return {
    epoch: ((await meta.get('vocabularyEpoch')) as number | undefined) ?? 0,
    resetToken: ((await meta.get(tokenKey(key))) as number | undefined) ?? 0,
    revision,
  };
}
async function guard(tx: Transaction, key: string, expected: VocabularyTokens) {
  const actual = await tokens(tx, key, expected.revision);
  if (actual.epoch !== expected.epoch || actual.resetToken !== expected.resetToken) throw new StaleVocabularyError();
}
function materialize(candidate: VocabularyCandidate, now: number): VocabularyRow {
  return {
    key: candidate.key,
    word: candidate.word,
    ...(candidate.bookSource ? { bookSource: candidate.bookSource } : {}),
    id: vocabularyId(candidate.key),
    createdAt: now,
    bookmarked: false,
    bookmarkedAt: null,
    contexts: [],
    schedule: null,
    introducedAt: null,
    revision: 0,
    history: [],
  };
}
function attach(row: VocabularyRow, candidate: VocabularyCandidate): VocabularyRow {
  return row.bookSource || !candidate.bookSource ? row : { ...row, bookSource: candidate.bookSource };
}
export async function readVocabulary(now: number) {
  const tx = (await db()).transaction(['vocab', 'meta']);
  const date = formatDate(new Date(now));
  const [rows, preferences, day, epoch] = await Promise.all([
    tx.objectStore('vocab').getAll(),
    tx.objectStore('meta').get('vocabularyPreferences'),
    tx.objectStore('meta').get(`vocabularyDay:${date}`),
    tx.objectStore('meta').get('vocabularyEpoch'),
  ]);
  await tx.done;
  return {
    rows: rows.map((row) => VocabularyRowSchema.parse(row)),
    preferences: VocabularyPreferencesSchema.parse(preferences ?? DEFAULT_VOCABULARY_PREFERENCES),
    day: VocabularyDaySchema.parse(day ?? { date, introducedKeys: [] }),
    epoch: (epoch as number | undefined) ?? 0,
    now,
  };
}
export async function getVocabularySnapshot(key: string) {
  const tx = (await db()).transaction(['vocab', 'meta']);
  const row = await tx.objectStore('vocab').get(vocabularyId(key));
  const epoch = ((await tx.objectStore('meta').get('vocabularyEpoch')) as number | undefined) ?? 0;
  const resetToken = ((await tx.objectStore('meta').get(tokenKey(key))) as number | undefined) ?? 0;
  await tx.done;
  return {
    row: row ? VocabularyRowSchema.parse(row) : undefined,
    tokens: { epoch, resetToken, revision: row?.revision ?? 0 },
  };
}
export async function saveVocabularyPreferences(input: VocabularyPreferences) {
  const preferences = VocabularyPreferencesSchema.parse(input);
  await write(async (tx) => {
    await tx.objectStore('meta').put(preferences, 'vocabularyPreferences');
  });
}
export async function saveVocabularyBookmark(
  lookup: VocabularyLookup,
  input: VocabularyDefinition,
  bookSource?: VocabularyCandidate['bookSource'],
  now = Date.now(),
) {
  const key = vocabularyKey(lookup.word);
  const definition = VocabularyDefinitionSchema.parse(input);
  if (definition.kind === 'ai') {
    if (vocabularyKey(definition.analysis.word) !== key)
      throw new Error(`Analysis word mismatch: ${definition.analysis.word} / ${lookup.word}`);
  }
  if (definition.kind === 'reader') {
    const binding = TokenBindingSchema.safeParse(lookup.binding);
    const token = binding.success ? readerWords(lookup.sentence)[binding.data.ordinal] : undefined;
    const bound =
      binding.success &&
      binding.data.entryIds.includes(definition.entry.id) &&
      token &&
      [token.text, token.lookup, token.prefix].some((part) => vocabularyKey(part) === key);
    if (!definition.entry.forms.some((form) => vocabularyKey(form) === key) && !bound)
      throw new Error(`Reader entry does not cover clicked form: ${lookup.word}`);
  }
  const context = VocabularyContextSchema.parse({
    id: vocabularyContextKey(lookup),
    sentence: lookup.sentence,
    savedAt: now,
    requestLanguage: lookup.requestLanguage,
    ...(lookup.source ? { source: lookup.source } : {}),
    definition,
  });
  return write(async (tx) => {
    const store = tx.objectStore('vocab');
    const candidate = {
      key,
      word: lookup.word.normalize('NFC').replace(/'/g, '’'),
      ...(bookSource ? { bookSource } : {}),
    };
    let row = attach((await store.get(vocabularyId(key))) ?? materialize(candidate, now), candidate);
    const id = context.id;
    row = {
      ...row,
      bookmarked: true,
      bookmarkedAt: row.bookmarkedAt ?? now,
      contexts: row.contexts.some((context) => context.id === id) ? row.contexts : [...row.contexts, context],
    };
    await store.put(VocabularyRowSchema.parse(row));
    return row;
  });
}
/** One atomic batch. Import adds content/bookmarks, never introductions, schedule resets or review observations. */
export async function importVocabularyNotes(notes: readonly ImportedNote[], now: number) {
  return write(async (tx) => {
    const store = tx.objectStore('vocab');
    const existing = await store.getAll();
    const rows = new Map(existing.map((row) => [row.key, VocabularyRowSchema.parse(row)]));
    const firstBookmark = existing.reduce((time, row) => Math.max(time, (row.bookmarkedAt ?? -1) + 1), now);
    let imported = 0;
    let merged = 0;
    for (const [index, note] of notes.entries()) {
      const key = vocabularyKey(note.word);
      const prior = rows.get(key);
      if (prior) merged += 1;
      if (!prior) imported += 1;
      const row = prior ?? materialize({ key, word: note.word }, now);
      const contexts = row.contexts.some((context) => context.id === note.context.id)
        ? row.contexts.map((context) => (context.id === note.context.id ? note.context : context))
        : [...row.contexts, note.context];
      const updated = VocabularyRowSchema.parse({
        ...row,
        bookmarked: true,
        bookmarkedAt: row.bookmarkedAt ?? firstBookmark + index,
        contexts,
      });
      rows.set(key, updated);
      await store.put(updated);
    }
    return { imported, merged };
  });
}
export async function removeVocabularyBookmark(key: string) {
  await write(async (tx) => {
    const store = tx.objectStore('vocab');
    const row = await store.get(vocabularyId(key));
    if (row) await store.put({ ...row, bookmarked: false, bookmarkedAt: null });
  });
}
export async function introduceVocabularyCard(candidate: VocabularyCandidate, expected: VocabularyTokens, now: number) {
  return write(async (tx) => {
    await guard(tx, candidate.key, expected);
    const store = tx.objectStore('vocab');
    let row = await store.get(vocabularyId(candidate.key));
    if (row?.revision !== undefined && row.revision !== expected.revision) throw new StaleVocabularyError();
    const introduced = !row?.schedule;
    if (!row?.schedule) {
      const date = formatDate(new Date(now));
      const meta = tx.objectStore('meta');
      const preferences = VocabularyPreferencesSchema.parse(
        (await meta.get('vocabularyPreferences')) ?? DEFAULT_VOCABULARY_PREFERENCES,
      );
      const day = VocabularyDaySchema.parse((await meta.get(`vocabularyDay:${date}`)) ?? { date, introducedKeys: [] });
      if (!day.introducedKeys.includes(candidate.key)) {
        if (day.introducedKeys.length >= preferences.newPerDay) throw new VocabularyQuotaError();
        day.introducedKeys.push(candidate.key);
        await meta.put(day, `vocabularyDay:${date}`);
      }
      row = { ...(row ?? materialize(candidate, now)), schedule: initialVocabularySchedule(now), introducedAt: now };
    }
    row = attach(row, candidate);
    await store.put(VocabularyRowSchema.parse(row));
    return { row, tokens: await tokens(tx, row.key, row.revision), introduced };
  });
}
export async function rateVocabularyCard(
  key: string,
  expected: VocabularyTokens,
  operationId: string,
  outcome: VocabularyOutcome,
  reviewedAt: number,
) {
  return write(async (tx) => {
    await guard(tx, key, expected);
    const store = tx.objectStore('vocab');
    const stored = await store.get(vocabularyId(key));
    if (!stored?.schedule) throw new StaleVocabularyError();
    const row = VocabularyRowSchema.parse(stored);
    const priorOperation = row.history.find((record) => record.operationId === operationId);
    if (priorOperation) {
      if (priorOperation.outcome !== outcome || priorOperation.reviewedAt !== reviewedAt)
        throw new Error('Review operation cannot change its outcome or observation time');
      return { row, tokens: await tokens(tx, key, row.revision) };
    }
    if (row.revision !== expected.revision) throw new StaleVocabularyError();
    const preferences = VocabularyPreferencesSchema.parse(
      (await tx.objectStore('meta').get('vocabularyPreferences')) ?? DEFAULT_VOCABULARY_PREFERENCES,
    );
    const next = nextVocabularySchedule(row.schedule!, outcome, reviewedAt, preferences);
    const revision = row.revision + 1;
    const updated = {
      ...row,
      schedule: next,
      revision,
      history: [
        ...row.history,
        {
          operationId,
          reviewedAt,
          outcome,
          retentionPercent: preferences.retentionPercent,
          prior: row.schedule!,
          next,
          revision,
        },
      ],
    };
    await store.put(VocabularyRowSchema.parse(updated));
    return { row: updated, tokens: await tokens(tx, key, revision) };
  });
}
export async function resetVocabularySchedule(key: string, expected: VocabularyTokens, now: number) {
  await write(async (tx) => {
    await guard(tx, key, expected);
    const store = tx.objectStore('vocab');
    const row = await store.get(vocabularyId(key));
    if (!row?.schedule || row.revision !== expected.revision) throw new StaleVocabularyError();
    await store.put(
      VocabularyRowSchema.parse({
        ...row,
        schedule: initialVocabularySchedule(now),
        revision: row.revision + 1,
      }),
    );
    await tx.objectStore('meta').put(expected.resetToken + 1, tokenKey(key));
  });
}
export async function deleteVocabularyCard(key: string, expected: VocabularyTokens) {
  await write(async (tx) => {
    await guard(tx, key, expected);
    const store = tx.objectStore('vocab');
    const row = await store.get(vocabularyId(key));
    if (!row || row.revision !== expected.revision) throw new StaleVocabularyError();
    await store.delete(row.id);
    await tx.objectStore('meta').put(expected.resetToken + 1, tokenKey(key));
  });
}
/**
 * One transaction per deck delete: each row loses this deck's import contexts; a row with no content left
 * (no contexts, no bookSource) is deleted with its schedule and history, a row that lives in another wordbook
 * keeps everything. Every touched row's reset token is bumped, so an open review on it fails safely. When
 * the deck was the study book, the choice falls back to My words in the same transaction.
 */
export async function deleteVocabularyDeck(deckId: string) {
  return write(async (tx) => {
    const store = tx.objectStore('vocab');
    const meta = tx.objectStore('meta');
    let deleted = 0;
    let kept = 0;
    for (const stored of await store.getAll()) {
      const row = VocabularyRowSchema.parse(stored);
      const inDeck = (context: VocabularyRow['contexts'][number]) =>
        context.source?.kind === 'import' && context.source.id === deckId;
      if (!row.contexts.some(inDeck)) continue;
      const contexts = row.contexts.filter((context) => !inDeck(context));
      await meta.put((((await meta.get(tokenKey(row.key))) as number | undefined) ?? 0) + 1, tokenKey(row.key));
      if (!contexts.length && !row.bookSource) {
        await store.delete(row.id);
        deleted += 1;
      } else {
        await store.put(
          VocabularyRowSchema.parse({
            ...row,
            contexts,
            // The import bookmarked the word; with no context left, the bookmark goes with it.
            ...(contexts.length ? {} : { bookmarked: false, bookmarkedAt: null }),
          }),
        );
        kept += 1;
      }
    }
    const preferences = VocabularyPreferencesSchema.parse(
      (await meta.get('vocabularyPreferences')) ?? DEFAULT_VOCABULARY_PREFERENCES,
    );
    if (preferences.studyBook === deckStudyBook(deckId))
      await meta.put(VocabularyPreferencesSchema.parse({ ...preferences, studyBook: 'mine' }), 'vocabularyPreferences');
    return { deleted, kept };
  });
}
