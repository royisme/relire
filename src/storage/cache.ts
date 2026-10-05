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
} as const;

export type CacheKind = keyof typeof POLICY;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export const wordKey = (lang: string, word: string, sentence: string) =>
  `v${PROMPT_VERSION}|${lang}|${normalize(word)}|${normalize(sentence)}`;

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

export async function cacheCounts(): Promise<{ words: number; sentences: number }> {
  try {
    const d = await db();
    const [words, sentences] = await Promise.all([
      d.countFromIndex('cache', 'kind', 'word'),
      d.countFromIndex('cache', 'kind', 'sentence'),
    ]);
    return { words, sentences };
  } catch {
    return { words: 0, sentences: 0 };
  }
}

export async function clearCache(): Promise<void> {
  const d = await db();
  await d.clear('cache');
}
