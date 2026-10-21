/** Row-owned vocabulary transactions, invalidation tokens and durable-first change notifications. */
import type { IDBPTransaction } from 'idb';
import { z } from 'zod';
import type { WordAnalysis } from '../types';
import {
  VocabularyRowSchema,
  VocabularyPreferencesSchema,
  VocabularyDaySchema,
  type VocabularyRow,
  type VocabularyCandidate,
  type VocabularyTokens,
  type VocabularyOutcome,
  type VocabularyPreferences,
  DEFAULT_VOCABULARY_PREFERENCES,
  VOCABULARY_SCHEDULER_POLICY,
} from '../types/vocabulary';
import {
  vocabularyContextKey,
  vocabularyId,
  vocabularyKey,
  type VocabularyLookup,
} from '../services/vocabulary/identity';
import { formatDate, initialVocabularySchedule, nextVocabularySchedule } from '../utils/srs';
import { canonicalVocabularyJson } from '../services/vocabulary/book';
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
    memoryResetRevision: 0,
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
          schedulerPolicy: VOCABULARY_SCHEDULER_POLICY,
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
        memoryResetRevision: row.revision + 1,
      }),
    );
    await tx.objectStore('meta').put(expected.resetToken + 1, tokenKey(key));
  });
}
/** Operator-only domain fresh start. A file download and human confirmation are external preconditions, not proven here. */
export async function freshStartVocabularyProgress(
  input: {
    preSwitchBackup: { vocab: unknown; vocabularyMeta: unknown };
    expectedEpoch: number;
    backupCompletedAndConfirmed: true;
  },
  now: number,
) {
  if (input.backupCompletedAndConfirmed !== true) throw new Error('Complete and confirm the full backup first');
  const expectedEpoch = z.number().int().nonnegative().parse(input.expectedEpoch);
  const rawRows = z.array(z.record(z.string(), z.unknown())).parse(input.preSwitchBackup.vocab);
  // Project content explicitly; historical schedule/history are compared opaquely, never decoded or replayed.
  const rows = rawRows.map((row) =>
    VocabularyRowSchema.parse({
      id: row.id,
      key: row.key,
      word: row.word,
      createdAt: row.createdAt,
      ...(row.bookSource === undefined ? {} : { bookSource: row.bookSource }),
      bookmarked: row.bookmarked,
      bookmarkedAt: row.bookmarkedAt,
      contexts: row.contexts,
      schedule: null,
      introducedAt: null,
      revision: 0,
      memoryResetRevision: 0,
      history: [],
    }),
  );
  if (new Set(rows.map((row) => row.key)).size !== rows.length) throw new Error('Duplicate vocabulary key');
  const metadata = z
    .object({
      preferences: z.object({ newPerDay: z.number().int().min(0).max(100) }).passthrough(),
      days: z.array(VocabularyDaySchema),
    })
    .parse(input.preSwitchBackup.vocabularyMeta);
  if (new Set(metadata.days.map((day) => day.date)).size !== metadata.days.length)
    throw new Error('Duplicate vocabulary day');
  // Canonical comparisons are synchronous inside the transaction; no crypto, file or network awaits.
  const orderedRows = (values: Record<string, unknown>[]) =>
    [...values].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const expectedRows = canonicalVocabularyJson(orderedRows(rawRows));
  const expectedPreferences = canonicalVocabularyJson(metadata.preferences);
  const expectedDays = canonicalVocabularyJson([...metadata.days].sort((a, b) => a.date.localeCompare(b.date)));
  const preferences = VocabularyPreferencesSchema.parse({
    newPerDay: metadata.preferences.newPerDay,
    retentionPercent: 90,
  });
  // Validate the activation instant even though new rows remain unintroduced and have no due instant yet.
  initialVocabularySchedule(now);
  return write(async (tx) => {
    const store = tx.objectStore('vocab'),
      meta = tx.objectStore('meta');
    const epoch = ((await meta.get('vocabularyEpoch')) as number | undefined) ?? 0;
    const actualRows = await store.getAll();
    const actualPreferences = await meta.get('vocabularyPreferences');
    const dayKeys = (await meta.getAllKeys()).filter((key) => key.startsWith('vocabularyDay:')).sort();
    const days = [];
    for (const key of dayKeys) {
      const day = VocabularyDaySchema.parse(await meta.get(key));
      if (key !== `vocabularyDay:${day.date}`) throw new Error('Vocabulary day key mismatch');
      days.push(day);
    }
    // No preference row means the pre-switch export's documented effective daily-new default.
    if (
      epoch !== expectedEpoch ||
      canonicalVocabularyJson(orderedRows(actualRows)) !== expectedRows ||
      canonicalVocabularyJson(actualPreferences ?? { newPerDay: 20 }) !== expectedPreferences ||
      canonicalVocabularyJson(days) !== expectedDays
    )
      throw new StaleVocabularyError();
    for (const row of rows) await store.put(row);
    for (const key of dayKeys) await meta.delete(key);
    await meta.put(preferences, 'vocabularyPreferences');
    await meta.put(epoch + 1, 'vocabularyEpoch');
    return { epoch: epoch + 1, rows: rows.length, preferences };
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
