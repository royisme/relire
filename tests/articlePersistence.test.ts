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
