/** Owns topic summaries, stored topic bodies and the derived tag index; HTTP policy belongs to index.ts. */
import type { D1Database } from '@cloudflare/workers-types';

interface TopicSummaryRow {
  id: string;
  chapter: string;
  level: string;
  title_en: string;
  title_zh: string;
  tags: string;
  position: number;
}

// Slug shared by src/types/grammarTopic.ts via src/types/grammarTagIndex.ts; no Zod in the Worker.
const topicSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function topicsResource(
  url: URL,
  db: D1Database,
): Promise<{ body: string; version: string } | { error: string; status: number }> {
  const topicId = url.pathname.startsWith('/v1/topics/') ? url.pathname.slice('/v1/topics/'.length) : undefined;
  if (topicId !== undefined && !topicSlug.test(topicId)) return { error: 'invalid-id', status: 400 };

  let body: string;
  if (topicId !== undefined) {
    const topic = await db.prepare('SELECT body FROM topics WHERE id = ?').bind(topicId).first<{ body: string }>();
    if (!topic) return { error: 'not-found', status: 404 };
    body = topic.body;
  } else if (url.pathname === '/v1/topics') {
    const { results } = await db
      .prepare('SELECT id, chapter, level, title_en, title_zh, tags, position FROM topics ORDER BY position')
      .all<TopicSummaryRow>();
    body = JSON.stringify(
      results.map(({ id, chapter, level, title_en, title_zh, tags, position }) => ({
        id,
        chapter,
        level,
        tags: JSON.parse(tags),
        title: { en: title_en, zh: title_zh },
        position,
      })),
    );
  } else {
    const { results } = await db.prepare('SELECT id, tags FROM topics ORDER BY id').all<{ id: string; tags: string }>();
    const index: Record<string, string[]> = {};
    for (const { id, tags } of results) {
      for (const tag of JSON.parse(tags) as string[]) (index[tag] ??= []).push(id);
    }
    body = JSON.stringify(index);
  }

  const version = await db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .bind('packVersion')
    .first<{ value: string }>();
  if (!version) throw new Error('Missing packVersion');
  return { body, version: version.value };
}
