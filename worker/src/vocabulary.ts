/** Read-only pinned vocabulary resource; current pointer is resolved exactly once per request. */
import type { D1Database } from '@cloudflare/workers-types';
import { VocabularyManifestSchema, VocabularyPageSchema, VocabularyHashSchema } from '../../src/types/vocabulary';
import { canonicalVocabularyJson } from '../../src/services/vocabulary/book';
export async function vocabularyResource(
  url: URL,
  db: D1Database,
): Promise<{ body: string; version: string } | { error: string; status: number }> {
  if (url.pathname !== '/v1/vocabulary/tcf-7000') return { error: 'not-found', status: 404 };
  const query = url.searchParams;
  if (
    [...query.keys()].some((key) => !['page', 'version'].includes(key)) ||
    query.getAll('page').length !== 1 ||
    query.getAll('version').length > 1 ||
    !/^(0|[1-9]\d*)$/.test(query.get('page') ?? '')
  )
    return { error: 'invalid-query', status: 400 };
  const page = Number(query.get('page'));
  const requested = query.get('version');
  if (
    !Number.isSafeInteger(page) ||
    (requested !== null && !VocabularyHashSchema.safeParse(requested).success) ||
    (requested === null && page !== 0)
  )
    return { error: 'invalid-query', status: 400 };
  let version = requested;
  if (version === null) {
    const current = await db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .bind('vocabularyCurrent:tcf-7000')
      .first<{ value: string }>();
    if (!current) return { error: 'book-unavailable', status: 404 };
    version = VocabularyHashSchema.parse(current.value);
  }
  const marker = await db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .bind(`vocabularyPublished:tcf-7000:${version}`)
    .first<{ value: string }>();
  if (!marker) {
    if (requested !== null) return { error: 'version-unavailable', status: 410 };
    throw new Error('Missing current publication marker');
  }
  const manifest = VocabularyManifestSchema.parse(JSON.parse(marker.value));
  if (manifest.version !== version) throw new Error('Publication version mismatch');
  if (page >= manifest.pageCount) return { error: 'page-not-found', status: 404 };
  const stored = await db
    .prepare('SELECT body FROM vocabulary_pages WHERE book_id = ? AND version = ? AND page = ?')
    .bind('tcf-7000', version, page)
    .first<{ body: string }>();
  if (!stored) throw new Error('Missing published page');
  const parsed = VocabularyPageSchema.parse(JSON.parse(stored.body));
  if (
    parsed.page !== page ||
    canonicalVocabularyJson(parsed.manifest) !== canonicalVocabularyJson(manifest) ||
    parsed.entries.length !== Math.min(250, manifest.entryCount - page * 250) ||
    new Set(parsed.entries.map((entry) => entry.key)).size !== parsed.entries.length
  )
    throw new Error('Corrupt published page');
  return { body: stored.body, version };
}
