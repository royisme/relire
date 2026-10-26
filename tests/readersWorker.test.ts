/** Reader HTTP matrix on real migrations and invented TEST artifacts; no publisher, no learner data. */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { PublishedReaderSchema, type PublishedReader } from '../src/types/gradedReader';
import { handle, type Env } from '../worker/src/index';
import { createWorkerDb, workerRequest } from './fixtures/workerDb';
import { gradedReaderFixture } from './fixtures/gradedReaders';

let sqlite: Database;
let env: Env;

const hash = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
const request = (path: string, init?: RequestInit) => handle(workerRequest(`https://content.test${path}`, init), env);

function readerFixture(): PublishedReader {
  const body = gradedReaderFixture();
  const contentHash = hash(JSON.stringify(body));
  return PublishedReaderSchema.parse({
    schemaVersion: 1,
    body,
    version: contentHash,
    review: { contentHash, reviewedBy: 'TEST reviewer', reviewedAt: '2026-01-01' },
  });
}

/** Stages an artifact the way the publisher will: exact row, marker, catalogue and current pointer. */
function publish(readers: PublishedReader[]) {
  const catalogueHash = hash(`TEST catalogue ${readers.map((reader) => reader.version).join(',')}`);
  for (const reader of readers) {
    const artifactHash = hash(JSON.stringify(reader));
    sqlite
      .query('INSERT INTO readers (id, artifact_hash, body_version, stage_order, body) VALUES (?, ?, ?, ?, ?)')
      .run(reader.body.id, artifactHash, reader.version, reader.body.order, JSON.stringify(reader));
    sqlite
      .query('INSERT INTO meta (key, value) VALUES (?, ?)')
      .run(
        `readerPublished:${reader.body.id}:${artifactHash}`,
        JSON.stringify({ artifactHash, bodyVersion: reader.version }),
      );
  }
  const catalogue = {
    schemaVersion: 1,
    syllabusVersion: '1.0.0',
    version: catalogueHash,
    readers: readers.map((reader) => ({
      id: reader.body.id,
      order: reader.body.order,
      level: reader.body.level,
      title: reader.body.title,
      version: reader.version,
      artifactHash: hash(JSON.stringify(reader)),
      sentenceCount: reader.body.sentences.length,
      newWordCount: reader.body.glossary.length,
    })),
  };
  sqlite
    .query('INSERT INTO meta (key, value) VALUES (?, ?)')
    .run(`readersCatalog:${catalogueHash}`, JSON.stringify(catalogue));
  sqlite.query("INSERT INTO meta (key, value) VALUES ('readersCurrent', ?)").run(catalogueHash);
  return { catalogue, catalogueHash };
}

beforeEach(async () => {
  const created = await createWorkerDb();
  sqlite = created.db;
  env = created.env;
});
afterEach(() => sqlite.close());

