/** Read-only graded-reader delivery: the current catalogue and published immutable artifacts; no learner data, writes or app schemas. */
import type { D1Database } from '@cloudflare/workers-types';

// The same slug and hash shapes as src/types/gradedReader.ts; the Worker does not import app schemas.
const readerId = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const hash = /^[0-9a-f]{64}$/;

async function metaValue(db: D1Database, key: string) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value;
}

export async function readersResource(
  url: URL,
  db: D1Database,
): Promise<{ body: string; version: string } | { error: string; status: number }> {
  if (url.pathname === '/v1/readers') {
    const catalogueHash = await metaValue(db, 'readersCurrent');
    if (catalogueHash === undefined) return { error: 'readers-unavailable', status: 404 };
    const stored = await metaValue(db, `readersCatalog:${catalogueHash}`);
    if (stored === undefined) throw new Error('Missing current reader catalogue');
    const catalogue = JSON.parse(stored) as { version?: unknown; readers?: unknown };
    if (catalogue.version !== catalogueHash || !Array.isArray(catalogue.readers))
      throw new Error('Corrupt reader catalogue');
    return { body: stored, version: catalogueHash };
  }

  const id = url.pathname.slice('/v1/readers/'.length);
  if (!readerId.test(id)) return { error: 'invalid-id', status: 400 };
  const query = url.searchParams;
  const requested = query.get('version');
  if (
    [...query.keys()].some((key) => key !== 'version') ||
    query.getAll('version').length !== 1 ||
    !requested ||
    !hash.test(requested)
  )
    return { error: 'invalid-query', status: 400 };

  const markerValue = await metaValue(db, `readerPublished:${id}:${requested}`);
  if (markerValue === undefined) {
    // The readers table is the set of ids that exist, so an unpublished id stays a 410 and only an unknown id is 404.
    const known = await db.prepare('SELECT 1 AS present FROM readers WHERE id = ?').bind(id).first();
    return known ? { error: 'version-unavailable', status: 410 } : { error: 'not-found', status: 404 };
  }
  const marker = JSON.parse(markerValue) as { bodyVersion?: unknown; artifactHash?: unknown };
  if (marker.artifactHash !== requested || typeof marker.bodyVersion !== 'string')
    throw new Error('Corrupt reader publication marker');
  const stored = await db
    .prepare('SELECT body, body_version FROM readers WHERE id = ? AND artifact_hash = ?')
    .bind(id, requested)
    .first<{ body: string; body_version: string }>();
  if (!stored || stored.body_version !== marker.bodyVersion) throw new Error('Missing published reader');
  // The artifact is PublishedReader JSON, so the id the route requested lives in its body; no app schema is imported.
  if ((JSON.parse(stored.body) as { body?: { id?: unknown } }).body?.id !== id)
    throw new Error('Corrupt published reader');
  return { body: stored.body, version: requested };
}
