/** Native aborts, raw backup rejection, exact acquired-audio eligibility and queue order on disposable learner data. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure, seedUnit } from './fixtures/storage';
import { testAnalysis, testBook, testCandidate, testLookup, testRow } from './fixtures/vocabulary';
import { db, exportData, importData } from '../src/storage/db';
import {
  saveVocabularyBookmark,
  removeVocabularyBookmark,
  introduceVocabularyCard,
  rateVocabularyCard,
  getVocabularySnapshot,
} from '../src/storage/vocabulary';
import { protectedTexts, exportProtectedAudio, audioKey, normalizeText } from '../src/storage/audio';
import { joinVocabulary, vocabularyQueue } from '../src/services/vocabulary/queue';
import { initialVocabularySchedule } from '../src/utils/srs';
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
      await failure(rateVocabularyCard(introduced.row.key, introduced.tokens, 'retry-test', 4, now)),
    ).toBeInstanceOf(Error);
    expect((await getVocabularySnapshot(introduced.row.key)).row).toEqual(introduced.row);
    failing = false;
    await rateVocabularyCard(introduced.row.key, introduced.tokens, 'retry-test', 4, now);
    await rateVocabularyCard(introduced.row.key, introduced.tokens, 'retry-test', 4, now);
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
        vocabularyMeta: { preferences: { newPerDay: 0 }, days: [] },
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
      preferences: { newPerDay: 20 },
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
      await failure(importData({ ...paired, vocabularyMeta: { preferences: { newPerDay: 20 }, days } })),
    ).toBeInstanceOf(Error);
  expect(await exportData()).toEqual(original);
});
test('only bookmarked or scheduled vocabulary protects/exports word, personal sentence and personal example clips; no synthesis', async () => {
  const saved = await saveVocabularyBookmark(
    testLookup('test-personal'),
    testAnalysis('test-personal'),
    undefined,
    now,
  );
  const retained = await saveVocabularyBookmark(
    testLookup('test-retained'),
    testAnalysis('test-retained'),
    undefined,
    now,
  );
  await removeVocabularyBookmark(retained.key);
  const introduced = await introduceVocabularyCard(testCandidate('test-learning'), zero, now);
  const book = await testBook();
  const d = await db();
  const texts = [
    saved.word,
    saved.contexts[0].sentence,
    saved.contexts[0].analysis.usageExamples![0].fr,
    retained.word,
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
    [saved.word, saved.contexts[0].sentence, saved.contexts[0].analysis.usageExamples![0].fr, introduced.row.word].map(
      normalizeText,
    ),
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
  const minute = { ...testRow('minute-test'), schedule: initialVocabularySchedule(now - 10), introducedAt: now - 10 };
  const review = {
    ...testRow('review-test'),
    schedule: { phase: 'review' as const, dueDate: '2026-10-19', intervalDays: 1, repetitions: 1, easeFactor: 2.5 },
    introducedAt: now - 20,
  };
  const personal = { ...testRow('personal-test'), bookmarked: true, bookmarkedAt: 1 };
  const day = { date: '2026-10-20', introducedKeys: [] };
  const queue = vocabularyQueue([review, minute, personal], book, day, 20, now, new Set());
  expect(queue.candidates.map((word) => word.key)).toEqual([
    'minute-test',
    'review-test',
    'personal-test',
    'test-0',
    'test-1',
  ]);
  const future = { ...minute, schedule: { ...initialVocabularySchedule(now + 60_000), phase: 'relearning' as const } };
  expect(vocabularyQueue([future], undefined, day, 0, now, new Set())).toEqual({
    candidates: [],
    nextDue: now + 60_000,
  });
  expect(
    vocabularyQueue([], book, { ...day, introducedKeys: ['test-1'] }, 0, now, new Set()).candidates.map(
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
  const candidate = vocabularyQueue([], book, { date: '2026-10-20', introducedKeys: [] }, 20, now, new Set())
    .candidates[0];
  expect((await exportData()).vocab).toEqual([]);
  const introduced = await introduceVocabularyCard(candidate, zero, now);
  expect(introduced.row.key).toBe(book.entries[0].key);
  expect(Object.keys(introduced.row)).not.toContain('builtIn');
  expect((await exportData()).vocab).toHaveLength(1);
});

test('Words routes roundtrip and all retain Study area', () => {
  for (const name of ['wordsAll', 'wordsReview'] as const) {
    const route = { name };
    expect(parseRoute(routeHref(route)).route).toEqual(route);
    expect(areaOf(route)).toBe('study');
  }
});
