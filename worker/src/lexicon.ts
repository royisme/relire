/** Owns lexicon lookup keys and stored lemma/form resources; HTTP policy belongs to index.ts. */
import type { D1Database } from '@cloudflare/workers-types';

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

export async function lexiconResource(
  url: URL,
  db: D1Database,
): Promise<{ body: string; version: string } | { error: string; status: number }> {
  // Hono's wildcard also matches the bare prefix; that path was never a lookup.
  if (url.pathname === '/v1/lexicon') return { error: 'not-found', status: 404 };
  // `/v1/lexicon/form/:form` has an extra segment, so it cannot collide with a lemma named "form".
  const lexicon = url.pathname.startsWith('/v1/lexicon/form/')
    ? { kind: 'form', raw: url.pathname.slice('/v1/lexicon/form/'.length) }
    : { kind: 'lemma', raw: url.pathname.slice('/v1/lexicon/'.length) };
  const key = lexiconKey(lexicon.raw);
  if (key === undefined) return { error: 'invalid-id', status: 400 };

  let body: string;
  if (lexicon.kind === 'lemma') {
    const { results } = await db
      .prepare('SELECT pos, gender, data FROM lexicon_entries WHERE lemma = ? ORDER BY pos')
      .bind(key)
      .all<{ pos: string; gender: string | null; data: string }>();
    if (!results.length) return { error: 'not-found', status: 404 };
    body = JSON.stringify({
      lemma: key,
      entries: results.map(({ pos, gender, data }) => ({ pos, ...(gender && { gender }), data: JSON.parse(data) })),
      source: lexiconSource,
    });
  } else {
    const { results } = await db
      .prepare('SELECT lemma, pos FROM lexicon_forms WHERE form = ? ORDER BY lemma, pos')
      .bind(key)
      .all<{ lemma: string; pos: string }>();
    if (!results.length) return { error: 'not-found', status: 404 };
    body = JSON.stringify({ form: key, lemmas: results, source: lexiconSource });
  }

  const version = await db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .bind('lexiconVersion')
    .first<{ value: string }>();
  if (!version) throw new Error('Missing lexiconVersion');
  return { body, version: version.value };
}
