/** Reader transport/cache boundary with mocked fetch and disposable IndexedDB; all prose is invented TEST content. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { canonicalVocabularyJson, vocabularyHash } from '../src/services/vocabulary/book';
import { loadReaderCatalogue, loadRemoteReader, keepReaderOffline } from '../src/services/gradedReaders/service';
import { readerSummary, mergeReaderCatalogue, validateReaderCatalogue } from '../src/services/gradedReaders/catalogue';
import { resolveReaderEdition } from '../src/services/gradedReaders/edition';
import { loadStarterReaders, resetStarterReadersForTests } from '../src/services/gradedReaders/load';
import { db } from '../src/storage/db';
import { openReaderEdition } from '../src/storage/gradedReaders';
import { ContentServiceHttpError, ContentServiceNetworkError } from '../src/services/grammarTopics/service';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
const reader = publishedReaderFixture();
let entry = await readerSummary(reader);
async function catalogueFor(readers = [entry]) {
  const body = { schemaVersion: 1 as const, syllabusVersion: '1.0.0', readers };
  return { ...body, version: await vocabularyHash(body) };
}
const artifactResponse = () => new Response(canonicalVocabularyJson(reader));
beforeEach(async () => {
  await freshDb();
  resetStarterReadersForTests();
  process.env.VITE_CONTENT_SERVICE_URL = 'https://content.test';
  entry = await readerSummary(reader);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetStarterReadersForTests();
  if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
  else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
});

test('catalogue and exact pinned artifact use credential-free timed GETs, URL/hash cache keys and no learner data', async () => {
  const catalogue = await catalogueFor();
  const urls: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    urls.push(url);
    expect(init.credentials).toBe('omit');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBeUndefined();
    return url.endsWith('/v1/readers') ? Response.json(catalogue) : artifactResponse();
  }) as typeof fetch;
  expect(await loadReaderCatalogue()).toEqual({ catalogue, saved: false });
  expect(await loadRemoteReader(entry)).toEqual(reader);
  expect(urls).toEqual([
    'https://content.test/v1/readers',
    `https://content.test/v1/readers/${entry.id}?version=${entry.artifactHash}`,
  ]);
  const keys = (await (await db()).getAll('cache')).map((row) => row.key);
  expect(keys).toContain(`content:https://content.test/v1/readers?version=${catalogue.version}`);
  expect(keys).toContain(`content:${urls[1]}`);
  expect(await (await db()).count('meta')).toBe(0);
});

test('network failure alone can use a validated saved catalogue and exact artifact, never another service URL', async () => {
  const catalogue = await catalogueFor();
  globalThis.fetch = (async (url: string) =>
    url.endsWith('/v1/readers') ? Response.json(catalogue) : artifactResponse()) as typeof fetch;
  await loadReaderCatalogue();
  await loadRemoteReader(entry);
  globalThis.fetch = (async (_url: string): Promise<Response> => {
    throw new TypeError('TEST network offline');
  }) as typeof fetch;
  expect(await loadReaderCatalogue()).toEqual({ catalogue, saved: true });
  expect(await loadRemoteReader(entry)).toEqual(reader);
  process.env.VITE_CONTENT_SERVICE_URL = 'https://other.test';
  expect(await failure(loadReaderCatalogue())).toMatchObject({ message: 'TEST network offline' });
  expect(await failure(loadRemoteReader(entry))).toBeInstanceOf(ContentServiceNetworkError);
});

for (const kind of ['http404', 'http429', 'http500', 'json', 'schema', 'hash']) {
  test(`${kind} never falls back to previously cached catalogue/artifact`, async () => {
    const catalogue = await catalogueFor();
    globalThis.fetch = (async (url: string) =>
      url.endsWith('/v1/readers') ? Response.json(catalogue) : artifactResponse()) as typeof fetch;
    await loadReaderCatalogue();
    await loadRemoteReader(entry);
    const status = Number(kind.slice(4));
    globalThis.fetch = (async (_url: string) =>
      kind.startsWith('http')
        ? Response.json({ error: 'TEST rejected' }, { status })
        : kind === 'json'
          ? new Response('TEST not JSON')
          : kind === 'schema'
            ? Response.json({ privateField: 'TEST forbidden' })
            : Response.json({ ...catalogue, version: 'a'.repeat(64) })) as typeof fetch;
    const listError = await failure(loadReaderCatalogue());
    expect(listError).toBeInstanceOf(Error);
    if (kind.startsWith('http')) expect(listError).toBeInstanceOf(ContentServiceHttpError);
    if (!kind.startsWith('http')) {
      // Supply a matching exact-artifact hash for malformed JSON/schema to exercise those boundaries too.
      const text =
        kind === 'json'
          ? 'TEST not JSON'
          : kind === 'schema'
            ? '{"privateField":"TEST forbidden"}'
            : canonicalVocabularyJson(reader) + ' ';
      const hash = new Bun.CryptoHasher('sha256').update(text).digest('hex');
      globalThis.fetch = (async (_url: string) => new Response(text)) as typeof fetch;
      const target = kind === 'hash' ? entry : { ...entry, artifactHash: hash };
      expect(await failure(loadRemoteReader(target))).toBeInstanceOf(Error);
    } else expect(await failure(loadRemoteReader(entry))).toBeInstanceOf(ContentServiceHttpError);
  });
}

test('body hash and requested identity are checked even with an authentic artifact hash', async () => {
  const changed = structuredClone(reader);
  changed.body.title.en = 'TEST changed';
  const text = canonicalVocabularyJson(changed);
  globalThis.fetch = (async (_url: string) => new Response(text)) as typeof fetch;
  expect(await failure(loadRemoteReader({ ...entry, artifactHash: await vocabularyHash(changed) }))).toMatchObject({
    message: 'Reader body hash mismatch',
  });
  globalThis.fetch = (async (_url: string) => artifactResponse()) as typeof fetch;
  expect(await failure(loadRemoteReader({ ...entry, id: 'test-other' }))).toMatchObject({
    message: 'Reader artifact does not match catalogue',
  });
});

test('tampered saved entries are revalidated, not trusted after a network failure', async () => {
  const catalogue = await catalogueFor();
  globalThis.fetch = (async (url: string) =>
    url.endsWith('/v1/readers') ? Response.json(catalogue) : artifactResponse()) as typeof fetch;
  await loadReaderCatalogue();
  await loadRemoteReader(entry);
  const database = await db();
  for (const row of await database.getAll('cache'))
    if (row.key.includes('?version=')) await database.put('cache', { ...row, value: 'TEST corrupted cache' });
  globalThis.fetch = (async (_url: string): Promise<Response> => {
    throw new TypeError('TEST offline');
  }) as typeof fetch;
  expect(await failure(loadReaderCatalogue())).toBeInstanceOf(Error);
  expect(await failure(loadRemoteReader(entry))).toMatchObject({ message: 'Reader artifact hash mismatch' });
});

test('identical in-flight list and artifact requests share GETs; explicit retry issues a new GET', async () => {
  const catalogue = await catalogueFor();
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls++;
    await Bun.sleep(5);
    return url.endsWith('/v1/readers') ? Response.json(catalogue) : artifactResponse();
  }) as typeof fetch;
  await Promise.all([loadReaderCatalogue(), loadReaderCatalogue()]);
  expect(calls).toBe(1);
  await Promise.all([loadRemoteReader(entry), loadRemoteReader(entry)]);
  expect(calls).toBe(2);
  await loadReaderCatalogue();
  expect(calls).toBe(3);
});

test('Keep offline propagates a real transaction abort, while ordinary disposable caching remains nonfatal', async () => {
  globalThis.fetch = (async (_url: string) => artifactResponse()) as typeof fetch;
  // oxlint-disable-next-line typescript/unbound-method -- Native fault injection restores the original method.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (this.name === 'cache') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(await loadRemoteReader(entry)).toEqual(reader);
    expect(await failure(keepReaderOffline(entry))).toBeInstanceOf(Error);
    expect(await (await db()).count('cache')).toBe(0);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  await keepReaderOffline(entry);
  expect(await (await db()).count('cache')).toBe(1);
});

test('bundle precedence deduplicates exact editions and surfaces conflicts without replacement', async () => {
  const changed = { ...entry, artifactHash: 'b'.repeat(64) };
  const remote = { ...entry, id: 'test-remote', order: 2 };
  expect(mergeReaderCatalogue([entry], [entry, remote])).toEqual({ readers: [entry, remote], conflicts: [] });
  expect(mergeReaderCatalogue([entry], [changed, remote])).toEqual({ readers: [entry, remote], conflicts: [changed] });
  await loadStarterReaders({ schemaVersion: 1, syllabusVersion: '1.0.0', readers: [reader] });
  globalThis.fetch = (async (_url: string): Promise<Response> => {
    throw new Error('TEST bundle must never fetch');
  }) as typeof fetch;
  expect(await resolveReaderEdition(entry.id)).toEqual(reader);
  expect(await resolveReaderEdition(entry.id, 'b'.repeat(64))).toBeUndefined();
});

test('no service fetches nothing; exact opened snapshot survives service loss with no TTL', async () => {
  await loadStarterReaders({ schemaVersion: 1, syllabusVersion: '1.0.0', readers: [] });
  delete process.env.VITE_CONTENT_SERVICE_URL;
  globalThis.fetch = (async (_url: string): Promise<Response> => {
    throw new Error('TEST unexpected network');
  }) as typeof fetch;
  expect(await resolveReaderEdition('test-unavailable')).toBeUndefined();
  await openReaderEdition(reader, 1);
  expect(await resolveReaderEdition(reader.body.id, reader.version)).toEqual(reader);
});

test('remote body-version routes pin the catalogue artifact and never substitute a different reader', async () => {
  await loadStarterReaders({ schemaVersion: 1, syllabusVersion: '1.0.0', readers: [] });
  const catalogue = await catalogueFor();
  globalThis.fetch = (async (url: string) =>
    url.endsWith('/v1/readers') ? Response.json(catalogue) : artifactResponse()) as typeof fetch;
  expect(await resolveReaderEdition(entry.id, reader.version)).toEqual(reader);
  expect(await resolveReaderEdition('test-missing')).toBeUndefined();
  expect(await resolveReaderEdition(entry.id, 'b'.repeat(64))).toBeUndefined();
  globalThis.fetch = (async (_url: string) =>
    Response.json({ error: 'TEST unavailable' }, { status: 503 })) as typeof fetch;
  expect(await failure(resolveReaderEdition('test-missing'))).toMatchObject({ message: 'HTTP 503: TEST unavailable' });
});

test('Keep offline propagates QuotaExceededError and preserves an already saved copy', async () => {
  globalThis.fetch = (async (_url: string) => artifactResponse()) as typeof fetch;
  await keepReaderOffline(entry);
  const before = await (await db()).getAll('cache');
  // oxlint-disable-next-line typescript/unbound-method -- Native quota fault injection restores the original method.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'cache') throw new DOMException('TEST quota full', 'QuotaExceededError');
    return put.call(this, value, key);
  };
  try {
    expect(await failure(keepReaderOffline(entry))).toMatchObject({
      name: 'QuotaExceededError',
      message: 'TEST quota full',
    });
    expect(await (await db()).getAll('cache')).toEqual(before);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
});

test('empty valid catalogue is ready, duplicate ids/order and hash mismatch fail closed', async () => {
  const catalogue = await catalogueFor([]);
  globalThis.fetch = (async (_url: string) => Response.json(catalogue)) as typeof fetch;
  expect(await loadReaderCatalogue()).toEqual({ catalogue, saved: false });
  expect(await failure(validateReaderCatalogue(await catalogueFor([entry, entry])))).toBeInstanceOf(Error);
  expect(await failure(validateReaderCatalogue({ ...catalogue, version: 'b'.repeat(64) }))).toMatchObject({
    message: 'Reader catalogue hash mismatch',
  });
});
