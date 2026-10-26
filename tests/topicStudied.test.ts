/** Studied marks own only their meta rows; native aborts must never publish a committed change. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { db } from '../src/storage/db';
import {
  markTopicStudied,
  unmarkTopicStudied,
  listTopicStudied,
  subscribeTopicStudied,
} from '../src/storage/topicStudied';
import { TopicStudiedSchema, TopicStudiedArraySchema } from '../src/types/topicStudied';

beforeEach(freshDb);

test('studied facts are strict topic ids and positive integer milliseconds; duplicate ids reject', () => {
  const row = { topicId: 'test-topic-1', at: 1 };
  expect(TopicStudiedSchema.parse(row)).toEqual(row);
  expect(TopicStudiedArraySchema.parse([])).toEqual([]);
  for (const topicId of ['', 'UPPER', 'with_space', '-leading', 'trailing-', 'two--dashes', 'conjugation', 'gender'])
    expect(TopicStudiedSchema.safeParse({ ...row, topicId }).success).toBe(false);
  for (const at of [0, -1, 1.5, NaN, Infinity, '1', null])
    expect(TopicStudiedSchema.safeParse({ ...row, at }).success).toBe(false);
  expect(TopicStudiedSchema.safeParse({ ...row, extra: true }).success).toBe(false);
  expect(TopicStudiedArraySchema.safeParse([row, { ...row, at: 2 }]).success).toBe(false);
});

test('marks retain the first timestamp, including concurrent repeats; unknown topics stay sorted until unmarked', async () => {
  expect(await listTopicStudied()).toEqual([]);
  await markTopicStudied('test-z', 30);
  await Promise.all([markTopicStudied('test-a', 20), markTopicStudied('test-a', 10)]);
  await markTopicStudied('test-z', 40);
  expect(await listTopicStudied()).toEqual([
    { topicId: 'test-a', at: 20 },
    { topicId: 'test-z', at: 30 },
  ]);
  expect(await (await db()).get('meta', 'topicStudied:test-a')).toEqual({ at: 20 });
  await unmarkTopicStudied('test-a');
  await unmarkTopicStudied('test-missing');
  expect(await listTopicStudied()).toEqual([{ topicId: 'test-z', at: 30 }]);
  await markTopicStudied('test-a', 50);
  expect((await listTopicStudied())[0]).toEqual({ topicId: 'test-a', at: 50 });
});

test('invalid marks and unmarks reject without writing or notifying', async () => {
  let notifications = 0;
  const unsubscribe = subscribeTopicStudied(() => {
    notifications++;
  });
  try {
    expect(await failure(markTopicStudied('test-topic', 0))).toBeInstanceOf(Error);
    expect(await failure(markTopicStudied('invalid:id', 1))).toBeInstanceOf(Error);
    expect(await failure(unmarkTopicStudied('invalid:id'))).toBeInstanceOf(Error);
    expect(await listTopicStudied()).toEqual([]);
    expect(notifications).toBe(0);
  } finally {
    unsubscribe();
  }
});

test('notifications run after native commit, can read the mark, and unsubscribe stops them', async () => {
  let committed = false;
  const seen: boolean[] = [];
  const rows: Awaited<ReturnType<typeof listTopicStudied>>[] = [];
  const unsubscribe = subscribeTopicStudied(async () => {
    seen.push(committed);
    rows.push(await listTopicStudied());
  });
  // oxlint-disable-next-line typescript/unbound-method -- Native commit observation restores the method below.
  const put = IDBObjectStore.prototype.put;
  // oxlint-disable-next-line typescript/unbound-method -- Native commit observation restores the method below.
  const remove = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.put = function (value, key) {
    this.transaction.addEventListener('complete', () => {
      committed = true;
    });
    return put.call(this, value, key);
  };
  IDBObjectStore.prototype.delete = function (key) {
    this.transaction.addEventListener('complete', () => {
      committed = true;
    });
    return remove.call(this, key);
  };
  try {
    await markTopicStudied('test-topic', 10);
    expect(seen).toEqual([true]);
    expect(rows).toEqual([[{ topicId: 'test-topic', at: 10 }]]);
    committed = false;
    await unmarkTopicStudied('test-topic');
    expect(rows.at(-1)).toEqual([]);
    expect(seen).toEqual([true, true]);
    unsubscribe();
    await markTopicStudied('test-topic', 20);
    expect(seen).toHaveLength(2);
  } finally {
    IDBObjectStore.prototype.put = put;
    IDBObjectStore.prototype.delete = remove;
    unsubscribe();
  }
});

test('post-request aborts of mark and unmark preserve rows and never notify; retry publishes once', async () => {
  await markTopicStudied('test-existing', 10);
  let notifications = 0;
  const unsubscribe = subscribeTopicStudied(() => {
    notifications++;
  });
  // oxlint-disable-next-line typescript/unbound-method -- Native abort injection restores both methods below.
  const put = IDBObjectStore.prototype.put;
  // oxlint-disable-next-line typescript/unbound-method -- Native abort injection restores both methods below.
  const remove = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  IDBObjectStore.prototype.delete = function (key) {
    const request = remove.call(this, key);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(await failure(markTopicStudied('test-new', 20))).toBeInstanceOf(Error);
    expect(await failure(unmarkTopicStudied('test-existing'))).toBeInstanceOf(Error);
    expect(await listTopicStudied()).toEqual([{ topicId: 'test-existing', at: 10 }]);
    expect(notifications).toBe(0);
  } finally {
    IDBObjectStore.prototype.put = put;
    IDBObjectStore.prototype.delete = remove;
    unsubscribe();
  }
  const retryUnsubscribe = subscribeTopicStudied(() => {
    notifications++;
  });
  try {
    await markTopicStudied('test-new', 20);
    expect(notifications).toBe(1);
  } finally {
    retryUnsubscribe();
  }
});
