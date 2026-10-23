/** Canonical identity and durable row transactions using only disposable fake IndexedDB. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { testAnalysis, testDefinition, testCandidate, testLookup } from './fixtures/vocabulary';
import { vocabularyContextKey, vocabularyKey } from '../src/services/vocabulary/identity';
import { db, exportData, importData } from '../src/storage/db';
import { initialVocabularySchedule, VocabularyClockError } from '../src/utils/srs';
import {
  saveVocabularyBookmark,
  removeVocabularyBookmark,
  introduceVocabularyCard,
  rateVocabularyCard,
  getVocabularySnapshot,
  readVocabulary,
  saveVocabularyPreferences,
  resetVocabularySchedule,
  deleteVocabularyCard,
  StaleVocabularyError,
  VocabularyQuotaError,
  subscribeVocabulary,
} from '../src/storage/vocabulary';
const now = new Date(2026, 9, 20, 12).getTime();
const zero = { epoch: 0, resetToken: 0, revision: 0 };
beforeEach(freshDb);
test('canonical spelling folds NFC, whitespace, French case and apostrophe, not accents, hyphens or word order', () => {
  expect(vocabularyKey(" \u2003L'E\u0301COLE\u00a0 BLEUE ")).toBe('l’école bleue');
  expect(vocabularyKey('cote')).not.toBe(vocabularyKey('côte'));
  expect(vocabularyKey('test-mot')).not.toBe(vocabularyKey('test mot'));
  expect(vocabularyKey('mot test')).not.toBe(vocabularyKey('test mot'));
});
test('frozen source/text/language context identity ignores title, analysis and timestamp', async () => {
  const lookup = { ...testLookup(), source: { kind: 'unit' as const, id: 'unit-test', title: 'TEST title' } };
  const first = await saveVocabularyBookmark(
    lookup,
    { kind: 'ai', analysis: { ...testAnalysis(), cefrLevel: 'C2' } },
    undefined,
    now,
  );
  expect(first.contexts[0].definition).toMatchObject({ kind: 'ai', analysis: { cefrLevel: 'C2' } });
  const again = await saveVocabularyBookmark(
    { ...lookup, sentence: `  ${lookup.sentence}  `, source: { ...lookup.source, title: 'Changed title' } },
    { kind: 'ai', analysis: { ...testAnalysis(), translation: 'changed' } },
    undefined,
    now + 1,
  );
  expect(again.contexts).toEqual(first.contexts);
  const next = await saveVocabularyBookmark({ ...lookup, requestLanguage: 'zh' }, testDefinition(), undefined, now + 2);
  expect(next.contexts).toHaveLength(2);
  expect(next.bookmarkedAt).toBe(now);
  await removeVocabularyBookmark(next.key);
  const unmarked = (await getVocabularySnapshot(next.key)).row!;
  expect(unmarked.bookmarked).toBe(false);
  expect(unmarked.contexts).toHaveLength(2);
  expect(vocabularyContextKey(lookup)).not.toBe(vocabularyContextKey({ ...lookup, source: undefined }));
  expect(await failure(saveVocabularyBookmark(lookup, testDefinition('another')))).toBeInstanceOf(Error);
});
test('literal source markup and original Unicode snapshots survive personal save and paired backup without weakening book text', async () => {
  const lookup = {
    ...testLookup('école'),
    sentence: '  L’e\u0301cole **TEST** <img src=x onerror=alert(1)>\u00a0ici.  ',
    source: { kind: 'unit' as const, id: 'unit-TEST', title: 'TEST <b>e\u0301cole</b>' },
  };
  const analysis = {
    ...testAnalysis('e\u0301cole'),
    translation: 'TEST <em>e\u0301cole</em>',
    usageExamples: [{ fr: 'TEST <script>alert(1)</script> e\u0301cole', zh: '\u6d4b\u8bd5', en: 'TEST <b>school</b>' }],
  };
  const saved = await saveVocabularyBookmark(lookup, { kind: 'ai', analysis }, undefined, now);
  expect(saved.contexts[0]).toEqual({
    id: vocabularyContextKey(lookup),
    sentence: lookup.sentence,
    source: lookup.source,
    requestLanguage: 'en',
    savedAt: now,
    definition: { kind: 'ai', analysis },
  });
  const backup = await exportData();
  await importData(backup);
  expect((await exportData()).vocab).toEqual(backup.vocab);
  expect((await saveVocabularyBookmark(lookup, { kind: 'ai', analysis }, undefined, now + 1)).contexts).toEqual(
    saved.contexts,
  );
  const { VocabularyEntrySchema, VocabularyRowSchema } = await import('../src/types/vocabulary');
  const { testEntry } = await import('./fixtures/vocabulary');
  expect(VocabularyEntrySchema.safeParse(testEntry('<b>TEST</b>')).success).toBe(false);
  const entry = testEntry();
  expect(
    VocabularyEntrySchema.safeParse({
      ...entry,
      senses: [{ ...entry.senses[0], gloss: { en: '<b>TEST</b>', zh: '\u6d4b\u8bd5' } }],
    }).success,
  ).toBe(false);
  expect(VocabularyRowSchema.safeParse({ ...saved, contexts: [{ ...saved.contexts[0], id: 'forged' }] }).success).toBe(
    false,
  );
  for (const field of ['word', 'translation'] as const)
    expect(
      await failure(
        saveVocabularyBookmark(
          { ...lookup, sentence: 'Another TEST context' },
          { kind: 'ai', analysis: { ...analysis, [field]: ' ' } },
        ),
      ),
    ).toBeInstanceOf(Error);
  expect(
    await failure(
      saveVocabularyBookmark(
        { ...lookup, sentence: 'Another TEST context', source: { ...lookup.source, title: ' ' } },
        { kind: 'ai', analysis },
      ),
    ),
  ).toBeInstanceOf(Error);
});
test('book-first and bookmark-first both keep one card, first context/snapshot and unchanged scheduling on later saves', async () => {
  for (const bookFirst of [false, true]) {
    await freshDb();
    const candidate = testCandidate();
    if (!bookFirst) await saveVocabularyBookmark(testLookup(), testDefinition(), undefined, now);
    const introduced = await introduceVocabularyCard(candidate, zero, now);
    const rated = await rateVocabularyCard(candidate.key, introduced.tokens, 'first-rating', 'remembered', now);
    const saved = await saveVocabularyBookmark(
      testLookup(),
      testDefinition(),
      { ...candidate.bookSource!, version: 'b'.repeat(64) },
      now + 1,
    );
    expect(saved.schedule).toEqual(rated.row.schedule);
    expect(saved.history).toEqual(rated.row.history);
    expect(saved.bookSource!.version).toBe('a'.repeat(64));
    expect(saved.contexts).toHaveLength(1);
    await removeVocabularyBookmark(candidate.key);
    const again = await saveVocabularyBookmark(
      testLookup(),
      { kind: 'ai', analysis: { ...testAnalysis(), translation: 'replacement TEST' } },
      undefined,
      now + 2,
    );
    expect(again.contexts).toEqual(saved.contexts);
    expect((await readVocabulary(now)).rows).toHaveLength(1);
  }
});

test('same-key introductions serialize once; quota race inserts nothing for losing key; midnight uses reveal day', async () => {
  await saveVocabularyPreferences({ newPerDay: 1, retentionPercent: 90 });
  const candidate = testCandidate();
  const rows = await Promise.all([
    introduceVocabularyCard(candidate, zero, now),
    introduceVocabularyCard(candidate, zero, now),
  ]);
  expect(rows[0].row.introducedAt).toBe(rows[1].row.introducedAt);
  expect(rows[0].row.history).toEqual([]);
  expect((await readVocabulary(now)).day.introducedKeys).toEqual([candidate.key]);
  expect(await failure(introduceVocabularyCard(testCandidate('test-other'), zero, now))).toBeInstanceOf(
    VocabularyQuotaError,
  );
  expect((await getVocabularySnapshot('test-other')).row).toBeUndefined();
  const tomorrow = new Date(2026, 9, 21, 0).getTime();
  await introduceVocabularyCard(testCandidate('test-other'), zero, tomorrow);
  expect((await readVocabulary(tomorrow)).day.introducedKeys).toEqual(['test-other']);
});
test('actual two-key quota race has one winner and no unseen front row', async () => {
  await saveVocabularyPreferences({ newPerDay: 1, retentionPercent: 90 });
  const results = await Promise.allSettled(
    ['test-a', 'test-b'].map((word) => introduceVocabularyCard(testCandidate(word), zero, now)),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect((await readVocabulary(now)).rows).toHaveLength(1);
});
test('replay returns current schedule, enforces same rating, and reset invalidation precedes replay', async () => {
  const first = await introduceVocabularyCard(testCandidate(), zero, now);
  const one = await rateVocabularyCard(first.row.key, first.tokens, 'op-1', 'remembered', now);
  const two = await rateVocabularyCard(first.row.key, one.tokens, 'op-2', 'remembered', now + 1);
  await saveVocabularyPreferences({ newPerDay: 20, retentionPercent: 95 });
  expect((await rateVocabularyCard(first.row.key, first.tokens, 'op-1', 'remembered', now)).row).toEqual(two.row);
  expect(one.row.history[0].retentionPercent).toBe(90);
  expect(await failure(rateVocabularyCard(first.row.key, first.tokens, 'op-1', 'forgot', now))).toBeInstanceOf(Error);
  expect(await failure(rateVocabularyCard(first.row.key, first.tokens, 'op-1', 'remembered', now + 2))).toBeInstanceOf(
    Error,
  );
  await resetVocabularySchedule(first.row.key, two.tokens, now + 3);
  expect(await failure(rateVocabularyCard(first.row.key, first.tokens, 'op-1', 'remembered', now))).toBeInstanceOf(
    StaleVocabularyError,
  );
  const reset = (await getVocabularySnapshot(first.row.key)).row!;
  expect(reset.schedule).toEqual(initialVocabularySchedule(now + 3));
  expect(reset.revision).toBe(3);
  expect(reset.history).toEqual(two.row.history);
  expect(reset.introducedAt).toBe(now);
  const next = await rateVocabularyCard(
    first.row.key,
    (await getVocabularySnapshot(first.row.key)).tokens,
    'after-reset',
    'fuzzy',
    now + 4,
  );
  expect(next.row.history).toHaveLength(3);
  expect(next.row.history[2].prior).toEqual(reset.schedule!);
  expect(next.row.history[2].revision).toBe(4);
  expect(next.row.schedule!.repetitions).toBe(1);
});
test('consecutive resets of unrated and reviewed memory retain content, history, introduction and quota', async () => {
  const saved = await saveVocabularyBookmark(testLookup(), testDefinition(), testCandidate().bookSource, now);
  const introduced = await introduceVocabularyCard(testCandidate(), zero, now);
  const day = (await readVocabulary(now)).day;
  let current = introduced;
  for (let revision = 1; revision <= 2; revision++) {
    const stale = current.tokens;
    await resetVocabularySchedule(saved.key, stale, now + revision);
    const snapshot = await getVocabularySnapshot(saved.key);
    current = { ...introduced, row: snapshot.row!, tokens: snapshot.tokens };
    expect(current.tokens).toEqual({ epoch: 0, resetToken: revision, revision });
    expect(current.row).toEqual({
      ...introduced.row,
      schedule: initialVocabularySchedule(now + revision),
      revision,
    });
    expect(await failure(resetVocabularySchedule(saved.key, stale, now + revision))).toBeInstanceOf(
      StaleVocabularyError,
    );
  }
  const rated = await rateVocabularyCard(saved.key, current.tokens, 'after-unrated-resets', 'remembered', now + 3);
  for (let revision = 4; revision <= 5; revision++) {
    await resetVocabularySchedule(saved.key, (await getVocabularySnapshot(saved.key)).tokens, now + revision);
    const reset = (await getVocabularySnapshot(saved.key)).row!;
    expect(reset).toEqual({ ...rated.row, schedule: initialVocabularySchedule(now + revision), revision });
  }
  expect((await readVocabulary(now)).day).toEqual(day);
  const backup = await exportData();
  await importData(backup);
  expect((await exportData()).vocab).toEqual(backup.vocab);
});
test('word A reset/delete leaves B valid; delete/recreate retains token and exhausted-day eligibility', async () => {
  await saveVocabularyPreferences({ newPerDay: 2, retentionPercent: 90 });
  const a = await introduceVocabularyCard(testCandidate('test-a'), zero, now);
  const b = await introduceVocabularyCard(testCandidate('test-b'), zero, now);
  await resetVocabularySchedule(a.row.key, a.tokens, now + 1);
  const reset = await getVocabularySnapshot(a.row.key);
  await rateVocabularyCard(b.row.key, b.tokens, 'valid-after-a-reset', 'remembered', now);
  await deleteVocabularyCard(a.row.key, reset.tokens);
  const captured = await getVocabularySnapshot(a.row.key);
  expect(captured.tokens.resetToken).toBe(2);
  await introduceVocabularyCard(testCandidate('test-a'), captured.tokens, now);
  expect(await failure(rateVocabularyCard(a.row.key, a.tokens, 'stale', 'remembered', now))).toBeInstanceOf(
    StaleVocabularyError,
  );
  await rateVocabularyCard(b.row.key, (await getVocabularySnapshot(b.row.key)).tokens, 'valid', 'remembered', now);
  expect((await readVocabulary(now)).day.introducedKeys).toHaveLength(2);
  const unintroduced = await saveVocabularyBookmark(testLookup('test-new'), testDefinition('test-new'));
  expect(await failure(resetVocabularySchedule(unintroduced.key, zero, now))).toBeInstanceOf(StaleVocabularyError);
});
test('reviews use transaction-time preferences; failed attempts may retry with new retention, while committed operations stay unchanged', async () => {
  const first = await introduceVocabularyCard(testCandidate(), zero, now);
  await saveVocabularyPreferences({ newPerDay: 0, retentionPercent: 80 });
  // oxlint-disable-next-line typescript/unbound-method -- Inject one aborted native write and restore its receiver-bound delegate.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (this.name === 'vocab') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(
      await failure(rateVocabularyCard(first.row.key, first.tokens, 'retry-config', 'remembered', now)),
    ).toBeInstanceOf(Error);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  expect((await getVocabularySnapshot(first.row.key)).row).toEqual(first.row);
  await saveVocabularyPreferences({ newPerDay: 0, retentionPercent: 95 });
  const committed = await rateVocabularyCard(first.row.key, first.tokens, 'retry-config', 'remembered', now);
  expect(committed.row.history[0]).toMatchObject({
    reviewedAt: now,
    outcome: 'remembered',
    retentionPercent: 95,
  });
  await saveVocabularyPreferences({ newPerDay: 100, retentionPercent: 80 });
  // A committed operation must not even re-read preferences, including a malformed stored row.
  await (await db()).put('meta', { newPerDay: 100, retentionPercent: 0 }, 'vocabularyPreferences');
  const replayed = await rateVocabularyCard(first.row.key, first.tokens, 'retry-config', 'remembered', now);
  expect(replayed.row).toEqual(committed.row);
  expect(await failure(rateVocabularyCard(first.row.key, first.tokens, 'new-stale', 'forgot', now))).toBeInstanceOf(
    StaleVocabularyError,
  );
});
test('clock errors write nothing; a corrected fresh observation works, including after a reset', async () => {
  const first = await introduceVocabularyCard(testCandidate(), zero, now);
  const one = await rateVocabularyCard(first.row.key, first.tokens, 'one', 'remembered', now);
  expect(await failure(rateVocabularyCard(first.row.key, one.tokens, 'bad-clock', 'fuzzy', now - 1))).toBeInstanceOf(
    VocabularyClockError,
  );
  expect((await getVocabularySnapshot(first.row.key)).row).toEqual(one.row);
  await resetVocabularySchedule(first.row.key, one.tokens, now + 1);
  const reset = await getVocabularySnapshot(first.row.key);
  const two = await rateVocabularyCard(first.row.key, reset.tokens, 'new-memory', 'forgot', now + 2);
  expect(two.row.history).toHaveLength(2);
  expect(two.row.history[1].prior).toEqual(initialVocabularySchedule(now + 1));
  expect(two.row.schedule!.repetitions).toBe(1);
  expect(two.row.history[1].revision).toBe(3);
  const backup = await exportData();
  await importData(backup);
  expect((await exportData()).vocab).toEqual(backup.vocab);
  expect(await failure(rateVocabularyCard(first.row.key, two.tokens, 'new-memory', 'forgot', now + 2))).toBeInstanceOf(
    StaleVocabularyError,
  );
});
test('the full preferences interface rejects invalid retention and daily-new values without clamping', async () => {
  for (const newPerDay of [0, 100])
    for (const retentionPercent of [80, 90, 95]) {
      await saveVocabularyPreferences({ newPerDay, retentionPercent });
      expect((await readVocabulary(now)).preferences).toEqual({ newPerDay, retentionPercent });
    }
  for (const preferences of [
    { newPerDay: -1, retentionPercent: 90 },
    { newPerDay: 101, retentionPercent: 90 },
    { newPerDay: 20, retentionPercent: 79 },
    { newPerDay: 20, retentionPercent: 96 },
    { newPerDay: 20, retentionPercent: 90.5 },
  ])
    expect(await failure(saveVocabularyPreferences(preferences))).toBeInstanceOf(Error);
});

test('paired backup preserves unrelated Grammar metadata/tokens, retains deleted ledgers, and refreshes after commit', async () => {
  const introduced = await introduceVocabularyCard(testCandidate(), zero, now);
  await deleteVocabularyCard(introduced.row.key, introduced.tokens);
  const d = await db();
  await d.put('meta', 9, 'exerciseReset:test-deleted-topic');
  await d.put('meta', 'TEST stats marker', 'unrelated');
  const backup = await exportData();
  expect(backup.vocabularyMeta.days[0].introducedKeys).toEqual([introduced.row.key]);
  let observed = -1;
  const unsubscribe = subscribeVocabulary(async () => {
    observed = (await readVocabulary(now)).epoch;
  });
  try {
    await importData({
      vocab: [],
      vocabularyMeta: {
        schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
        preferences: { newPerDay: 0, retentionPercent: 90 },
        days: [],
      },
    });
    expect(observed).toBe(1);
    expect(await d.get('meta', 'exerciseReset:test-deleted-topic')).toBe(9);
    expect(await d.get('meta', 'vocabularyReset:test-mot')).toBe(1);
    expect(await d.get('meta', 'unrelated')).toBe('TEST stats marker');
    expect((await readVocabulary(now)).day.introducedKeys).toEqual([]);
    await importData({});
    expect((await readVocabulary(now)).epoch).toBe(1);
    for (const bad of [
      { vocab: [] },
      { vocabularyMeta: backup.vocabularyMeta },
      { vocab: 'bad', vocabularyMeta: backup.vocabularyMeta },
    ])
      expect(await failure(importData(bad))).toBeInstanceOf(Error);
    expect((await readVocabulary(now)).epoch).toBe(1);
  } finally {
    unsubscribe();
  }
});
