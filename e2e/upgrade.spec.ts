/**
 * Database upgrades: a version 4 database (articles, vocabulary, shadowing
 * recordings) opens in the app, becomes version 5 with the exercise stores
 * (`units`, `itemStates`, `attempts`) and loses nothing. The data is read back
 * straight from IndexedDB so the check does not depend on which screen shows it.
 */
import { expect, test } from './fixtures';

test('upgrading a version 4 database keeps its data and adds the exercise stores', async ({ page, ai }) => {
  void ai; // onboards the app and answers AI requests
  await page.goto('/robots.txt'); // same origin, without the app opening the database first
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('relire', 4);
        open.onupgradeneeded = () => {
          const d = open.result;
          d.createObjectStore('articles', { keyPath: 'id' });
          d.createObjectStore('vocab', { keyPath: 'id' });
          d.createObjectStore('meta');
          d.createObjectStore('cache', { keyPath: 'key' }).createIndex('kind', 'kind');
          const audio = d.createObjectStore('audio', { keyPath: 'key' });
          audio.createIndex('text', 'text');
          audio.createIndex('lastUsed', 'lastUsed');
          d.createObjectStore('shadowing', { keyPath: 'key' }).createIndex('articleId', 'articleId');
        };
        open.onsuccess = () => {
          const tx = open.result.transaction(['articles', 'vocab', 'meta', 'shadowing'], 'readwrite');
          tx.objectStore('articles').put({
            id: 'old',
            title: 'Ancien article',
            content: 'Une phrase ancienne.',
            level: 'A2',
            category: 'test',
            createdAt: '2026-01-01T00:00:00.000Z',
          });
          tx.objectStore('vocab').put({
            id: 'w1',
            word: 'ancien',
            lemma: 'ancien',
            ipa: '',
            translation: 'old',
            partOfSpeech: 'adj',
            contextSentence: 'Une phrase ancienne.',
            addedAt: '2026-01-01T00:00:00.000Z',
            repetitions: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            nextReviewDate: '2026-01-01',
            reviewHistory: [],
          });
          tx.objectStore('shadowing').put({
            key: 'old|une phrase ancienne.',
            articleId: 'old',
            text: 'Une phrase ancienne.',
            updatedAt: 1_700_000_000_000,
            takes: [
              {
                id: 'take-1',
                recordedAt: 1_700_000_000_000,
                mimeType: 'audio/webm',
                durationMs: 1200,
                bytes: 4,
                blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
              },
            ],
          });
          tx.objectStore('meta').put(true, 'started');
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );

  await page.goto('/');
  await expect(page.getByText('Ancien article').first()).toBeVisible();

  const after = await page.evaluate(
    () =>
      new Promise<{
        version: number;
        stores: string[];
        indexes: Record<string, string[]>;
        article: unknown;
        word: unknown;
        takeBytes: number | null;
        exerciseRows: number[];
      }>((resolve, reject) => {
        const open = indexedDB.open('relire');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const d = open.result;
          const names = ['units', 'itemStates', 'attempts'];
          const tx = d.transaction(['articles', 'vocab', 'shadowing', ...names], 'readonly');
          const article = tx.objectStore('articles').get('old');
          const word = tx.objectStore('vocab').get('w1');
          const sentence = tx.objectStore('shadowing').get('old|une phrase ancienne.');
          const counts = names.map((name) => tx.objectStore(name).count());
          // A finished transaction no longer hands out stores, so read the index names now.
          const indexes = Object.fromEntries(names.map((name) => [name, [...tx.objectStore(name).indexNames].sort()]));
          tx.oncomplete = () => {
            resolve({
              version: d.version,
              stores: [...d.objectStoreNames].sort(),
              indexes,
              article: article.result,
              word: word.result,
              takeBytes: sentence.result?.takes[0]?.blob.size ?? null,
              exerciseRows: counts.map((count) => count.result),
            });
            d.close();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  expect(after.version).toBe(5);
  expect(after.stores).toEqual(
    ['articles', 'attempts', 'audio', 'cache', 'itemStates', 'meta', 'shadowing', 'units', 'vocab'].sort(),
  );
  expect(after.indexes).toEqual({
    units: ['materialId'],
    itemStates: ['unitId'],
    attempts: ['grammarTag', 'materialId', 'timestamp', 'unitId'],
  });
  expect(after.article).toMatchObject({ id: 'old', title: 'Ancien article' });
  expect(after.word).toMatchObject({ id: 'w1', word: 'ancien' });
  expect(after.takeBytes).toBe(4);
  expect(after.exerciseRows).toEqual([0, 0, 0]);
});
