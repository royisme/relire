/** Operator-only fresh-start tests on invented opaque trial progress; never an owner profile or backup file. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure, putArticle, seedUnit } from './fixtures/storage';
import { testAnalysis, testLookup, testCandidate } from './fixtures/vocabulary';
import { db, exportData } from '../src/storage/db';
import {
  freshStartVocabularyProgress,
  saveVocabularyBookmark,
  introduceVocabularyCard,
  getVocabularySnapshot,
  StaleVocabularyError,
} from '../src/storage/vocabulary';
import type { VocabularyRow } from '../src/types/vocabulary';
const now = new Date('2026-10-21T12:00:00Z').getTime();
beforeEach(freshDb);
async function trial() {
  await putArticle();
  await seedUnit();
  const lookup = {
    ...testLookup('école'),
    sentence: 'TEST e\u0301cole <literal> **source**',
    source: { kind: 'unit' as const, id: 'test-source', title: 'TEST e\u0301cole <title>' },
  };
  await saveVocabularyBookmark(lookup, testAnalysis('école'), testCandidate('école').bookSource, now - 2);
  const row = await saveVocabularyBookmark(
    { ...lookup, requestLanguage: 'zh' },
    testAnalysis('école'),
    undefined,
    now - 1,
  );
  const raw = {
    ...row,
    schedule: { opaqueTrialSchedule: 'not a new-model observation' },
    introducedAt: now - 100,
    revision: 27,
    history: [{ opaqueTrialHistory: 'never decoded' }],
  };
  const d = await db();
  await d.put('vocab', raw as unknown as VocabularyRow);
  await d.put('meta', { newPerDay: 0 }, 'vocabularyPreferences');
  await d.put('meta', { date: '2026-10-21', introducedKeys: [row.key, 'deleted-test'] }, 'vocabularyDay:2026-10-21');
  await d.put('meta', 7, 'vocabularyEpoch');
  await d.put('meta', 12, 'vocabularyReset:école');
  await d.put('meta', 42, 'vocabularyReset:deleted-test');
  await d.put('meta', 9, 'exerciseReset:deleted-test');
  await d.put('meta', { retained: true }, 'topicReset:TEST');
  await d.put('meta', { sentencesAnalyzed: 3 }, 'stats');
  await d.put('cache', {
    key: 'content:TEST',
    kind: 'content',
    value: 'invented disposable TEST content',
    createdAt: 1,
  });
  await d.put('audio', {
    key: 'TEST',
    text: 'TEST',
    provider: 'TEST',
    voice: 'TEST',
    model: 'TEST',
    blob: new Blob(['TEST']),
    bytes: 4,
    lastUsed: 1,
  });
  // A synthetic full-file envelope; confirmation is exercised as a precondition, never claimed as a real download.
  return {
    preSwitchBackup: {
      version: '1.1',
      articles: await d.getAll('articles'),
      vocab: [raw],
      vocabularyMeta: {
        preferences: { newPerDay: 0 },
        days: [{ date: '2026-10-21', introducedKeys: [row.key, 'deleted-test'] }],
      },
      units: await d.getAll('units'),
      itemStates: [],
      attempts: [],
    },
    expectedEpoch: 7,
    backupCompletedAndConfirmed: true as const,
  };
}
async function snapshot() {
  const d = await db();
  const tx = d.transaction(Array.from(d.objectStoreNames));
  const result: Record<string, unknown> = {};
  for (const name of d.objectStoreNames) result[name] = await tx.objectStore(name).getAll();
  result.metaKeys = await tx.objectStore('meta').getAllKeys();
  await tx.done;
  return result;
}
test('fresh start preserves every actual content field exactly, daily-new zero, tokens and unrelated stores/namespaces', async () => {
  const input = await trial();
  const copy = structuredClone(input);
  const before = await snapshot();
  const result = await freshStartVocabularyProgress(input, now);
  expect(result).toEqual({ epoch: 8, rows: 1, preferences: { newPerDay: 0, retentionPercent: 90 } });
  expect(input).toEqual(copy);
  const backup = await exportData();
  const original = input.preSwitchBackup.vocab[0];
  expect(backup.vocab[0]).toEqual({
    id: original.id,
    key: original.key,
    word: original.word,
    createdAt: original.createdAt,
    bookSource: original.bookSource,
    bookmarked: original.bookmarked,
    bookmarkedAt: original.bookmarkedAt,
    contexts: original.contexts,
    schedule: null,
    introducedAt: null,
    revision: 0,
    memoryResetRevision: 0,
    history: [],
  });
  expect(backup.vocabularyMeta).toEqual({
    schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
    preferences: { newPerDay: 0, retentionPercent: 90 },
    days: [],
  });
  const after = await snapshot();
  for (const name of Object.keys(before).filter((name) => !['meta', 'metaKeys', 'vocab'].includes(name)))
    expect(after[name]).toEqual(before[name]);
  const d = await db();
  for (const key of [
    'vocabularyReset:école',
    'vocabularyReset:deleted-test',
    'exerciseReset:deleted-test',
    'topicReset:TEST',
    'stats',
    'started',
  ])
    expect(await d.get('meta', key)).toEqual((before.meta as unknown[])[(before.metaKeys as string[]).indexOf(key)]);
  expect((await getVocabularySnapshot(original.key)).tokens).toEqual({ epoch: 8, resetToken: 12, revision: 0 });
  expect(
    await failure(
      introduceVocabularyCard(
        { key: original.key, word: original.word },
        { epoch: 7, resetToken: 12, revision: 27 },
        now,
      ),
    ),
  ).toBeInstanceOf(StaleVocabularyError);
  const stable = await snapshot();
  expect(await failure(freshStartVocabularyProgress(input, now))).toBeInstanceOf(StaleVocabularyError);
  expect(await snapshot()).toEqual(stable);
});
for (const change of ['content', 'progress', 'new-row', 'delete-row', 'preferences', 'day', 'epoch'] as const) {
  test(`a snapshot receipt cannot erase changed ${change}`, async () => {
    const input = await trial(),
      d = await db();
    const row = input.preSwitchBackup.vocab[0];
    if (change === 'content') await d.put('vocab', { ...row, bookmarkedAt: now + 1 } as unknown as VocabularyRow);
    if (change === 'progress') await d.put('vocab', { ...row, revision: 28 } as unknown as VocabularyRow);
    if (change === 'new-row') await saveVocabularyBookmark(testLookup('test-other'), testAnalysis('test-other'));
    if (change === 'delete-row') await d.delete('vocab', row.id);
    if (change === 'preferences') await d.put('meta', { newPerDay: 1 }, 'vocabularyPreferences');
    if (change === 'day')
      await d.put('meta', { date: '2026-10-21', introducedKeys: ['changed-test'] }, 'vocabularyDay:2026-10-21');
    if (change === 'epoch') await d.put('meta', 8, 'vocabularyEpoch');
    const before = await snapshot();
    expect(await failure(freshStartVocabularyProgress(input, now))).toBeInstanceOf(StaleVocabularyError);
    expect(await snapshot()).toEqual(before);
  });
}
test('an old receipt also rejects after new FSRS learning, even if a caller supplies the fresh epoch', async () => {
  const input = await trial();
  await freshStartVocabularyProgress(input, now);
  const d = await db();
  await d.put('meta', { newPerDay: 20, retentionPercent: 90 }, 'vocabularyPreferences');
  const row = input.preSwitchBackup.vocab[0];
  await introduceVocabularyCard({ key: row.key, word: row.word }, (await getVocabularySnapshot(row.key)).tokens, now);
  const before = await snapshot();
  expect(await failure(freshStartVocabularyProgress({ ...input, expectedEpoch: 8 }, now))).toBeInstanceOf(
    StaleVocabularyError,
  );
  expect(await snapshot()).toEqual(before);
});
test('content validation and explicit completed-backup confirmation fail before writes, without decoding trial observations', async () => {
  const input = await trial(),
    before = await snapshot();
  for (const patch of [{ word: 'wrong-key' }, { contexts: null }, { bookmarkedAt: null }, { createdAt: NaN }]) {
    const preSwitchBackup = { ...input.preSwitchBackup, vocab: [{ ...input.preSwitchBackup.vocab[0], ...patch }] };
    expect(await failure(freshStartVocabularyProgress({ ...input, preSwitchBackup }, now))).toBeInstanceOf(Error);
  }
  expect(
    await failure(freshStartVocabularyProgress({ ...input, backupCompletedAndConfirmed: false as true }, now)),
  ).toBeInstanceOf(Error);
  expect(await snapshot()).toEqual(before);
});
for (const abortAt of ['vocab', 'meta'] as const) {
  test(`native abort at ${abortAt} leaves all rows, quota, preferences and epoch unchanged`, async () => {
    const input = await trial(),
      before = await snapshot();
    // oxlint-disable-next-line typescript/unbound-method -- Native method is called with its receiver and restored.
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = put.call(this, value, key);
      if (this.name === abortAt) request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
    try {
      expect(await failure(freshStartVocabularyProgress(input, now))).toBeInstanceOf(Error);
      expect(await snapshot()).toEqual(before);
    } finally {
      IDBObjectStore.prototype.put = put;
    }
  });
}
