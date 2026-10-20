/** Read-only wordbook HTTP matrix on real migrations and invented immutable pages; no real service or D1. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { handle, type Env } from '../worker/src/index';
import { createWorkerDb } from './fixtures/workerDb';
import { testBook } from './fixtures/vocabulary';
import { publishVocabularyBook } from '../scripts/vocabulary/publication';
let sqlite: Database, env: Env;
const request = (query: string, init?: RequestInit) =>
  handle(new Request(`https://content.test/v1/vocabulary/${query}`, init), env);
const seed = async () => {
  const book = await testBook(251);
  await publishVocabularyBook(book, {
    execute: async (sql) => {
      sqlite.exec(sql);
    },
    read: async (sql) => sqlite.query(sql).all() as Record<string, unknown>[],
  });
  return book;
};
beforeEach(async () => {
  const created = await createWorkerDb();
  sqlite = created.db;
  env = created.env;
});
afterEach(() => sqlite.close());
test('query matrix rejects malformed/duplicate/extra arguments without D1 reads', async () => {
  const prepare = spyOn(env.DB, 'prepare');
  for (const query of [
    '',
    '?page=-1',
    '?page=1',
    '?page=01',
    '?page=1.0',
    '?page=0&page=0',
    '?page=0&extra=1',
    '?page=0&version=',
    '?page=0&version=ABC',
    `?page=0&version=${'a'.repeat(64)}&version=${'a'.repeat(64)}`,
  ]) {
    const response = await request(`tcf-7000${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-query' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  expect(prepare).not.toHaveBeenCalled();
  expect((await request('unknown?page=0')).status).toBe(404);
});
test('unavailable current404, unmarked pinned410, bounds404, corrupt required marker/page500', async () => {
  expect(await (await request('tcf-7000?page=0')).json()).toEqual({ error: 'book-unavailable' });
  const gone = await request(`tcf-7000?page=0&version=${'b'.repeat(64)}`);
  expect(gone.status).toBe(410);
  expect(await gone.json()).toEqual({ error: 'version-unavailable' });
  const book = await seed();
  const outside = await request(`tcf-7000?page=2&version=${book.manifest.version}`);
  expect(outside.status).toBe(404);
  expect(await outside.json()).toEqual({ error: 'page-not-found' });
  sqlite.query('DELETE FROM vocabulary_pages WHERE version = ? AND page = 1').run(book.manifest.version);
  expect((await request(`tcf-7000?page=1&version=${book.manifest.version}`)).status).toBe(500);
  sqlite.exec("UPDATE meta SET value = '{}' WHERE key LIKE 'vocabularyPublished:%'");
  expect((await request('tcf-7000?page=0')).status).toBe(500);
  sqlite.exec("DELETE FROM meta WHERE key LIKE 'vocabularyPublished:%'");
  expect((await request('tcf-7000?page=0')).status).toBe(500);
});
test('current no-cache, pinned public cache, ETag/HEAD/OPTIONS/methods/CORS/shared limiter preserved', async () => {
  const book = await seed();
  env.ALLOWED_ORIGINS = 'https://app.test';
  for (const pinned of [false, true]) {
    const query = `tcf-7000?page=0${pinned ? `&version=${book.manifest.version}` : ''}`;
    const get = await request(query, { headers: { Origin: 'https://app.test' } });
    expect(get.status).toBe(200);
    expect(get.headers.get('ETag')).toBe(`"${book.manifest.version}"`);
    expect(get.headers.get('Cache-Control')).toBe(pinned ? 'public, max-age=300' : 'no-cache');
    expect(get.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    const head = await request(query, { method: 'HEAD', headers: { Origin: 'https://app.test' } });
    expect([...head.headers]).toEqual([...get.headers]);
    expect(await head.text()).toBe('');
    expect((await request(query, { headers: { 'If-None-Match': `W/"${book.manifest.version}"` } })).status).toBe(304);
  }
  expect((await request('tcf-7000?page=0', { method: 'POST' })).status).toBe(405);
  expect((await request('tcf-7000?page=0', { method: 'OPTIONS' })).status).toBe(204);
  env.RATE_LIMITER = { limit: async () => ({ success: false }) };
  const limited = await request('tcf-7000?page=0');
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ error: 'rate-limited' });
});
test('unversioned pointer is read once and a concurrent switch cannot mix manifests/pages', async () => {
  const book = await seed();
  const prepare = env.DB.prepare.bind(env.DB);
  let reads = 0;
  spyOn(env.DB, 'prepare').mockImplementation((sql) => {
    const statement = prepare(sql);
    const bind = statement.bind.bind(statement);
    statement.bind = (...values) => {
      const bound = bind(...values);
      if (values[0] === 'vocabularyCurrent:tcf-7000') {
        reads++;
        const first = bound.first.bind(bound);
        bound.first = (async (...args: Parameters<typeof first>) => {
          const result = await first(...args);
          sqlite.exec(`UPDATE meta SET value = '${'b'.repeat(64)}' WHERE key = 'vocabularyCurrent:tcf-7000'`);
          return result;
        }) as typeof bound.first;
      }
      return bound;
    };
    return statement;
  });
  const response = await request('tcf-7000?page=0');
  expect(response.status).toBe(200);
  expect(reads).toBe(1);
  expect(((await response.json()) as { manifest: { version: string } }).manifest.version).toBe(book.manifest.version);
});
