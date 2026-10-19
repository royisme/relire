/** Owns read-only topic HTTP delivery; content validation and loading belong to the owner's local pipeline. */
import type { D1Database, RateLimit } from '@cloudflare/workers-types';

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

    const path = new URL(request.url).pathname;
    const topicId = path.startsWith('/v1/topics/') ? path.slice('/v1/topics/'.length) : undefined;
    if (topicId !== undefined && !topicSlug.test(topicId)) return error('invalid-id', 400);
    if (path !== '/v1/topics' && path !== '/v1/tag-index' && topicId === undefined) return error('not-found', 404);

    let body: string;
    if (topicId !== undefined) {
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

    const version = await env.DB.prepare("SELECT value FROM meta WHERE key = 'packVersion'").first<{ value: string }>();
    if (!version) throw new Error('Missing pack version');
    const etag = `"${version.value}"`;
    headers.set('ETag', etag);
    headers.set('Cache-Control', 'public, max-age=300');
    const matches = request.headers
      .get('If-None-Match')
      ?.split(',')
      .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
    return matches ? respond(null, 304) : respond(body, 200);
  } catch {
    // Fixed message only: D1 exceptions can contain SQL or private content.
    console.error('Content service unavailable');
    return error('unavailable', 500);
  }
}

export default { fetch: handle };
