/** Whole-restore atomicity and exact namespace ownership using invented TEST reader snapshots. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerAnswer, testReaderGrader } from './fixtures/readerProgress';
import { db, exportData, importData } from '../src/storage/db';
import { openReaderEdition, saveReaderAnswer, checkReaderAnswer, subscribeReaders } from '../src/storage/gradedReaders';
import { parseGradedReaderBackup } from '../src/storage/gradedReaderBackup';

beforeEach(freshDb);
async function checkedBackup() {
  const opened = await openReaderEdition(publishedReaderFixture(), 10);
  const saved = await saveReaderAnswer(opened.session, 'type-size', readerAnswer(1, 'petit'));
  await checkReaderAnswer(saved.session, 'type-size', testReaderGrader, 20);
  return exportData();
}
test('backup always exports reader rows and snapshots, never epoch; roundtrip preserves exact checked state', async () => {
  expect((await exportData()).gradedReaders).toEqual([]);
  const backup = await checkedBackup();
  expect(backup).not.toHaveProperty('readerEpoch');
  expect(backup.gradedReaders[0].snapshot).toEqual(publishedReaderFixture());
  await importData({ gradedReaders: [] });
  await importData(backup, testReaderGrader);
  expect(await exportData()).toEqual(backup);
  expect(await (await db()).get('meta', 'readerEpoch')).toBe(2);
});
test('absent keeps progress and epoch, [] clears only owned keys, notifications read committed state', async () => {
  const backup = await checkedBackup();
  const d = await db();
  const unrelated = {
    stats: { test: true },
    'exerciseReset:test': 4,
    'vocabularyReset:test': 7,
    vocabularyEpoch: 3,
    custom: ['TEST'],
  };
  for (const [key, value] of Object.entries(unrelated)) await d.put('meta', value, key);
  await d.put('meta', 9, 'readerEpoch');
  await importData({});
  expect((await exportData()).gradedReaders).toEqual(backup.gradedReaders);
  expect(await d.get('meta', 'readerEpoch')).toBe(9);
  let notifications = 0;
  const unsubscribe = subscribeReaders(async () => {
    expect((await exportData()).gradedReaders).toEqual([]);
    expect(await d.get('meta', 'readerEpoch')).toBe(10);
    notifications++;
  });
  try {
    await importData({ gradedReaders: [] });
  } finally {
    unsubscribe();
  }
  expect(notifications).toBe(1);
  for (const [key, value] of Object.entries(unrelated)) expect(await d.get('meta', key)).toEqual(value);
});
test('malformed raw rows reject the entire restore before touching articles, reader epoch or unrelated namespaces', async () => {
  const backup = await checkedBackup();
  const row = backup.gradedReaders[0];
  const checked = row.answers['type-size'];
  const invalidRows = [
    { ...row, unknown: 'not stripped' },
    { ...row, readerId: 'different-test' },
    { ...row, openedAt: Infinity },
    { ...row, lastOpenedAt: NaN },
    { ...row, completedAt: Infinity },
    { ...row, revision: -1 },
    { ...row, lastSentenceId: 'missing-test' },
    { ...row, snapshot: { ...row.snapshot, private: 'forbidden-test' } },
    {
      ...row,
      snapshot: {
        ...row.snapshot,
        body: { ...row.snapshot.body, title: { ...row.snapshot.body.title, en: 'TEST hash change' } },
      },
    },
    { ...row, answers: { 'missing-test': checked } },
    { ...row, answers: { 'type-size': { ...checked, unknown: true } } },
    { ...row, answers: { 'type-size': { ...checked, answer: { ...checked.answer, unknown: true } } } },
    { ...row, answers: { 'type-size': { ...checked, checked: { ...checked.checked, correct: false } } } },
    { ...row, answers: { 'type-size': { ...checked, checked: { ...checked.checked, strictAccents: false } } } },
    { ...row, answers: { 'type-size': { ...checked, checked: { ...checked.checked, checkedAt: Infinity } } } },
    { ...row, answers: { 'recognize-book': { answer: readerAnswer(0, 'not-an-option'), checked: null } } },
    { ...row, answers: { 'type-size': { answer: readerAnswer(0, 'un livre'), checked: null } } },
  ];
  let notifications = 0;
  const unsubscribe = subscribeReaders(() => {
    notifications++;
  });
  try {
    for (const gradedReaders of [null, {}, 'not-array', [row, row], ...invalidRows.map((invalid) => [invalid])]) {
      expect(await failure(importData({ articles: [], gradedReaders }, testReaderGrader))).toBeInstanceOf(Error);
      expect(await exportData()).toEqual(backup);
      expect(await (await db()).get('meta', 'readerEpoch')).toBeUndefined();
    }
    expect(notifications).toBe(0);
  } finally {
    unsubscribe();
  }
});
test('missing grader fails closed for checked backups, while raw unknown fields reach the reader parser intact', async () => {
  const backup = await checkedBackup();
  expect(await failure(importData(backup))).toBeInstanceOf(Error);
  expect(
    await failure(
      parseGradedReaderBackup({ gradedReaders: [{ ...backup.gradedReaders[0], extra: true }] }, testReaderGrader),
    ),
  ).toBeInstanceOf(Error);
  expect(await exportData()).toEqual(backup);
});
test('a late exercise restore failure rolls reader replacement and epoch back without notifying', async () => {
  const backup = await checkedBackup();
  let notifications = 0;
  const unsubscribe = subscribeReaders(() => {
    notifications++;
  });
  try {
    expect(
      await failure(
        importData({
          gradedReaders: [],
          itemStates: [
            {
              id: 'missing:missing',
              unitId: 'missing',
              itemId: 'missing',
              answer: readerAnswer(1, 'TEST'),
              checked: null,
              hintShown: false,
              explanationShown: false,
              updatedAt: 10,
            },
          ],
        }),
      ),
    ).toBeInstanceOf(Error);
    expect(await exportData()).toEqual(backup);
    expect(await (await db()).get('meta', 'readerEpoch')).toBeUndefined();
    expect(notifications).toBe(0);
  } finally {
    unsubscribe();
  }
});
