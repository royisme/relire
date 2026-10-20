/** Row-owned vocabulary transactions, invalidation tokens and durable-first change notifications. */
import type { IDBPTransaction } from 'idb';
import type { WordAnalysis } from '../types';
import {
  VocabularyRowSchema,
  VocabularyPreferencesSchema,
  VocabularyDaySchema,
  type VocabularyRow,
  type VocabularyCandidate,
  type VocabularyTokens,
  type VocabularyRating,
} from '../types/vocabulary';
import {
  vocabularyContextKey,
  vocabularyId,
  vocabularyKey,
  type VocabularyLookup,
} from '../services/vocabulary/identity';
import { formatDate, initialVocabularySchedule, nextVocabularySchedule } from '../utils/srs';
import { db, type RelireDB } from './db';

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
    preferences: VocabularyPreferencesSchema.parse(preferences ?? { newPerDay: 20 }),
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
export async function saveVocabularyPreferences(newPerDay: number) {
  const preferences = VocabularyPreferencesSchema.parse({ newPerDay });
  await write(async (tx) => {
    await tx.objectStore('meta').put(preferences, 'vocabularyPreferences');
  });
}
export async function saveVocabularyBookmark(
  lookup: VocabularyLookup,
  analysis: WordAnalysis,
  bookSource?: VocabularyCandidate['bookSource'],
  now = Date.now(),
) {
  const key = vocabularyKey(lookup.word);
  if (vocabularyKey(analysis.word) !== key)
    throw new Error(`Analysis word mismatch: ${analysis.word} / ${lookup.word}`);
  return write(async (tx) => {
    const store = tx.objectStore('vocab');
    const candidate = {
      key,
      word: lookup.word.normalize('NFC').replace(/'/g, '’'),
      ...(bookSource ? { bookSource } : {}),
    };
    let row = attach((await store.get(vocabularyId(key))) ?? materialize(candidate, now), candidate);
    const id = vocabularyContextKey(lookup);
    row = {
      ...row,
      bookmarked: true,
      bookmarkedAt: row.bookmarkedAt ?? now,
      contexts: row.contexts.some((context) => context.id === id)
        ? row.contexts
        : [
            ...row.contexts,
            {
              id,
              sentence: lookup.sentence,
              savedAt: now,
              requestLanguage: lookup.requestLanguage,
              ...(lookup.source ? { source: lookup.source } : {}),
              analysis,
            },
          ],
    };
    await store.put(VocabularyRowSchema.parse(row));
    return row;
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
        (await meta.get('vocabularyPreferences')) ?? { newPerDay: 20 },
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
  rating: VocabularyRating,
  now: number,
) {
  return write(async (tx) => {
    await guard(tx, key, expected);
    const store = tx.objectStore('vocab');
    const row = await store.get(vocabularyId(key));
    if (!row?.schedule) throw new StaleVocabularyError();
    const priorOperation = row.history.find((record) => record.operationId === operationId);
    if (priorOperation) {
      if (priorOperation.rating !== rating) throw new Error('Rating operation cannot change its rating');
      return { row, tokens: await tokens(tx, key, row.revision) };
    }
    if (row.revision !== expected.revision) throw new StaleVocabularyError();
    const next = nextVocabularySchedule(row.schedule, rating, now);
    const revision = row.revision + 1;
    const updated = {
      ...row,
      schedule: next,
      revision,
      history: [...row.history, { operationId, timestamp: now, rating, prior: row.schedule, next, revision }],
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
    await store.put({ ...row, schedule: initialVocabularySchedule(now), revision: row.revision + 1 });
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
