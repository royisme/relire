/** Native aborts, raw backup rejection, exact acquired-audio eligibility and queue order on disposable learner data. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure, seedUnit } from './fixtures/storage';
import {
  testDefinition,
  testAnalysis,
  testBook,
  testCandidate,
  testLookup,
  testRow,
  testMatureSchedule,
} from './fixtures/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import { db, exportData, importData } from '../src/storage/db';
import { testReaderDefinition, testReaderLookup } from './fixtures/vocabularyReader';
import {
  saveVocabularyBookmark,
  removeVocabularyBookmark,
  introduceVocabularyCard,
  rateVocabularyCard,
  getVocabularySnapshot,
} from '../src/storage/vocabulary';
import { protectedTexts, exportProtectedAudio, audioKey, normalizeText } from '../src/storage/audio';
import { joinVocabulary, vocabularyQueue } from '../src/services/vocabulary/queue';
import { BUILTIN_WORDS, MY_WORDS } from '../src/services/vocabulary/wordbooks';
import { initialVocabularySchedule } from '../src/utils/srs';
import { VocabularyRowSchema, type VocabularyRow } from '../src/types/vocabulary';
import { areaOf, parseRoute, routeHref } from '../src/utils/routes';
const zero = { epoch: 0, resetToken: 0, revision: 0 },
  now = new Date(2026, 9, 20, 12).getTime();
beforeEach(freshDb);
test('native post-request introduction/rating abort changes neither row nor ledger/history; same operation storage retry commits once', async () => {
  // oxlint-disable-next-line typescript/unbound-method -- Native abort injection calls with the active store and restores the method.
  const put = IDBObjectStore.prototype.put;
  let failing = true;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (failing && this.name === 'vocab') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(await failure(introduceVocabularyCard(testCandidate(), zero, now))).toBeInstanceOf(Error);
    expect((await exportData()).vocab).toEqual([]);
    expect((await exportData()).vocabularyMeta.days).toEqual([]);
    failing = false;
    const introduced = await introduceVocabularyCard(testCandidate(), zero, now);
    failing = true;
    expect(
      await failure(rateVocabularyCard(introduced.row.key, introduced.tokens, 'retry-test', 'remembered', now)),
    ).toBeInstanceOf(Error);
    expect((await getVocabularySnapshot(introduced.row.key)).row).toEqual(introduced.row);
    failing = false;
    await rateVocabularyCard(introduced.row.key, introduced.tokens, 'retry-test', 'remembered', now);
    await rateVocabularyCard(introduced.row.key, introduced.tokens, 'retry-test', 'remembered', now);
    expect((await getVocabularySnapshot(introduced.row.key)).row!.history).toHaveLength(1);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
});
test('whole restore late exercise failure rolls vocabulary pair, epoch, articles and exercise state back atomically', async () => {
  const unit = await seedUnit();
  await introduceVocabularyCard(testCandidate(), zero, now);
  const original = await exportData();
  expect(
    await failure(
      importData({
        vocab: [],
        vocabularyMeta: {
          schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
          preferences: { newPerDay: 0, retentionPercent: 90, studyBook: 'mine' },
          days: [],
        },
        itemStates: [
          {
            id: 'missing:missing',
            unitId: 'missing',
            itemId: 'missing',
            answer: {
              singleAnswer: '',
              multiAnswers: [],
              choiceSelections: [],
              selectedOdd: null,
              dialogueOrder: [],
              matchSelection: '',
            },
            checked: null,
            hintShown: false,
            explanationShown: false,
            updatedAt: now,
          },
        ],
      }),
    ),
  ).toBeInstanceOf(Error);
  expect(await exportData()).toEqual(original);
  expect((await getVocabularySnapshot('test-mot')).tokens.epoch).toBe(0);
  expect(await (await db()).get('units', unit.id)).toBeDefined();
});
test('raw invalid row/metadata fields reject instead of stripping; retained deleted-key ledgers roundtrip', async () => {
  const row = testRow();
  const paired = {
    vocab: [row],
    vocabularyMeta: {
      schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
      preferences: { newPerDay: 20, retentionPercent: 90, studyBook: 'mine' },
      days: [{ date: '2026-10-19', introducedKeys: ['deleted-test'] }],
    },
  };
  await importData(paired);
  const original = await exportData();
  for (const invalid of [
    { ...row, id: 'random' },
    { ...row, bookmarked: true },
    { ...row, introducedAt: now },
    { ...row, unknown: 'not stripped' },
    { ...row, revision: NaN },
  ])
    expect(await failure(importData({ ...paired, vocab: [invalid] }))).toBeInstanceOf(Error);
  for (const days of [
    [{ date: '2026-02-30', introducedKeys: [] }],
    [{ date: '2026-10-20', introducedKeys: ['a', 'a'] }],
  ])
    expect(
      await failure(
        importData({
          ...paired,
          vocabularyMeta: {
            schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
            preferences: { newPerDay: 20, retentionPercent: 90, studyBook: 'mine' },
            days,
          },
        }),
      ),
    ).toBeInstanceOf(Error);
  expect(await exportData()).toEqual(original);
});
test('backups keep policy only in metadata and reject removed fields or malformed model facts atomically', async () => {
  const first = await introduceVocabularyCard(testCandidate(), zero, now);
  await rateVocabularyCard(first.row.key, first.tokens, 'semantic-test', 'remembered', now);
  const backup = await exportData();
  expect(backup.vocabularyMeta.schedulerPolicy).toBe('fsrs6/ts-fsrs@5.4.2/policy1');
  const row = backup.vocab[0],
    record = row.history[0];
  expect(row).not.toHaveProperty('memoryResetRevision');
  expect(record).not.toHaveProperty('schedulerPolicy');
  await importData(backup);
  expect((await exportData()).vocab).toEqual(backup.vocab);
  const { schedulerPolicy: _policy, ...oldMetadata } = backup.vocabularyMeta;
  const { outcome: _outcome, ...oldRecord } = record;
  const { retentionPercent: _retention, ...oldPreferences } = backup.vocabularyMeta.preferences;
  for (const patch of [
    { vocabularyMeta: oldMetadata },
    { vocabularyMeta: { ...backup.vocabularyMeta, schedulerPolicy: 'another-policy' } },
    { vocabularyMeta: { ...backup.vocabularyMeta, preferences: oldPreferences } },
    { vocab: [{ ...row, history: [{ ...oldRecord, rating: 4 }] }] },
    { vocab: [{ ...row, memoryResetRevision: 0 }] },
    { vocab: [{ ...row, history: [{ ...record, schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1' }] }] },
    { vocab: [{ ...row, schedule: { ...row.schedule, stability: NaN } }] },
    { vocab: [{ ...row, schedule: { ...row.schedule, dueAt: Infinity } }] },
    { vocab: [{ ...row, schedule: { ...row.schedule, lastReviewedAt: null } }] },
    {
      vocab: [
        {
          ...row,
          schedule: { phase: 'learning', step: 0, easeFactor: 2.5, repetitions: 0, intervalDays: 0, dueAt: now },
        },
      ],
    },
    ...[
      { outcome: 'easy' },
      { outcome: 3 },
      { reviewedAt: NaN },
      { retentionPercent: 0.9 },
      { schedulerPolicy: 'fsrs7' },
      { next: { ...record.next, repetitions: 0 } },
    ].map((bad) => ({ vocab: [{ ...row, history: [{ ...record, ...bad }] }] })),
  ]) {
    expect(await failure(importData({ ...backup, ...patch }))).toBeInstanceOf(Error);
    expect(await exportData()).toEqual(backup);
  }
});

test('current memory validation uses row revision and latest observation without reconstructing historical reset gaps', async () => {
  const introduced = await introduceVocabularyCard(testCandidate(), zero, now);
  const one = await rateVocabularyCard(introduced.row.key, introduced.tokens, 'one', 'remembered', now);
  const two = await rateVocabularyCard(introduced.row.key, one.tokens, 'two', 'remembered', now + 1);
  const row = two.row;
  const fresh = initialVocabularySchedule(now + 2);
  for (const valid of [
    introduced.row,
    row,
    { ...row, revision: 3, schedule: fresh },
    { ...row, revision: 4, schedule: fresh },
    { ...introduced.row, revision: 2, schedule: fresh },
    { ...row, revision: 4, history: row.history.map((record) => ({ ...record, revision: record.revision + 2 })) },
  ])
    expect(VocabularyRowSchema.safeParse(valid).success).toBe(true);
  for (const invalid of [
    { ...testRow(), revision: 1 },
    { ...testRow(), history: row.history },
    { ...row, revision: 1 },
    { ...row, revision: 3 },
    { ...row, schedule: fresh },
    { ...introduced.row, schedule: row.schedule },
    { ...row, schedule: { ...row.schedule, stability: row.schedule!.stability + 1 } },
    { ...row, revision: 3, schedule: { ...fresh, repetitions: 1 } },
    { ...row, history: [...row.history].reverse() },
    { ...row, history: [row.history[0], { ...row.history[1], revision: 1 }] },
    { ...row, history: [row.history[0], { ...row.history[1], operationId: 'one' }] },
    { ...row, history: [{ ...row.history[0], reviewedAt: now + 1 }, row.history[1]] },
    { ...row, history: [{ ...row.history[0], next: { ...row.history[0].next, repetitions: 2 } }, row.history[1]] },
  ])
    expect(VocabularyRowSchema.safeParse(invalid).success).toBe(false);
});

test('only bookmarked or scheduled vocabulary protects/exports word, personal sentence and personal example clips; no synthesis', async () => {
  const saved = await saveVocabularyBookmark(
    testLookup('test-personal'),
    testDefinition('test-personal'),
    undefined,
    now,
  );
  const retained = await saveVocabularyBookmark(
    testLookup('test-retained'),
    testDefinition('test-retained'),
    undefined,
    now,
  );
  await removeVocabularyBookmark(retained.key);
  const readerWord = await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition(), undefined, now);
  const introduced = await introduceVocabularyCard(testCandidate('test-learning'), zero, now);
  const book = await testBook();
  const d = await db();
  const texts = [
    saved.word,
    saved.contexts[0].sentence,
    testAnalysis('test-personal').usageExamples![0].fr,
    retained.word,
    readerWord.word,
    readerWord.contexts[0].sentence,
    introduced.row.word,
    book.entries[0].word,
    'Built-in TEST example',
  ];
  for (const text of texts)
    await d.put('audio', {
      key: audioKey('test', 'test', 'test', text),
      text: normalizeText(text),
      provider: 'test',
      model: 'test',
      voice: 'test',
      blob: new Blob(['TEST'], { type: 'audio/wav' }),
      bytes: 4,
      lastUsed: 1,
    });
  const expected = new Set(
    [
      saved.word,
      saved.contexts[0].sentence,
      testAnalysis('test-personal').usageExamples![0].fr,
      readerWord.word,
      readerWord.contexts[0].sentence,
      introduced.row.word,
    ].map(normalizeText),
  );
  expect(await protectedTexts()).toEqual(expected);
  const reader = globalThis.FileReader;
  globalThis.FileReader = class {
    result: string | null = null;
    onload: (() => void) | null = null;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((bytes) => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      });
    }
  } as unknown as typeof FileReader;
  try {
    expect(new Set((await exportProtectedAudio()).map((clip) => clip.text))).toEqual(expected);
  } finally {
    if (reader) globalThis.FileReader = reader;
    else Reflect.deleteProperty(globalThis, 'FileReader');
  }
});
test('queue uses minute/review/personal/book order, excludes visits and waits for the true minute; zero still allows ledgered recreation', async () => {
  const book = await testBook(2);
  // One wordbook is studied, so the personal rows are saved from reading (My words) and the catalogue
  // fronts are queued only when the built-in book is the studied one.
  const owned = (word: string): VocabularyRow => {
    const { bookSource: _book, ...base } = testRow(word);
    const lookup = { word, sentence: `Une phrase ${word}.`, requestLanguage: 'en' as const };
    return {
      ...base,
      contexts: [
        {
          id: vocabularyContextKey(lookup),
          sentence: lookup.sentence,
          savedAt: 1,
          requestLanguage: 'en',
          definition: testDefinition(word),
        },
      ],
    };
  };
  const minute = { ...owned('minute-test'), schedule: initialVocabularySchedule(now - 10), introducedAt: now - 10 };
  const review = {
    ...owned('review-test'),
    schedule: testMatureSchedule(now - 86400_000),
    introducedAt: now - 20,
  };
  const personal = { ...owned('personal-test'), bookmarked: true, bookmarkedAt: 1 };
  const day = { date: '2026-10-20', introducedKeys: [] };
  const queue = vocabularyQueue([review, minute, personal], book, day, 20, now, new Set(), MY_WORDS);
  expect(queue.candidates.map((word) => word.key)).toEqual(['minute-test', 'review-test', 'personal-test']);
  expect(
    vocabularyQueue([review, minute, personal], book, day, 20, now, new Set(), BUILTIN_WORDS).candidates.map(
      (word) => word.key,
    ),
  ).toEqual(['test-0', 'test-1']);
  const future = {
    ...minute,
    schedule: { ...testMatureSchedule(now), phase: 'relearning' as const, dueAt: now + 60_000 },
  };
  expect(vocabularyQueue([future], undefined, day, 0, now, new Set(), MY_WORDS)).toEqual({
    candidates: [],
    nextDue: now + 60_000,
  });
  expect(
    vocabularyQueue([], book, { ...day, introducedKeys: ['test-1'] }, 0, now, new Set(), BUILTIN_WORDS).candidates.map(
      (word) => word.key,
    ),
  ).toEqual(['test-1']);
  const joined = joinVocabulary([testRow('test-0')], book);
  expect(joined).toHaveLength(2);
  expect(joined[0].bookSource!.version).toBe(book.manifest.version);
  expect(joined[0].row!.bookSource!.version).toBe('a'.repeat(64));
});
test('a joined unseen book front materializes only learner fields on reveal and never persists catalogue UI state', async () => {
  const book = await testBook();
  const candidate = vocabularyQueue(
    [],
    book,
    { date: '2026-10-20', introducedKeys: [] },
    20,
    now,
    new Set(),
    BUILTIN_WORDS,
  ).candidates[0];
  expect((await exportData()).vocab).toEqual([]);
  const introduced = await introduceVocabularyCard(candidate, zero, now);
  expect(introduced.row.key).toBe(book.entries[0].key);
  expect(Object.keys(introduced.row)).not.toContain('builtIn');
  expect((await exportData()).vocab).toHaveLength(1);
});

test('Words routes roundtrip and all retain the top-level Words area', () => {
  for (const name of ['words', 'wordsAll', 'wordsReview', 'wordsPlay', 'wordsMap'] as const) {
    const route = { name };
    expect(parseRoute(routeHref(route)).route).toEqual(route);
    expect(areaOf(route)).toBe('words');
  }
});
