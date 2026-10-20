/** Canonical identity and durable row transactions using only disposable fake IndexedDB. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { testAnalysis, testCandidate, testLookup } from './fixtures/vocabulary';
import { vocabularyContextKey, vocabularyKey } from '../src/services/vocabulary/identity';
import { db, exportData, importData } from '../src/storage/db';
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
  const first = await saveVocabularyBookmark(lookup, { ...testAnalysis(), cefrLevel: 'C2' }, undefined, now);
  expect(first.contexts[0].analysis.cefrLevel).toBe('C2');
  const again = await saveVocabularyBookmark(
    { ...lookup, sentence: `  ${lookup.sentence}  `, source: { ...lookup.source, title: 'Changed title' } },
    { ...testAnalysis(), translation: 'changed' },
    undefined,
    now + 1,
  );
  expect(again.contexts).toEqual(first.contexts);
  const next = await saveVocabularyBookmark({ ...lookup, requestLanguage: 'zh' }, testAnalysis(), undefined, now + 2);
  expect(next.contexts).toHaveLength(2);
  expect(next.bookmarkedAt).toBe(now);
  await removeVocabularyBookmark(next.key);
  const unmarked = (await getVocabularySnapshot(next.key)).row!;
  expect(unmarked.bookmarked).toBe(false);
  expect(unmarked.contexts).toHaveLength(2);
  expect(vocabularyContextKey(lookup)).not.toBe(vocabularyContextKey({ ...lookup, source: undefined }));
  expect(await failure(saveVocabularyBookmark(lookup, testAnalysis('another')))).toBeInstanceOf(Error);
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
  const saved = await saveVocabularyBookmark(lookup, analysis, undefined, now);
  expect(saved.contexts[0]).toEqual({
    id: vocabularyContextKey(lookup),
    sentence: lookup.sentence,
    source: lookup.source,
    requestLanguage: 'en',
    savedAt: now,
    analysis,
  });
  const backup = await exportData();
  await importData(backup);
  expect((await exportData()).vocab).toEqual(backup.vocab);
  expect((await saveVocabularyBookmark(lookup, analysis, undefined, now + 1)).contexts).toEqual(saved.contexts);
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
        saveVocabularyBookmark({ ...lookup, sentence: 'Another TEST context' }, { ...analysis, [field]: ' ' }),
      ),
    ).toBeInstanceOf(Error);
  expect(
    await failure(
      saveVocabularyBookmark(
        { ...lookup, sentence: 'Another TEST context', source: { ...lookup.source, title: ' ' } },
        analysis,
      ),
    ),
  ).toBeInstanceOf(Error);
});
test('book-first and bookmark-first both keep one card, first context/snapshot and unchanged scheduling on later saves', async () => {
  for (const bookFirst of [false, true]) {
    await freshDb();
    const candidate = testCandidate();
    if (!bookFirst) await saveVocabularyBookmark(testLookup(), testAnalysis(), undefined, now);
    const introduced = await introduceVocabularyCard(candidate, zero, now);
    const rated = await rateVocabularyCard(candidate.key, introduced.tokens, 'first-rating', 4, now);
    const saved = await saveVocabularyBookmark(
      testLookup(),
      testAnalysis(),
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
      { ...testAnalysis(), translation: 'replacement TEST' },
      undefined,
      now + 2,
    );
    expect(again.contexts).toEqual(saved.contexts);
    expect((await readVocabulary(now)).rows).toHaveLength(1);
  }
});

test('same-key introductions serialize once; quota race inserts nothing for losing key; midnight uses reveal day', async () => {
  await saveVocabularyPreferences(1);
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
  await saveVocabularyPreferences(1);
  const results = await Promise.allSettled(
    ['test-a', 'test-b'].map((word) => introduceVocabularyCard(testCandidate(word), zero, now)),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect((await readVocabulary(now)).rows).toHaveLength(1);
});
test('replay returns current schedule, enforces same rating, and reset invalidation precedes replay', async () => {
  const first = await introduceVocabularyCard(testCandidate(), zero, now);
  const one = await rateVocabularyCard(first.row.key, first.tokens, 'op-1', 4, now);
  const two = await rateVocabularyCard(first.row.key, one.tokens, 'op-2', 5, now + 1);
  expect((await rateVocabularyCard(first.row.key, first.tokens, 'op-1', 4, now + 2)).row).toEqual(two.row);
  expect(await failure(rateVocabularyCard(first.row.key, first.tokens, 'op-1', 1, now))).toBeInstanceOf(Error);
  await resetVocabularySchedule(first.row.key, two.tokens, now + 3);
  expect(await failure(rateVocabularyCard(first.row.key, first.tokens, 'op-1', 4, now))).toBeInstanceOf(
    StaleVocabularyError,
  );
  const reset = (await getVocabularySnapshot(first.row.key)).row!;
  expect(reset.schedule).toEqual({
    phase: 'learning',
    step: 0,
    dueAt: now + 3,
    easeFactor: 2.5,
    repetitions: 0,
    intervalDays: 0,
  });
  expect(reset.history).toEqual(two.row.history);
  expect(reset.introducedAt).toBe(now);
});
test('word A reset/delete leaves B valid; delete/recreate retains token and exhausted-day eligibility', async () => {
  await saveVocabularyPreferences(2);
  const a = await introduceVocabularyCard(testCandidate('test-a'), zero, now);
  const b = await introduceVocabularyCard(testCandidate('test-b'), zero, now);
  await deleteVocabularyCard(a.row.key, a.tokens);
  const captured = await getVocabularySnapshot(a.row.key);
  expect(captured.tokens.resetToken).toBe(1);
  await introduceVocabularyCard(testCandidate('test-a'), captured.tokens, now);
  expect(await failure(rateVocabularyCard(a.row.key, a.tokens, 'stale', 4, now))).toBeInstanceOf(StaleVocabularyError);
  await rateVocabularyCard(b.row.key, b.tokens, 'valid', 4, now);
  expect((await readVocabulary(now)).day.introducedKeys).toHaveLength(2);
  const unintroduced = await saveVocabularyBookmark(testLookup('test-new'), testAnalysis('test-new'));
  expect(await failure(resetVocabularySchedule(unintroduced.key, zero, now))).toBeInstanceOf(StaleVocabularyError);
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
    await importData({ vocab: [], vocabularyMeta: { preferences: { newPerDay: 0 }, days: [] } });
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
