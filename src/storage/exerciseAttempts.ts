/**
 * Read-only queries over the `attempts` store: recent attempts, today's
 * attempts with the items wrong before today, accuracy per grammar tag, saved
 * sound contrast and the mistake notebook. Only real attempts count; an empty
 * store gives empty answers, never placeholders. Writing attempts belongs to
 * `exercises.ts` (an attempt exists only together with the item state it
 * checked). Does not group tags into areas; the UI does that with `grammarAreaOf`.
 */
import { GRAMMAR_TAGS, type GrammarTag } from '../types/grammar';
import { ExerciseUnitSchema, itemStateId, type ExerciseAttempt } from '../types/exercises';
import { ContrastIdSchema } from '../types/minimalPairs';
import { db } from './db';
import { ExerciseAttemptSchema } from './exerciseBackup';

export const DEFAULT_ATTEMPT_LIMIT = 50;

export interface AttemptQuery {
  /** At most this many, newest first. Defaults to DEFAULT_ATTEMPT_LIMIT. */
  limit?: number;
  unitId?: string;
}

/** Attempts newest first. */
export async function listAttempts(query: AttemptQuery = {}): Promise<ExerciseAttempt[]> {
  const limit = query.limit ?? DEFAULT_ATTEMPT_LIMIT;
  const d = await db();
  if (query.unitId) {
    const rows = await d.getAllFromIndex('attempts', 'unitId', query.unitId);
    return rows
      .map((row) => ExerciseAttemptSchema.parse(row))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  const out: ExerciseAttempt[] = [];
  let cursor = await d.transaction('attempts').store.index('timestamp').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(ExerciseAttemptSchema.parse(cursor.value));
    cursor = await cursor.continue();
  }
  return out;
}

/**
 * Attempts from `start` on, plus the items that already had an incorrect
 * attempt before it: "redo a mistake" counts only a retry of an item that was
 * wrong before today, so a first wrong answer on a new item is not one.
 */
export async function listAttemptsSince(
  start: number,
): Promise<{ today: ExerciseAttempt[]; wrongBefore: Set<string> }> {
  const today: ExerciseAttempt[] = [];
  const wrongBefore = new Set<string>();
  let cursor = await (await db()).transaction('attempts').store.index('timestamp').openCursor();
  while (cursor) {
    const attempt = ExerciseAttemptSchema.parse(cursor.value);
    if (attempt.timestamp >= start) today.push(attempt);
    else if (!attempt.correct) wrongBefore.add(itemStateId(attempt.unitId, attempt.itemId));
    cursor = await cursor.continue();
  }
  return { today, wrongBefore };
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
  for (const row of await (await db()).getAll('attempts')) {
    const attempt = ExerciseAttemptSchema.parse(row);
    if (attempt.learningArea !== 'grammar') continue;
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

export interface ContrastCount {
  contrast: string;
  correct: number;
  total: number;
}

/** All checks, including repeats, of minimal-pairs items whose units are still saved. */
export async function countsBySoundContrast(): Promise<ContrastCount[]> {
  const d = await db();
  const tx = d.transaction(['attempts', 'units'], 'readonly');
  const [rows, unitRows] = await Promise.all([tx.objectStore('attempts').getAll(), tx.objectStore('units').getAll()]);
  await tx.done;
  const units = new Map(
    unitRows.map((row) => {
      const unit = ExerciseUnitSchema.parse(row);
      return [unit.id, unit];
    }),
  );
  const counts = new Map<string, ContrastCount>();
  for (const row of rows) {
    const attempt = ExerciseAttemptSchema.parse(row);
    const item = units.get(attempt.unitId)?.items.find((item) => item.id === attempt.itemId);
    if (item?.meta?.source !== 'minimal-pairs') continue;
    const contrast = ContrastIdSchema.parse(item.meta.contrast);
    const entry = counts.get(contrast) ?? { contrast, correct: 0, total: 0 };
    entry.total++;
    if (attempt.correct) entry.correct++;
    counts.set(contrast, entry);
  }
  return [...counts.values()].sort((a, b) => a.contrast.localeCompare(b.contrast));
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
  for (const row of rows) {
    const attempt = ExerciseAttemptSchema.parse(row);
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
