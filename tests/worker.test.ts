/** Owns Worker HTTP contract checks with real SQLite migrations and synthetic TEST-only topics. */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { GrammarTopicSchema, type GrammarTopic } from '../src/types/grammarTopic';
import { GrammarTagIndexSchema } from '../src/types/grammarTagIndex';
import worker, { handle, type Env } from '../worker/src/index';
import { topicFixture } from './fixtures/grammarTopics';
import { createWorkerDb, workerRequest, WORKER_ACCESS_KEY } from './fixtures/workerDb';

let db: Database;
let env: Env;

function insert(input: GrammarTopic, position = 1) {
  const topic = GrammarTopicSchema.parse(input);
  const body = JSON.stringify(topic);
  db.query(
    'INSERT INTO topics (id, chapter, level, title_en, title_zh, tags, body, content_hash, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    topic.id,
    topic.chapter,
    topic.level,
    topic.title.en,
    topic.title.zh,
    JSON.stringify(topic.tags),
    body,
    new Bun.CryptoHasher('sha256').update(body).digest('hex'),
    position,
  );
  return topic;
}

const request = (path: string, init?: RequestInit) => handle(workerRequest(`https://content.test${path}`, init), env);

beforeEach(async () => {
  ({ db, env } = await createWorkerDb());
});
afterEach(() => db.close());

describe('topic routes', () => {
  test('empty pack has no fabricated content', async () => {
    expect(await (await request('/v1/topics')).json()).toEqual([]);
    expect(await (await request('/v1/tag-index')).json()).toEqual({});
  });

  test('list contains summaries only, ordered by position even when it disagrees with chapter and id order', async () => {
    const topics = [
      insert({ ...topicFixture(), id: 'test-z', chapter: 'test-b' }, 2),
      insert({ ...topicFixture(), id: 'test-b', chapter: 'test-a' }, 3),
      insert({ ...topicFixture(), id: 'test-a', chapter: 'test-a' }, 1),
    ];
    const response = await request('/v1/topics');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      [topics[2], topics[0], topics[1]].map((topic, i) => ({
        id: topic.id,
        chapter: topic.chapter,
        level: topic.level,
        tags: topic.tags,
        title: topic.title,
        position: i + 1,
      })),
    );
    for (const row of body) expect(Number.isInteger(row.position) && row.position > 0).toBe(true);
  });

  test('one topic is the complete stored JSON, and every returned topic passes the real schema', async () => {
    const topics = [insert(topicFixture()), insert({ ...topicFixture(), id: 'test-second' })];
    for (const topic of topics) {
      const response = await request(`/v1/topics/${topic.id}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(topic);
      expect(GrammarTopicSchema.parse(body)).toEqual(topic);
    }
    expect(worker.fetch).toBe(handle);
  });

  test('unknown topic and route return 404 JSON', async () => {
    for (const path of ['/v1/topics/test-absent', '/v1/unknown', '/v1/other', '/admin', '/v1/tag-index/']) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not-found' });
    }
  });

  test('malformed topic ids return 400 without querying D1', async () => {
    const prepareSpy = spyOn(env.DB, 'prepare');
    for (const id of ['', 'TEST', 'test--only', '-test', 'test_', '%27%20OR%201=1', 'test/only']) {
      const response = await request(`/v1/topics/${id}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-id' });
    }
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  test('tag index derives only covered tags with ascending topic ids and passes the app schema', async () => {
    insert({ ...topicFixture(), id: 'test-z', tags: ['articles', 'negation'] });
    insert({ ...topicFixture(), id: 'test-a' });
    const response = await request('/v1/tag-index');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ articles: ['test-a', 'test-z'], negation: ['test-z'] });
    expect(GrammarTagIndexSchema.parse(body)).toEqual(body);
  });
});

