/** Explicit article operations commit whole transactions, never a library snapshot. */
import { beforeEach, expect, test } from 'bun:test';
import { article, failure, freshDb } from './fixtures/storage';
import {
  db,
  deleteArticleData,
  initializeData,
  loadData,
  restoreMissingArticles,
  saveArticle,
} from '../src/storage/db';
import type { Article } from '../src/types';

beforeEach(freshDb);

// IndexedDB cannot clone a function: fail after an earlier row was already written.
const uncloneable = (): Article => ({ ...article('bad'), content: (() => undefined) as unknown as string });

test.each(['initializeData', 'saveArticle', 'restoreMissingArticles'] as const)(
  '%s preserves an asynchronous request error and consumes the aborted transaction rejection',
  async (operation) => {
    const d = await db();
    await d.put('meta', true, 'collision');
    // oxlint-disable-next-line typescript/unbound-method -- Called with the active store and restored below.
    const put = IDBObjectStore.prototype.put;
    const requestErrors: (DOMException | null)[] = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name !== 'meta' || key !== 'started') return put.call(this, value, key);
      // A real duplicate-key request fails asynchronously and auto-aborts the transaction.
      const request = this.add(value, 'collision');
      request.addEventListener('error', () => {
        requestErrors.push(request.error);
      });
      return request;
    };
    try {
      const operations = {
        initializeData: () => initializeData([article()]),
        saveArticle: () => saveArticle(article()),
        restoreMissingArticles: () => restoreMissingArticles([article()]),
      };
      const error = await failure(operations[operation]());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requestErrors).toHaveLength(1);
      expect(requestErrors[0]?.name).toBe('ConstraintError');
      expect(error).toBe(requestErrors[0]);
      expect(unhandled).toEqual([]);
      expect(await d.count('articles')).toBe(0);
      expect(await d.get('meta', 'started')).toBeUndefined();
    } finally {
      IDBObjectStore.prototype.put = put;
      process.off('unhandledRejection', onUnhandled);
    }
  },
);

test('initializeData aborts samples and started together, then permits retry', async () => {
  expect(await failure(initializeData([article(), uncloneable()]))).toBeInstanceOf(Error);
  const d = await db();
  expect(await d.count('articles')).toBe(0);
  expect(await d.get('meta', 'started')).toBeUndefined();
  expect(await loadData()).toBeNull();
  await initializeData([article()]);
  expect((await loadData())?.articles).toEqual([article()]);
});

test('initializeData checks started transactionally, including a deliberately emptied library', async () => {
  await Promise.all([initializeData([article('first')]), initializeData([article('second')])]);
  expect((await loadData())?.articles).toEqual([article('first')]);
  await deleteArticleData('first');
  await initializeData([article('second')]);
  expect((await loadData())?.articles).toEqual([]);
});

test('restoreMissingArticles returns stored versions and rolls back partial inserts on failure', async () => {
  const edited = { ...article('sample'), content: 'Texte modifié.' };
  await saveArticle(edited);
  expect(await failure(restoreMissingArticles([article('new'), uncloneable()]))).toBeInstanceOf(Error);
  const d = await db();
  expect(await d.get('articles', 'new')).toBeUndefined();
  const candidates = [article('sample'), article('new')];
  expect(await restoreMissingArticles(candidates)).toEqual([edited, article('new')]);
  expect(await d.get('articles', 'sample')).toEqual(edited);
  expect(await d.get('articles', 'new')).toEqual(article('new'));
});
