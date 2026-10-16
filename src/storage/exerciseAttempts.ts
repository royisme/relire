/**
 * Read-only queries over the `attempts` store: recent attempts, accuracy per
 * grammar tag and the mistake notebook. Only real attempts count; an empty
 * store gives empty answers, never placeholders. Writing attempts belongs to
 * `exercises.ts` (an attempt exists only together with the item state it
 * checked). Does not group tags into areas; the UI does that with `grammarAreaOf`.
 */
import { GRAMMAR_TAGS, type GrammarTag } from '../types/grammar';
import { itemStateId, type ExerciseAttempt } from '../types/exercises';
import { db } from './db';

export const DEFAULT_ATTEMPT_LIMIT = 50;

export interface AttemptQuery {
  /** At most this many, newest first. Defaults to DEFAULT_ATTEMPT_LIMIT. */
  limit?: number;
  unitId?: string;
  materialId?: string;
}

/** Attempts newest first. */
export async function listAttempts(query: AttemptQuery = {}): Promise<ExerciseAttempt[]> {
  const limit = query.limit ?? DEFAULT_ATTEMPT_LIMIT;
  const d = await db();
  if (query.unitId || query.materialId) {
    const rows = query.unitId
      ? await d.getAllFromIndex('attempts', 'unitId', query.unitId)
      : await d.getAllFromIndex('attempts', 'materialId', query.materialId!);
    return rows
      .filter(
        (row) =>
          (!query.unitId || row.unitId === query.unitId) && (!query.materialId || row.materialId === query.materialId),
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  const out: ExerciseAttempt[] = [];
  let cursor = await d.transaction('attempts').store.index('timestamp').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

export interface TagAccuracy {
  grammarTag: GrammarTag;
  correct: number;
  total: number;
  /** correct / total, 0 to 1. */
  accuracy: number;
}

/** Accuracy per grammar tag over all attempts. Only tags with at least one attempt appear, in taxonomy order. */
export async function accuracyByGrammarTag(): Promise<TagAccuracy[]> {
  const counts = new Map<GrammarTag, { correct: number; total: number }>();
  for (const attempt of await (await db()).getAll('attempts')) {
    const entry = counts.get(attempt.grammarTag) ?? { correct: 0, total: 0 };
    entry.total++;
    if (attempt.correct) entry.correct++;
    counts.set(attempt.grammarTag, entry);
  }
  return GRAMMAR_TAGS.filter((tag) => counts.has(tag)).map((tag) => {
    const { correct, total } = counts.get(tag)!;
    return { grammarTag: tag, correct, total, accuracy: correct / total };
  });
}

export interface MistakeEntry {
  /** The latest wrong attempt of this item. */
  attempt: ExerciseAttempt;
  /** True when a later attempt of the same item was correct. */
  resolved: boolean;
}

/**
 * The mistake notebook: the latest wrong attempt per item (an item is a unit id
 * and item id pair, so a re-generated unit never merges with another), newest
 * first. Keeps resolved entries and marks them, so the UI can hide or show them.
 */
export async function listMistakes(limit?: number): Promise<MistakeEntry[]> {
  const rows = await (await db()).getAllFromIndex('attempts', 'timestamp');
  const latestWrong = new Map<string, ExerciseAttempt>();
  const latestAny = new Map<string, ExerciseAttempt>();
  for (const attempt of rows) {
    const key = itemStateId(attempt.unitId, attempt.itemId);
    latestAny.set(key, attempt);
    if (!attempt.correct) latestWrong.set(key, attempt);
  }
  const entries = [...latestWrong.entries()].map(([key, attempt]) => ({
    attempt,
    resolved: latestAny.get(key)!.correct,
  }));
  entries.sort((a, b) => b.attempt.timestamp - a.attempt.timestamp);
  return limit === undefined ? entries : entries.slice(0, limit);
}
