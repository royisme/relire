/** Owns routed read-only HTTP delivery and middleware; resource modules own content reads and validation. */
import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { authorized } from './access';
import { cached, error } from './http';
import { readersResource } from './readers';
import { topicsResource } from './topics';
import { vocabularyResource } from './vocabulary';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  ACCESS_KEYS?: string;
  RATE_LIMITER?: RateLimit;
}

const allow = 'GET, HEAD, OPTIONS';
const app = new Hono<{ Bindings: Env }>({ getPath: (request) => new URL(request.url).pathname });

app.use(async (c, next) => {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin, Authorization' });
  const origin = c.req.raw.headers.get('Origin');
  if (
    origin &&
    c.env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .includes(origin)
  ) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', allow);
    headers.set('Access-Control-Allow-Headers', 'Authorization, If-None-Match');
    headers.set('Access-Control-Expose-Headers', 'ETag, Retry-After');
  }
  await next();
  headers.forEach((value, name) => c.res.headers.set(name, value));
});

app.use(async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return error('method-not-allowed', 405, { Allow: allow });
  await next();
});

app.use(async (c, next) => {
  if (c.env.RATE_LIMITER) {
    const { success } = await c.env.RATE_LIMITER.limit({ key: c.req.raw.headers.get('CF-Connecting-IP') ?? 'unknown' });
    if (!success) return error('rate-limited', 429, { 'Retry-After': '60' });
  }
  await next();
});

app.use(async (c, next) => {
  if (c.req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-cache' } });
  await next();
});

app.use(async (c, next) => {
  if (!(await authorized(c.req.raw, c.env.ACCESS_KEYS)))
    return error('unauthorized', 401, { 'WWW-Authenticate': 'Bearer' });
  await next();
});

app.on('GET', ['/v1/topics', '/v1/tag-index', '/v1/topics/*'], async (c) =>
  cached(c.req.raw, await topicsResource(new URL(c.req.url), c.env.DB)),
);
app.get('/v1/vocabulary/*', async (c) => cached(c.req.raw, await vocabularyResource(new URL(c.req.url), c.env.DB)));
app.on('GET', ['/v1/readers', '/v1/readers/*'], async (c) =>
  cached(c.req.raw, await readersResource(new URL(c.req.url), c.env.DB)),
);
app.notFound(() => error('not-found', 404));
app.onError(() => {
  // Fixed message only: D1 exceptions can contain SQL or private content.
  console.error('Content service unavailable');
  return error('unavailable', 500);
});

export async function handle(request: Request, env: Env): Promise<Response> {
  return app.fetch(request, env);
}

export default { fetch: handle };
