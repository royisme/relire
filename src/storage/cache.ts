import { db, type CacheEntry } from './db';
import { PRONUNCIATION_SCHEMA_VERSION, READER_TOKENIZER_VERSION } from '../types/pronunciation';

/**
 * Persistent cache for AI answers, so the same word or sentence is never paid
 * for twice. Failures here are never fatal: a broken cache is just a miss.
 */

const DAY = 24 * 60 * 60 * 1000;

const POLICY = {
  // A word in a given sentence has one right answer, so it is kept until cleared.
  word: { ttl: Infinity, max: Infinity },
  // Sentence analyses are kept for 30 days.
  sentence: { ttl: 30 * DAY, max: 1000 },
  prosody: { ttl: 30 * DAY, max: 1000 },
  // Practice drills for an article stay until the learner asks for new ones.
  drills: { ttl: 30 * DAY, max: 300 },
  // Exercise hints and explanations depend on the exact item and learner answer.
  hint: { ttl: 30 * DAY, max: 2000 },
  explanation: { ttl: 30 * DAY, max: 2000 },
  // Units generated from an article; large, so fewer are kept.
  exercises: { ttl: 30 * DAY, max: 200 },
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

// Keys carry a fingerprint of the prompt in use, so editing a prompt starts a fresh set of answers.
export const wordKey = (lang: string, fingerprint: string, word: string, sentence: string) =>
  `${fingerprint}|${lang}|${normalize(word)}|${normalize(sentence)}`;

export const drillsKey = (lang: string, fingerprint: string, type: string, articleText: string) =>
  `${fingerprint}|${lang}|${type}|${hashText(articleText.slice(0, 1500))}`;

/** What a hint or explanation is about; every field is part of the key. */
export interface ItemKeyInput {
  exerciseType?: string;
  prompt: string;
  userAnswer: string;
  expectedAnswer?: string;
  grammarTag: string;
  context?: string;
}

// A JSON array keeps fields apart even when a prompt contains the "|" of a {a|b} choice. Lesson context can be a
// whole passage, so it is hashed.
const itemKey = (lang: string, fingerprint: string, i: ItemKeyInput) =>
  `${fingerprint}|${lang}|${JSON.stringify(
    [i.exerciseType, i.prompt, i.userAnswer, i.expectedAnswer, i.grammarTag].map((v) => normalize(v ?? '')),
  )}|${hashText(normalize(i.context ?? ''))}`;

export const hintKey = itemKey;
export const explanationKey = itemKey;

/** Generated exercises are kept per article text, item count and level. */
export const exercisesKey = (lang: string, fingerprint: string, level: string, count: number, articleText: string) =>
  `${fingerprint}|${lang}|${normalize(level)}|${count}|${hashText(articleText)}.${articleText.length}`;

export const sentenceKey = (lang: string, fingerprint: string, sentence: string) =>
  `${fingerprint}|${lang}|${normalize(sentence)}`;

export const prosodyKey = (lang: string, fingerprint: string, sentence: string) =>
  `v${PRONUNCIATION_SCHEMA_VERSION}.t${READER_TOKENIZER_VERSION}|${fingerprint}|${lang}|${normalize(sentence)}`;

export async function deleteCached(kind: CacheKind, key: string): Promise<void> {
  try {
    await (await db()).delete('cache', `${kind}:${key}`);
  } catch {
    // A broken cache must not prevent plain reading or a fresh request.
  }
}

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
    // Keep the newest `max` entries of kinds that have a limit (words never do).
    if (Number.isFinite(POLICY[kind].max)) {
      const all = await d.getAllFromIndex('cache', 'kind', kind);
      const excess = all.length - POLICY[kind].max;
      if (excess > 0) {
        all.sort((a, b) => a.createdAt - b.createdAt);
        await Promise.all(all.slice(0, excess).map((e) => d.delete('cache', e.key)));
      }
    }
  } catch {
    // Quota or private mode: skip caching.
  }
}

export async function cacheCounts(): Promise<{ words: number; sentences: number; drills: number; prosody: number }> {
  try {
    const d = await db();
    const [words, sentences, drills, prosody] = await Promise.all([
      d.countFromIndex('cache', 'kind', 'word'),
      d.countFromIndex('cache', 'kind', 'sentence'),
      d.countFromIndex('cache', 'kind', 'drills'),
      d.countFromIndex('cache', 'kind', 'prosody'),
    ]);
    return { words, sentences, drills, prosody };
  } catch {
    return { words: 0, sentences: 0, drills: 0, prosody: 0 };
  }
}

export async function clearCache(): Promise<void> {
  const d = await db();
  await d.clear('cache');
}