describe('access keys', () => {
  test('unset, empty and comma-only key lists fail closed without D1 reads', async () => {
    const prepare = spyOn(env.DB, 'prepare');
    for (const keys of [undefined, '', ' , , ']) {
      env.ACCESS_KEYS = keys;
      const response = await request('/v1/topics');
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('{"error":"unauthorized"}');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  test('missing, wrong and malformed bearer keys return 401 with CORS and a challenge, including HEAD', async () => {
    env.ALLOWED_ORIGINS = 'https://app.test';
    const prepare = spyOn(env.DB, 'prepare');
    for (const authorization of [undefined, 'Bearer TEST-wrong-key', `Basic ${WORKER_ACCESS_KEY}`, 'Bearer']) {
      for (const method of ['GET', 'HEAD']) {
        const headers = new Headers({ Origin: 'https://app.test' });
        if (authorization) headers.set('Authorization', authorization);
        const response = await handle(new Request('https://content.test/v1/topics', { method, headers }), env);
        expect(response.status).toBe(401);
        expect(await response.text()).toBe(method === 'HEAD' ? '' : '{"error":"unauthorized"}');
        expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
        expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, If-None-Match');
        expect(response.headers.get('Vary')).toBe('Origin, Authorization');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
      }
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  test('the Bearer scheme is case-insensitive and accepts several separating spaces', async () => {
    for (const authorization of [`bearer ${WORKER_ACCESS_KEY}`, `BEARER   ${WORKER_ACCESS_KEY}`]) {
      const response = await request('/v1/topics', { headers: { Authorization: authorization } });
      expect(response.status).toBe(200);
    }
  });

  test('both trimmed keys work, empty entries are ignored, and removing a key revokes it', async () => {
    const second = 'TEST-only-second-service-key-not-a-secret';
    env.ACCESS_KEYS = ` , ${WORKER_ACCESS_KEY} , , ${second}, `;
    for (const key of [WORKER_ACCESS_KEY, second]) {
      const response = await request('/v1/topics', { headers: { Authorization: `Bearer ${key}` } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    }
    env.ACCESS_KEYS = second;
    expect((await request('/v1/topics')).status).toBe(401);
    expect((await request('/v1/topics', { headers: { Authorization: `Bearer ${second}` } })).status).toBe(200);
  });

  test('matching validators cannot bypass missing, wrong or revoked keys on any resource route', async () => {
    const prepare = spyOn(env.DB, 'prepare');
    env.ACCESS_KEYS = 'TEST-only-replacement-service-key';
    for (const path of [
      '/v1/topics',
      '/v1/topics/test-only',
      '/v1/tag-index',
      '/v1/vocabulary/tcf-7000?page=0',
      '/v1/readers',
      `/v1/readers/test-book?version=${'a'.repeat(64)}`,
    ]) {
      for (const key of [undefined, 'TEST-wrong-key', WORKER_ACCESS_KEY]) {
        const headers = new Headers({ 'If-None-Match': '*' });
        if (key) headers.set('Authorization', `Bearer ${key}`);
        const response = await handle(new Request(`https://content.test${path}`, { headers }), env);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'unauthorized' });
        expect(response.headers.has('ETag')).toBe(false);
      }
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  test('a real matching ETag revalidates only with a still-authorized key', async () => {
    const original = await request('/v1/topics');
    const etag = original.headers.get('ETag')!;
    env.ACCESS_KEYS = 'TEST-only-replacement-service-key';
    for (const key of [undefined, 'TEST-wrong-key', WORKER_ACCESS_KEY, env.ACCESS_KEYS]) {
      const headers = new Headers({ 'If-None-Match': etag });
      if (key) headers.set('Authorization', `Bearer ${key}`);
      const response = await handle(new Request('https://content.test/v1/topics', { headers }), env);
      expect(response.status).toBe(key === env.ACCESS_KEYS ? 304 : 401);
      expect(await response.text()).toBe(key === env.ACCESS_KEYS ? '' : '{"error":"unauthorized"}');
      expect(response.headers.get('Cache-Control')).toBe(key === env.ACCESS_KEYS ? 'private, no-cache' : 'no-store');
      expect(response.headers.get('Vary')).toBe('Origin, Authorization');
    }
  });

  test('a failed guess consumes the IP limit before a valid key or preflight can pass', async () => {
    let attempts = 0;
    const limit = spyOn({ limit: async (_options: { key: string }) => ({ success: ++attempts === 1 }) }, 'limit');
    env.RATE_LIMITER = { limit };
    const headers = { 'CF-Connecting-IP': '192.0.2.2', Authorization: 'Bearer TEST-wrong-key' };
    expect((await request('/v1/topics', { headers })).status).toBe(401);
    expect(
      (await request('/v1/topics', { headers: { ...headers, Authorization: `Bearer ${WORKER_ACCESS_KEY}` } })).status,
    ).toBe(429);
    expect((await request('/v1/topics', { method: 'OPTIONS', headers })).status).toBe(429);
    expect(limit.mock.calls).toEqual(Array.from({ length: 3 }, () => [{ key: '192.0.2.2' }]));
  });
});

describe('HTTP caching and HEAD', () => {
  test('all three routes use the pack version, JSON content type and private revalidation', async () => {
    insert(topicFixture());
    for (const path of ['/v1/topics', '/v1/topics/test-only', '/v1/tag-index']) {
      const response = await request(path);
      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
      expect(response.headers.get('Vary')).toBe('Origin, Authorization');
      expect(response.headers.get('ETag')).toBe('"0.0.0"');
      const cached = await request(path, { headers: { 'If-None-Match': '"0.0.0"' } });
      expect(cached.status).toBe(304);
      expect(await cached.text()).toBe('');
      expect(cached.headers.get('ETag')).toBe(response.headers.get('ETag'));
      expect(cached.headers.get('Cache-Control')).toBe(response.headers.get('Cache-Control'));
    }
    db.query("UPDATE meta SET value = '0.0.1' WHERE key = 'packVersion'").run();
    const changed = await request('/v1/topics', { headers: { 'If-None-Match': '"0.0.0"' } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).toBe('"0.0.1"');
  });

  test('If-None-Match accepts weak validators, lists and wildcard, but cannot hide a 404', async () => {
    for (const value of ['W/"0.0.0"', '"other", W/"0.0.0"', '*']) {
      expect((await request('/v1/topics', { headers: { 'If-None-Match': value } })).status).toBe(304);
    }
    expect((await request('/v1/topics/test-absent', { headers: { 'If-None-Match': '*' } })).status).toBe(404);
  });

  test('HEAD has GET status and headers but never a body, including errors and 304', async () => {
    insert(topicFixture());
    for (const path of [
      '/v1/topics',
      '/v1/topics/test-only',
      '/v1/tag-index',
      '/v1/topics/test-absent',
      '/v1/topics/TEST',
    ]) {
      const get = await request(path);
      const head = await request(path, { method: 'HEAD' });
      expect(head.status).toBe(get.status);
      expect([...head.headers]).toEqual([...get.headers]);
      expect(await head.text()).toBe('');
    }
    const cached = await request('/v1/topics', { method: 'HEAD', headers: { 'If-None-Match': '*' } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
  });
});

describe('CORS and allowed methods', () => {
  test('exact allowed origins are echoed; other, missing and empty allowlists get no CORS access', async () => {
    env.ALLOWED_ORIGINS = ' https://app.test , https://second.test ';
    for (const origin of ['https://app.test', 'https://second.test', 'https://app.test.evil.test', undefined]) {
      const response = await request('/v1/topics', origin ? { headers: { Origin: origin } } : undefined);
      const allowed = origin === 'https://app.test' || origin === 'https://second.test';
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowed ? origin : null);
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe(allowed ? 'ETag, Retry-After' : null);
      expect(response.headers.get('Vary')).toBe('Origin, Authorization');
    }
    env.ALLOWED_ORIGINS = '';
    expect(
      (await request('/v1/topics', { headers: { Origin: 'https://app.test' } })).headers.has(
        'Access-Control-Allow-Origin',
      ),
    ).toBe(false);
  });

  test('preflight is 204 without a key and permits authorized conditional GET only for allowed origins', async () => {
    env.ALLOWED_ORIGINS = 'https://app.test';
    delete env.ACCESS_KEYS;
    const prepareSpy = spyOn(env.DB, 'prepare');
    for (const origin of ['https://app.test', 'https://denied.test']) {
      const response = await handle(
        new Request('https://content.test/v1/topics', {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Authorization, If-None-Match',
          },
        }),
        env,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
        origin === 'https://app.test' ? 'GET, HEAD, OPTIONS' : null,
      );
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
        origin === 'https://app.test' ? 'Authorization, If-None-Match' : null,
      );
    }
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  test('write methods are 405 with Allow and CORS, before auth or limiting and without database access', async () => {
    env.ALLOWED_ORIGINS = 'https://app.test';
    delete env.ACCESS_KEYS;
    const limit = spyOn({ limit: async () => ({ success: false }) }, 'limit');
    env.RATE_LIMITER = { limit };
    const prepareSpy = spyOn(env.DB, 'prepare');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await handle(
        new Request('https://content.test/v1/topics/test-only', { method, headers: { Origin: 'https://app.test' } }),
        env,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'method-not-allowed' });
    }
    expect(limit).not.toHaveBeenCalled();
    expect(prepareSpy).not.toHaveBeenCalled();
  });
});

describe('rate limiting and failures', () => {
  test('limiter uses the connecting IP or a constant and rejects without reading D1', async () => {
    const limit = spyOn({ limit: async (_options: { key: string }) => ({ success: false }) }, 'limit');
    env.RATE_LIMITER = { limit };
    env.ALLOWED_ORIGINS = 'https://app.test';
    const prepareSpy = spyOn(env.DB, 'prepare');
    const response = await request('/v1/topics', {
      headers: { 'CF-Connecting-IP': '192.0.2.1', Origin: 'https://app.test' },
    });
    expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate-limited' });
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    const head = await request('/v1/topics', { method: 'HEAD' });
    expect(head.status).toBe(429);
    expect(await head.text()).toBe('');
    expect(limit).toHaveBeenLastCalledWith({ key: 'unknown' });
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  test('successful limiter and absent limiter both allow reads', async () => {
    env.RATE_LIMITER = { limit: async () => ({ success: true }) };
    expect((await request('/v1/topics')).status).toBe(200);
    delete env.RATE_LIMITER;
    expect((await request('/v1/topics')).status).toBe(200);
  });

  test('D1 failure is 500 with a fixed log message, never SQL, request details or a stack trace', async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Synthetic failure text probes accidental logging of SQL and request data.
      spyOn(env.DB, 'prepare').mockImplementation(() => {
        throw new Error('TEST ONLY: SELECT body FROM topics; 192.0.2.1');
      });
      env.ALLOWED_ORIGINS = 'https://app.test';
      const response = await request('/v1/topics', { headers: { Origin: 'https://app.test' } });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('{"error":"unavailable"}');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
      expect(log.mock.calls).toEqual([['Content service unavailable']]);
      expect(await (await request('/v1/topics', { method: 'HEAD' })).text()).toBe('');
    } finally {
      log.mockRestore();
    }
  });
});
