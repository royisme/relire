/** Owns read-only topic and lexicon HTTP delivery; content validation and loading belong to the owner's local pipeline. */
import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import { readersResource } from './readers';
import { vocabularyResource } from './vocabulary';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  RATE_LIMITER?: RateLimit;
}

interface TopicSummaryRow {
  id: string;
  chapter: string;
  level: string;
  title_en: string;
  title_zh: string;
  tags: string;
}

// Slug shared by src/types/grammarTopic.ts via src/types/grammarTagIndex.ts; no Zod in the Worker.
const topicSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const allow = 'GET, HEAD, OPTIONS';
// What the lexicon rows come from; the notice and licence text are in worker/NOTICE.md and worker/licences.
const lexiconSource = {
  name: 'Morphalou 3.1',
  maintainer: 'ATILF (CNRS / Université de Lorraine)',
  licence: 'LGPL-LR',
  url: 'http://www.cnrtl.fr/lexiques/morphalou/',
};

// The same key rule as scripts/lexicon (NFC, lowercase). A lookup that finds nothing is a 404, so no other validation.
function lexiconKey(raw: string): string | undefined {
  try {
    const key = decodeURIComponent(raw).normalize('NFC').toLowerCase();
    return key && key.length <= 64 ? key : undefined;
  } catch {
    return undefined;
  }
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (
    origin &&
    env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .includes(origin)
  ) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', allow);
    headers.set('Access-Control-Allow-Headers', 'If-None-Match');
    headers.set('Access-Control-Expose-Headers', 'ETag, Retry-After');
  }
  const respond = (body: string | null, status: number) =>
    new Response(request.method === 'HEAD' ? null : body, { status, headers });
  const error = (code: string, status: number) => {
    headers.set('Cache-Control', 'no-store');
    return respond(JSON.stringify({ error: code }), status);
  };
  // Every content route shares the same conditional-request handling; only the version and the cache policy differ.
  const cached = (body: string, version: string, cacheControl: string) => {
    const etag = `"${version}"`;
    headers.set('ETag', etag);
    headers.set('Cache-Control', cacheControl);
    const matches = request.headers
      .get('If-None-Match')
      ?.split(',')
      .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
    return matches ? respond(null, 304) : respond(body, 200);
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    headers.set('Allow', allow);
    return error('method-not-allowed', 405);
  }

  try {
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
      if (!success) {
        headers.set('Retry-After', '60');
        return error('rate-limited', 429);
      }
    }
    if (request.method === 'OPTIONS') return respond(null, 204);

    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/v1/vocabulary/')) {
      const resource = await vocabularyResource(url, env.DB);
      if ('error' in resource) return error(resource.error, resource.status);
      return cached(resource.body, resource.version, resource.pinned ? 'public, max-age=300' : 'no-cache');
    }
    if (path === '/v1/readers' || path.startsWith('/v1/readers/')) {
      const resource = await readersResource(url, env.DB);
      if ('error' in resource) return error(resource.error, resource.status);
      return cached(resource.body, resource.version, resource.pinned ? 'public, max-age=300' : 'no-cache');
    }
    const topicId = path.startsWith('/v1/topics/') ? path.slice('/v1/topics/'.length) : undefined;
    if (topicId !== undefined && !topicSlug.test(topicId)) return error('invalid-id', 400);
    // `/v1/lexicon/form/:form` has an extra segment, so it cannot collide with a lemma named "form".
    const lexicon = path.startsWith('/v1/lexicon/form/')
      ? { kind: 'form', raw: path.slice('/v1/lexicon/form/'.length) }
      : path.startsWith('/v1/lexicon/')
        ? { kind: 'lemma', raw: path.slice('/v1/lexicon/'.length) }
        : undefined;
    const key = lexicon && lexiconKey(lexicon.raw);
    if (lexicon && key === undefined) return error('invalid-id', 400);
    if (path !== '/v1/topics' && path !== '/v1/tag-index' && topicId === undefined && !lexicon)
      return error('not-found', 404);

    let body: string;
    if (lexicon) {
      if (lexicon.kind === 'lemma') {
        const { results } = await env.DB.prepare(
          'SELECT pos, gender, data FROM lexicon_entries WHERE lemma = ? ORDER BY pos',
        )
          .bind(key)
          .all<{ pos: string; gender: string | null; data: string }>();
        if (!results.length) return error('not-found', 404);
        body = JSON.stringify({
          lemma: key,
          entries: results.map(({ pos, gender, data }) => ({ pos, ...(gender && { gender }), data: JSON.parse(data) })),
          source: lexiconSource,
        });
      } else {
        const { results } = await env.DB.prepare(
          'SELECT lemma, pos FROM lexicon_forms WHERE form = ? ORDER BY lemma, pos',
        )
          .bind(key)
          .all<{ lemma: string; pos: string }>();
        if (!results.length) return error('not-found', 404);
        body = JSON.stringify({ form: key, lemmas: results, source: lexiconSource });
      }
    } else if (topicId !== undefined) {
      const topic = await env.DB.prepare('SELECT body FROM topics WHERE id = ?')
        .bind(topicId)
        .first<{ body: string }>();
      if (!topic) return error('not-found', 404);
      body = topic.body;
    } else if (path === '/v1/topics') {
      const { results } = await env.DB.prepare(
        'SELECT id, chapter, level, title_en, title_zh, tags FROM topics ORDER BY chapter, id',
      ).all<TopicSummaryRow>();
      body = JSON.stringify(
        results.map(({ id, chapter, level, title_en, title_zh, tags }) => ({
          id,
          chapter,
          level,
          tags: JSON.parse(tags),
          title: { en: title_en, zh: title_zh },
        })),
      );
    } else {
      const { results } = await env.DB.prepare('SELECT id, tags FROM topics ORDER BY id').all<{
        id: string;
        tags: string;
      }>();
      const index: Record<string, string[]> = {};
      for (const { id, tags } of results) {
        for (const tag of JSON.parse(tags) as string[]) (index[tag] ??= []).push(id);
      }
      body = JSON.stringify(index);
    }

    const versionKey = lexicon ? 'lexiconVersion' : 'packVersion';
    const version = await env.DB.prepare('SELECT value FROM meta WHERE key = ?')
      .bind(versionKey)
      .first<{ value: string }>();
    if (!version) throw new Error(`Missing ${versionKey}`);
    return cached(body, version.value, 'public, max-age=300');
  } catch {
    // Fixed message only: D1 exceptions can contain SQL or private content.
    console.error('Content service unavailable');
    return error('unavailable', 500);
  }
}

export default { fetch: handle };
