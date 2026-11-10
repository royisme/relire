/** Whole-restore validation, exact studied namespace replacement and post-commit backup notifications. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import { freshDb, failure, putArticle, article, answered } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { testRow } from './fixtures/vocabulary';
import { db, exportData, importData } from '../src/storage/db';
import { openReaderEdition } from '../src/storage/gradedReaders';
import { markTopicStudied, listTopicStudied, subscribeTopicStudied } from '../src/storage/topicStudied';

beforeEach(freshDb);

async function seed() {
  await putArticle();
  await openReaderEdition(publishedReaderFixture(), 10);
  const d = await db();
  await d.put('vocab', testRow());
  for (const [key, value] of Object.entries({
    'exerciseReset:test': 4,
    'vocabularyReset:test': 7,
    vocabularyEpoch: 3,
    readerEpoch: 2,
    custom: ['TEST'],
    topicStudied: 'TEST unrelated',
    'topicStudied-other': 'TEST unrelated prefix',
  }))
    await d.put('meta', value, key);
  await markTopicStudied('test-old', 10);
  return exportData();
}

async function metaSnapshot() {
  const d = await db();
  const tx = d.transaction('meta');
  const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
  await tx.done;
  return new Map(keys.map((key, index) => [key, values[index]]));
}

test('export always includes sorted studied marks; JSON roundtrip restores unknown topics', async () => {
  expect((await exportData()).topicStudied).toEqual([]);
  await markTopicStudied('test-z', 20);
  await markTopicStudied('test-a', 10);
  const backup = await exportData();
  expect(backup.topicStudied).toEqual([
    { topicId: 'test-a', at: 10 },
    { topicId: 'test-z', at: 20 },
  ]);
  await freshDb();
  await importData(JSON.parse(JSON.stringify(backup)) as typeof backup);
  expect(await exportData()).toEqual(backup);
  expect(await listTopicStudied()).toEqual(backup.topicStudied);
});

test('absent keeps marks without notifying; valid arrays and [] replace only studied keys after commit', async () => {
  const backup = await seed();
  const originalMeta = await metaSnapshot();
  const seen: Awaited<ReturnType<typeof listTopicStudied>>[] = [];
  const unsubscribe = subscribeTopicStudied(async () => {
    seen.push(await listTopicStudied());
  });
  const replacement = [{ topicId: 'test-unknown', at: 20 }];
  try {
    await importData({});
    expect(await exportData()).toEqual(backup);
    expect(seen).toEqual([]);
    await importData({ topicStudied: replacement });
    expect(await exportData()).toEqual({ ...backup, topicStudied: replacement });
    expect(seen).toEqual([replacement]);
    const replacedMeta = await metaSnapshot();
    originalMeta.delete('topicStudied:test-old');
    expect(replacedMeta).toEqual(new Map([...originalMeta, ['topicStudied:test-unknown', { at: 20 }]]));
    await importData({ topicStudied: [] });
    expect(await exportData()).toEqual({ ...backup, topicStudied: [] });
    expect(await metaSnapshot()).toEqual(originalMeta);
    expect(seen).toEqual([replacement, []]);
  } finally {
    unsubscribe();
  }
});

test('malformed and duplicate marks reject the WHOLE restore before any transaction opens', async () => {
  const backup = await seed();
  const originalMeta = await metaSnapshot();
  const row = { topicId: 'test-new', at: 20 };
  const invalid = [
    null,
    {},
    'not-array',
    [null],
    [row, { ...row, at: 30 }],
    [{ ...row, extra: true }],
    [{ at: 20 }],
    [{ topicId: 'test-new' }],
    ...['', 'test_invalid', 'conjugation', 'gender'].map((topicId) => [{ ...row, topicId }]),
    ...[0, -1, 1.5, NaN, Infinity, '20'].map((at) => [{ ...row, at }]),
  ];
  let notifications = 0;
  const unsubscribe = subscribeTopicStudied(() => {
    notifications++;
  });
  const transaction = spyOn(IDBDatabase.prototype, 'transaction');
  try {
    for (const topicStudied of invalid) {
      transaction.mockClear();
      expect(
        await failure(
          importData({
            articles: [article('test-replacement')],
            vocab: [],
            vocabularyMeta: backup.vocabularyMeta,
            gradedReaders: [],
            units: [],
            itemStates: [],
            attempts: [],
            stats: { ...backup.stats, sentencesAnalyzed: 99 },
            topicStudied,
          }),
        ),
      ).toBeInstanceOf(Error);
      expect(transaction).not.toHaveBeenCalled();
      expect(await exportData()).toEqual(backup);
      expect(await metaSnapshot()).toEqual(originalMeta);
    }
    expect(notifications).toBe(0);
  } finally {
    transaction.mockRestore();
    unsubscribe();
  }
});

test('a late exercise failure rolls studied replacement and all other writes back without notification', async () => {
  const backup = await seed();
  const originalMeta = await metaSnapshot();
  let notifications = 0;
  const unsubscribe = subscribeTopicStudied(() => {
    notifications++;
  });
  try {
    expect(
      await failure(
        importData({
          articles: [],
          gradedReaders: [],
          topicStudied: [{ topicId: 'test-new', at: 20 }],
          itemStates: [
            {
              id: 'missing:missing',
              unitId: 'missing',
              itemId: 'missing',
              answer: answered('TEST'),
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
    expect(await metaSnapshot()).toEqual(originalMeta);
    expect(notifications).toBe(0);
  } finally {
    unsubscribe();
  }
});

test('a native post-request restore abort rolls every row back; retry notifies only after native commit', async () => {
  const backup = await seed();
  const originalMeta = await metaSnapshot();
  let committed = false;
  const seen: boolean[] = [];
  const unsubscribe = subscribeTopicStudied(() => {
    seen.push(committed);
  });
  // oxlint-disable-next-line typescript/unbound-method -- Native abort/commit injection restores the method below.
  const put = IDBObjectStore.prototype.put;
  let abort = true;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (this.name === 'meta' && key === 'topicStudied:test-new') {
      if (abort) request.addEventListener('success', () => this.transaction.abort());
      else
        this.transaction.addEventListener('complete', () => {
          committed = true;
        });
    }
    return request;
  };
  try {
    const replacement = { articles: [], topicStudied: [{ topicId: 'test-new', at: 20 }] };
    expect(await failure(importData(replacement))).toBeInstanceOf(Error);
    expect(await exportData()).toEqual(backup);
    expect(await metaSnapshot()).toEqual(originalMeta);
    expect(seen).toEqual([]);
    abort = false;
    await importData(replacement);
    expect(seen).toEqual([true]);
    expect(await listTopicStudied()).toEqual(replacement.topicStudied);
    expect((await exportData()).articles).toEqual([]);
  } finally {
    IDBObjectStore.prototype.put = put;
    unsubscribe();
  }
});