describe('reader routes', () => {
  test('no current catalogue is 404 readers-unavailable, not fabricated content', async () => {
    const list = await request('/v1/readers');
    expect(list.status).toBe(404);
    expect(await list.json()).toEqual({ error: 'readers-unavailable' });
    const artifact = await request(`/v1/readers/${gradedReaderFixture().id}?version=${'a'.repeat(64)}`);
    expect(artifact.status).toBe(404);
    expect(await artifact.json()).toEqual({ error: 'not-found' });
  });

  test('catalogue and artifact are the exact stored JSON with private revalidation', async () => {
    const reader = readerFixture();
    const { catalogue, catalogueHash } = publish([reader]);
    const list = await request('/v1/readers');
    expect(list.status).toBe(200);
    expect(list.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(list.headers.get('Vary')).toBe('Origin, Authorization');
    expect(list.headers.get('ETag')).toBe(`"${catalogueHash}"`);
    expect(await list.json()).toEqual(catalogue);

    const artifactHash = catalogue.readers[0]!.artifactHash;
    const response = await request(`/v1/readers/${reader.body.id}?version=${artifactHash}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(response.headers.get('Vary')).toBe('Origin, Authorization');
    expect(response.headers.get('ETag')).toBe(`"${artifactHash}"`);
    expect(await response.json()).toEqual(reader);
    expect(
      PublishedReaderSchema.parse(
        await (await request(`/v1/readers/${reader.body.id}?version=${artifactHash}`)).json(),
      ),
    ).toEqual(reader);
  });

  test('ETag, If-None-Match and HEAD behave like the other resources', async () => {
    const reader = readerFixture();
    const { catalogueHash } = publish([reader]);
    const artifactHash = hash(JSON.stringify(reader));
    for (const [path, etag] of [
      ['/v1/readers', catalogueHash],
      [`/v1/readers/${reader.body.id}?version=${artifactHash}`, artifactHash],
    ] as const) {
      const get = await request(path);
      const cached = await request(path, { headers: { 'If-None-Match': `W/"${etag}"` } });
      expect(cached.status).toBe(304);
      expect(await cached.text()).toBe('');
      expect(cached.headers.get('ETag')).toBe(get.headers.get('ETag'));
      expect(cached.headers.get('Cache-Control')).toBe('private, no-cache');
      expect(cached.headers.get('Vary')).toBe('Origin, Authorization');
      const head = await request(path, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect([...head.headers]).toEqual([...get.headers]);
      expect(await head.text()).toBe('');
    }
  });

  test('malformed ids and query arguments return 400 without D1 reads', async () => {
    const prepare = spyOn(env.DB, 'prepare');
    for (const id of ['', 'TEST', 'test--only', '-test', 'test_', '%27%20OR%201=1', 'test/only']) {
      const response = await request(`/v1/readers/${id}?version=${'a'.repeat(64)}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-id' });
    }
    for (const query of [
      '',
      '?version=',
      '?version=ABC',
      `?version=${'a'.repeat(63)}`,
      `?version=${'a'.repeat(64)}&version=${'a'.repeat(64)}`,
      `?version=${'a'.repeat(64)}&extra=1`,
      `?page=0`,
    ]) {
      const response = await request(`/v1/readers/test-book${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-query' });
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  test('unknown id is 404, unpublished artifact of a known id is 410', async () => {
    const reader = readerFixture();
    const { catalogue } = publish([reader]);
    const unknown = await request(`/v1/readers/test-absent?version=${catalogue.readers[0]!.artifactHash}`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not-found' });
    const gone = await request(`/v1/readers/${reader.body.id}?version=${'b'.repeat(64)}`);
    expect(gone.status).toBe(410);
    expect(await gone.json()).toEqual({ error: 'version-unavailable' });
    expect(gone.headers.get('Cache-Control')).toBe('no-store');
  });

  test('missing or corrupt marked data is a fixed 500 without SQL or content', async () => {
    const reader = readerFixture();
    const { catalogue } = publish([reader]);
    const artifactHash = catalogue.readers[0]!.artifactHash;
    const path = `/v1/readers/${reader.body.id}?version=${artifactHash}`;
    const body = JSON.stringify(reader);
    sqlite.query('UPDATE readers SET body = ? WHERE artifact_hash = ?').run('not json', artifactHash);
    expect((await request(path)).status).toBe(500);
    sqlite
      .query('UPDATE readers SET body = ? WHERE artifact_hash = ?')
      .run(body.replace(reader.body.id, 'other-id'), artifactHash);
    expect((await request(path)).status).toBe(500);
    sqlite.query('DELETE FROM readers WHERE artifact_hash = ?').run(artifactHash);
    expect((await request(path)).status).toBe(500);
    sqlite.query('UPDATE meta SET value = ? WHERE key LIKE ?').run('{}', 'readerPublished:%');
    expect((await request(path)).status).toBe(500);
    sqlite.query("UPDATE meta SET value = 'not json' WHERE key = 'readersCurrent'").run();
    const corrupt = await request('/v1/readers');
    expect(corrupt.status).toBe(500);
    expect(await corrupt.json()).toEqual({ error: 'unavailable' });
  });

  test('methods, OPTIONS, CORS and the shared limiter are unchanged', async () => {
    const reader = readerFixture();
    const { catalogueHash } = publish([reader]);
    const artifactHash = hash(JSON.stringify(reader));
    env.ALLOWED_ORIGINS = 'https://app.test';
    for (const path of ['/v1/readers', `/v1/readers/${reader.body.id}?version=${artifactHash}`]) {
      const get = await request(path, { headers: { Origin: 'https://app.test' } });
      expect(get.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
      const post = await request(path, { method: 'POST' });
      expect(post.status).toBe(405);
      expect(post.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
      expect((await request(path, { method: 'OPTIONS' })).status).toBe(204);
    }
    expect(catalogueHash).toHaveLength(64);
    env.RATE_LIMITER = { limit: async () => ({ success: false }) };
    const limited = await request('/v1/readers');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate-limited' });
  });

  test('topics, tag index and vocabulary routes are unaffected', async () => {
    publish([readerFixture()]);
    expect(await (await request('/v1/topics')).json()).toEqual([]);
    expect(await (await request('/v1/tag-index')).json()).toEqual({});
    expect((await request('/v1/vocabulary/tcf-7000?page=0')).status).toBe(404);
    expect((await request('/v1/readers-other')).status).toBe(404);
  });
});
