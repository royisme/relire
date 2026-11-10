/** Complete-only book download/cache checks with real transport, mocked HTTP and fake IndexedDB. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { testBook } from './fixtures/vocabulary';
import { vocabularyPages } from '../scripts/vocabulary/publication';
import { downloadVocabularyBook } from '../src/services/vocabulary/load';
import { validateVocabularyBook } from '../src/services/vocabulary/book';
import { ContentServiceHttpError } from '../src/services/grammarTopics/service';
import { getVocabularyBook, putVocabularyBook } from '../src/storage/vocabularyBook';
import { db } from '../src/storage/db';
import { freshSettingsStorage, restoreSettingsStorage, serviceOn } from './fixtures/contentServiceSettings';
const originalFetch = globalThis.fetch;
beforeEach(async () => {
  await freshDb();
  freshSettingsStorage();
  serviceOn('https://content.test');
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreSettingsStorage();
});
test('pinned pages accumulate only in memory; one validated committed cache, no learner information in requests', async () => {
  const book = await testBook(251),
    pages = vocabularyPages(book);
  const urls: string[] = [],
    counts: number[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    urls.push(url);
    expect(init.credentials).toBe('omit');
    counts.push(await (await db()).count('cache'));
    return Response.json(pages[urls.length - 1]);
  }) as typeof fetch;
  expect(await downloadVocabularyBook(() => {})).toEqual(book);
  expect(counts).toEqual([0, 0]);
  expect(urls).toEqual([
    'https://content.test/v1/vocabulary/tcf-7000?page=0',
    `https://content.test/v1/vocabulary/tcf-7000?page=1&version=${book.manifest.version}`,
  ]);
  expect(await (await db()).count('cache')).toBe(1);
  expect(await getVocabularyBook()).toEqual(book);
});
test('partial HTTP/schema/hash and real storage commit failure preserve old complete cache; retry restarts page0', async () => {
  const old = await testBook(1, 'OLD TEST'),
    next = await testBook(251, 'NEW TEST');
  await putVocabularyBook(old);
  for (const kind of ['http410', 'http429', 'schema', 'hash', 'storage'] as const) {
    const pages = vocabularyPages(structuredClone(next));
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      const index = new URL(url).searchParams.get('page') === '0' ? 0 : 1;
      if (index === 1 && kind.startsWith('http'))
        return Response.json({ error: 'TEST failure' }, { status: kind === 'http410' ? 410 : 429 });
      if (index === 1 && kind === 'schema') return Response.json({ bad: true });
      if (index === 1 && kind === 'hash') {
        pages[1].entries[0].senses[0].gloss.en = 'Changed TEST';
      }
      return Response.json(pages[index]);
    }) as typeof fetch;
    // oxlint-disable-next-line typescript/unbound-method -- Native fault injection calls with the active store and restores the method.
    const put = IDBObjectStore.prototype.put;
    if (kind === 'storage')
      IDBObjectStore.prototype.put = function (value, key) {
        const request = put.call(this, value, key);
        if (this.name === 'cache') request.addEventListener('success', () => this.transaction.abort());
        return request;
      };
    try {
      const error = await failure(downloadVocabularyBook(() => {}));
      expect(error, kind).toBeInstanceOf(Error);
      if (kind.startsWith('http')) expect(error).toBeInstanceOf(ContentServiceHttpError);
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    expect(await getVocabularyBook()).toEqual(old);
    expect(urls[0]).toBe('https://content.test/v1/vocabulary/tcf-7000?page=0');
    expect(await (await db()).count('cache')).toBe(1);
  }
});
test('complete cache honors 365-day TTL and hash/content uniqueness, with no book changing saved rows', async () => {
  const book = await testBook();
  await putVocabularyBook(book, 1);
  expect(await getVocabularyBook(365 * 86_400_000 + 2)).toBeUndefined();
  const duplicate = structuredClone(book);
  duplicate.entries.push(duplicate.entries[0]);
  expect(await failure(validateVocabularyBook(duplicate))).toBeInstanceOf(Error);
  expect(await (await db()).count('vocab')).toBe(0);
});
