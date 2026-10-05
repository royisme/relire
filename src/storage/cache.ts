import { db, type CacheEntry } from './db';

/**
 * Persistent cache for AI answers, so the same word or sentence is never paid
 * for twice. Failures here are never fatal: a broken cache is just a miss.
 */

/** Bump when the prompts change so old answers are not reused. */
const PROMPT_VERSION = 1;

const DAY = 24 * 60 * 60 * 1000;

const POLICY = {
  // A word in a given sentence has one right answer, so it is kept until cleared.
  word: { ttl: Infinity, max: 5000 },
  // Sentence analyses are kept for 30 days.
  sentence: { ttl: 30 * DAY, max: 1000 },
  // Practice drills for an article stay until the learner asks for new ones.
  drills: { ttl: 30 * DAY, max: 300 },
} as const;

export type CacheKind = keyof typeof POLICY;

/** Small stable hash for long inputs such as article text. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export const wordKey = (lang: string, word: string, sentence: string) =>
  `v${PROMPT_VERSION}|${lang}|${normalize(word)}|${normalize(sentence)}`;

export const drillsKey = (lang: string, type: string, articleText: string) =>
  `v${PROMPT_VERSION}|${lang}|${type}|${hashText(articleText.slice(0, 1500))}`;

export const sentenceKey = (lang: string, sentence: string) => `v${PROMPT_VERSION}|${lang}|${normalize(sentence)}`;

export async function getCached<T>(kind: CacheKind, key: string): Promise<T | undefined> {
  try {
    const d = await db();
    const fullKey = `${kind}:${key}`;
    const entry = await d.get('cache', fullKey);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > POLICY[kind].ttl) {
      await d.delete('cache', fullKey);
      return undefined;
    }
    return entry.value as T;
  } catch {
    return undefined;
  }
}

export async function putCached(kind: CacheKind, key: string, value: unknown): Promise<void> {
  try {
    const d = await db();
    const entry: CacheEntry = { key: `${kind}:${key}`, kind, value, createdAt: Date.now() };
    await d.put('cache', entry);
    // Keep the newest `max` entries of this kind.
    const all = await d.getAllFromIndex('cache', 'kind', kind);
    const excess = all.length - POLICY[kind].max;
    if (excess > 0) {
      all.sort((a, b) => a.createdAt - b.createdAt);
      await Promise.all(all.slice(0, excess).map((e) => d.delete('cache', e.key)));
    }
  } catch {
    // Quota or private mode: skip caching.
  }
}

export async function cacheCounts(): Promise<{ words: number; sentences: number; drills: number }> {
  try {
    const d = await db();
    const [words, sentences, drills] = await Promise.all([
      d.countFromIndex('cache', 'kind', 'word'),
      d.countFromIndex('cache', 'kind', 'sentence'),
      d.countFromIndex('cache', 'kind', 'drills'),
    ]);
    return { words, sentences, drills };
  } catch {
    return { words: 0, sentences: 0, drills: 0 };
  }
}

export async function clearCache(): Promise<void> {
  const d = await db();
  await d.clear('cache');
}
