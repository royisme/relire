/** Owns the lexicon routes of the Worker: real migrations, rows from the invented CSV through the real importer, schema-checked responses. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle, type Env } from '../worker/src/index';
import { lexiconStatements } from '../scripts/lexicon/import';
import { entryRow, loadLexicon, parseAllowlist, type Lexicon } from '../scripts/lexicon/lexicon';
import {
  LexiconFormResponseSchema,
  LexiconLemmaResponseSchema,
  type LexiconFormResponse,
  type LexiconLemmaResponse,
} from '../src/types/lexicon';
import { ALLOWLIST, writeMorphalouFixture } from './fixtures/morphalouCsv';
import { createWorkerDb, workerRequest } from './fixtures/workerDb';

const SOURCE = {
  name: 'Morphalou 3.1',
  maintainer: 'ATILF (CNRS / Université de Lorraine)',
  licence: 'LGPL-LR',
  url: 'http://www.cnrtl.fr/lexiques/morphalou/',
};
const VERSION = 'morphalou-3.1+test0000';

let root: string;
let lexicon: Lexicon;
let db: Database;
let env: Env;
const request = (path: string, init?: RequestInit) => handle(workerRequest(`https://content.test${path}`, init), env);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'relire-lexicon-worker-'));
  await writeMorphalouFixture(root);
  lexicon = await loadLexicon(root, new Set(parseAllowlist(ALLOWLIST)));
});
afterAll(() => rm(root, { recursive: true, force: true }));
beforeEach(async () => {
  ({ db, env } = await createWorkerDb());
  for (const statement of lexiconStatements(lexicon, VERSION)) db.exec(statement);
});
afterEach(() => db.close());

describe('/v1/lexicon/:lemma', () => {
  test('returns the stored entry, equal to the importer model, and passes the shared schema', async () => {
    const response = await request('/v1/lexicon/testmarcher');
    expect(response.status).toBe(200);
    const body = LexiconLemmaResponseSchema.parse(await response.json());
    expect(body).toEqual({
      lemma: 'testmarcher',
      entries: [{ pos: 'verb', data: JSON.parse(entryRow(lexicon.get('testmarcher\0verb')!).data) }],
      source: SOURCE,
    } satisfies LexiconLemmaResponse);
  });

  test('a noun carries its gender as stored; an adjective and a verb carry none', async () => {
    const noun = LexiconLemmaResponseSchema.parse(await (await request('/v1/lexicon/testmaison')).json());
    expect(noun.entries).toEqual([
      { pos: 'noun', gender: 'feminine', data: { singular: ['testmaison'], plural: ['testmaisons'] } },
    ]);
    const adjective = LexiconLemmaResponseSchema.parse(await (await request('/v1/lexicon/testbeau')).json());
    expect(adjective.entries[0]).not.toHaveProperty('gender');
  });

  test('every pos of a lemma is returned, ordered by pos', async () => {
    db.query("INSERT INTO lexicon_entries VALUES ('testmaison', 'adjective', NULL, '{}')").run();
    db.query("INSERT INTO lexicon_entries VALUES ('testmaison', 'verb', NULL, '{}')").run();
    const response = await request('/v1/lexicon/testmaison');
    const body = (await response.json()) as { entries: { pos: string }[] };
    expect(body.entries.map((entry) => entry.pos)).toEqual(['adjective', 'noun', 'verb']);
  });

  test('the parameter is decoded, NFC and lowercased; the stored forms keep their spelling', async () => {
    for (const [path, lemma] of [
      ['/v1/lexicon/TESTMARCHER', 'testmarcher'],
      ['/v1/lexicon/testirre%CC%81gulier', 'testirrégulier'],
      ['/v1/lexicon/TestIrr%C3%A9gulier', 'testirrégulier'],
    ]) {
      const response = await request(path);
      expect(response.status).toBe(200);
      expect(LexiconLemmaResponseSchema.parse(await response.json()).lemma).toBe(lemma);
    }
    const pronominal = await request('/v1/lexicon/se%20testlaver');
    expect(pronominal.status).toBe(200);
  });

  test('prefix remainders are decoded exactly once and retain extra path segments', async () => {
    for (const lemma of ['test%2fword', 'test/word'])
      db.query('INSERT INTO lexicon_entries VALUES (?, ?, NULL, ?)').run(lemma, 'noun', '{}');
    for (const [path, lemma] of [
      ['/v1/lexicon/test%252Fword', 'test%2fword'],
      ['/v1/lexicon/test%2Fword', 'test/word'],
      ['/v1/lexicon/test/word', 'test/word'],
    ]) {
      const response = await request(path);
      expect(response.status).toBe(200);
      expect((await response.json()).lemma).toBe(lemma);
    }
  });

  test('unknown lemma is 404 not-found, without an ETag; a lemma named form is still a lemma', async () => {
    const response = await request('/v1/lexicon/testabsent');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not-found' });
    expect(response.headers.get('ETag')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await request('/v1/lexicon/testmarcher', { headers: { 'If-None-Match': '*' } })).status).toBe(304);
    expect((await request('/v1/lexicon/testabsent', { headers: { 'If-None-Match': '*' } })).status).toBe(404);
    db.query("INSERT INTO lexicon_entries VALUES ('form', 'noun', 'masculine', '{}')").run();
    db.query("INSERT INTO lexicon_forms VALUES ('forms', 'form', 'noun')").run();
    expect(((await (await request('/v1/lexicon/form')).json()) as { lemma: string }).lemma).toBe('form');
    expect(((await (await request('/v1/lexicon/form/forms')).json()) as { form: string }).form).toBe('forms');
  });
});

describe('/v1/lexicon/form/:form', () => {
  test('returns every lemma of the form, ordered, and passes the shared schema', async () => {
    db.query("INSERT INTO lexicon_forms VALUES ('testmarche', 'testmarche', 'noun')").run();
    const response = await request('/v1/lexicon/form/testmarche');
    expect(response.status).toBe(200);
    expect(LexiconFormResponseSchema.parse(await response.json())).toEqual({
      form: 'testmarche',
      lemmas: [
        { lemma: 'testmarche', pos: 'noun' },
        { lemma: 'testmarcher', pos: 'verb' },
      ],
      source: SOURCE,
    } satisfies LexiconFormResponse);
  });

  test('the lookup key is lowercase, so an uppercase stored form and a typed capital both match', async () => {
    for (const path of ['/v1/lexicon/form/testsigle', '/v1/lexicon/form/TESTSIGLE', '/v1/lexicon/form/Testsigle']) {
      const body = LexiconFormResponseSchema.parse(await (await request(path)).json());
      expect(body).toMatchObject({ form: 'testsigle', lemmas: [{ lemma: 'testsigle', pos: 'noun' }] });
    }
    const accented = LexiconFormResponseSchema.parse(await (await request('/v1/lexicon/form/testva%CC%81')).json());
    expect(accented.lemmas).toEqual([{ lemma: 'testirrégulier', pos: 'verb' }]);
  });

  test('an unattested form is 404; a form from a tense the app lacks is not in the index', async () => {
    for (const form of ['testabsent', 'testmarchai', 'testmarchasse']) {
      const response = await request(`/v1/lexicon/form/${form}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not-found' });
    }
  });
});

describe('path parameter checks', () => {
  test('empty, malformed percent-encoding and more than 64 characters are 400 without querying D1', async () => {
    const prepare = spyOn(env.DB, 'prepare');
    for (const path of [
      '/v1/lexicon/',
      '/v1/lexicon/form/',
      '/v1/lexicon/%E0%A4%A',
      '/v1/lexicon/form/%',
      `/v1/lexicon/${'a'.repeat(65)}`,
      `/v1/lexicon/form/${'é'.repeat(65)}`,
    ]) {
      const response = await request(path);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-id' });
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  test('accents, hyphen and both apostrophes are valid: they look up and, with no row, answer 404', async () => {
    for (const word of ['aujourd-hui', "l'eau", 'l%E2%80%99eau', 'cr%C3%A8me', 'a'.repeat(64)]) {
      expect((await request(`/v1/lexicon/${word}`)).status).toBe(404);
      expect((await request(`/v1/lexicon/form/${word}`)).status).toBe(404);
    }
  });

  test('unknown paths stay 404', async () => {
    for (const path of ['/v1/lexicon', '/v1/lexicon-x']) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not-found' });
    }
  });
});

describe('caching, HEAD, methods, CORS', () => {
  test('the ETag is the lexicon version, independent of the pack version', async () => {
    for (const path of ['/v1/lexicon/testmarcher', '/v1/lexicon/form/testmarche']) {
      const response = await request(path);
      expect(response.headers.get('ETag')).toBe(`"${VERSION}"`);
      expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
      expect(response.headers.get('Vary')).toBe('Origin, Authorization');
      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      const cached = await request(path, { headers: { 'If-None-Match': `"${VERSION}"` } });
      expect(cached.status).toBe(304);
      expect(await cached.text()).toBe('');
      expect(cached.headers.get('Cache-Control')).toBe('private, no-cache');
      expect(cached.headers.get('Vary')).toBe('Origin, Authorization');
    }
    db.query("UPDATE meta SET value = '9.9.9' WHERE key = 'packVersion'").run();
    expect((await request('/v1/lexicon/testmarcher')).headers.get('ETag')).toBe(`"${VERSION}"`);
    db.query("UPDATE meta SET value = 'morphalou-3.1+other000' WHERE key = 'lexiconVersion'").run();
    const changed = await request('/v1/lexicon/testmarcher', { headers: { 'If-None-Match': `"${VERSION}"` } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).toBe('"morphalou-3.1+other000"');
  });

  test('the empty lexicon answers 404 and a topics ETag is still the pack version', async () => {
    db.exec('DELETE FROM lexicon_forms; DELETE FROM lexicon_entries;');
    db.query("UPDATE meta SET value = '0.0.0' WHERE key = 'lexiconVersion'").run();
    expect((await request('/v1/lexicon/testmarcher')).status).toBe(404);
    expect((await request('/v1/topics')).headers.get('ETag')).toBe('"0.0.0"');
  });

  test('HEAD has the GET status and headers and no body, including 404 and 400', async () => {
    for (const path of [
      '/v1/lexicon/testmarcher',
      '/v1/lexicon/form/testmarche',
      '/v1/lexicon/testabsent',
      '/v1/lexicon/',
    ]) {
      const get = await request(path);
      const head = await request(path, { method: 'HEAD' });
      expect(head.status).toBe(get.status);
      expect([...head.headers]).toEqual([...get.headers]);
      expect(await head.text()).toBe('');
    }
  });

  test('write methods are 405 with Allow, and OPTIONS preflight is 204 without reading D1', async () => {
    const prepare = spyOn(env.DB, 'prepare');
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await request('/v1/lexicon/testmarcher', { method });
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
    }
    env.ALLOWED_ORIGINS = 'https://app.test';
    const preflight = await request('/v1/lexicon/form/testmarche', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.test' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect(prepare).not.toHaveBeenCalled();
  });

  test('CORS echoes only an allowed origin', async () => {
    env.ALLOWED_ORIGINS = 'https://app.test';
    const allowed = await request('/v1/lexicon/testmarcher', { headers: { Origin: 'https://app.test' } });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect(allowed.headers.get('Access-Control-Expose-Headers')).toBe('ETag, Retry-After');
    const denied = await request('/v1/lexicon/testmarcher', { headers: { Origin: 'https://evil.test' } });
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('a rate-limited request is 429 and a D1 failure is a fixed 500 that leaks nothing', async () => {
    env.RATE_LIMITER = { limit: async () => ({ success: false }) };
    expect((await request('/v1/lexicon/testmarcher')).status).toBe(429);
    delete env.RATE_LIMITER;
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      spyOn(env.DB, 'prepare').mockImplementation(() => {
        throw new Error('TEST ONLY: SELECT data FROM lexicon_entries; 192.0.2.1');
      });
      const response = await request('/v1/lexicon/testmarcher');
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('{"error":"unavailable"}');
      expect(log.mock.calls).toEqual([['Content service unavailable']]);
    } finally {
      log.mockRestore();
    }
  });
});
