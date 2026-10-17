/**
 * Exercise units, the learner's item states and their attempts: the public
 * API over the `units`, `itemStates` and `attempts` stores (`shadowing.ts` is
 * the model: one module owns the stores, every write is one transaction,
 * `subscribeExercises` fires after commit). Attempt queries live in
 * `exerciseAttempts.ts` and are re-exported here; backup in `exerciseBackup.ts`.
 * Does not grade (services/exercises/grading) and never calls AI.
 *
 * Rules:
 * - Checking an item writes its state and its attempt in ONE transaction. A
 *   failure rejects; there is no in-memory success. Checking an item that is
 *   already checked returns the committed state and writes no second attempt.
 * - Reset clears a unit's current states and keeps its attempts. Every state
 *   write takes the unit's reset token (`getResetToken`, read BEFORE slow work
 *   starts) and is rejected with `StaleResetError` when a reset, delete or
 *   restore moved the token meanwhile. See `exerciseRows.ts` for the token.
 * - Deleting a unit deletes its states; attempts stay.
 */
import {
  ExerciseUnitSchema,
  effectiveItemType,
  itemStateId,
  type CheckedResult,
  type ExerciseAnswer,
  type ExerciseAttempt,
  type ExerciseItemState,
  type ExerciseUnit,
  type ExtractedUnit,
} from '../types/exercises';
import { emptyAnswer, expectedAnswerText, recordedAnswerText } from '../services/exercises/answer';
import { db } from './db';
import { exercisesChanged } from './exerciseEvents';
import { clearUnitStates, deleteUnitRows, readResetToken } from './exerciseRows';
import { ArticleGoneError } from './shadowing';

export { subscribeExercises } from './exerciseEvents';
export { ArticleGoneError } from './shadowing';
export {
  accuracyByGrammarTag,
  listAttempts,
  listMistakes,
  type AttemptQuery,
  type MistakeEntry,
  type TagAccuracy,
} from './exerciseAttempts';
export { ExerciseBackupError, parseExerciseBackup } from './exerciseBackup';

/** The unit was deleted (or never existed). */
export class UnitGoneError extends Error {
  constructor(unitId: string) {
    super(`Unit not found: ${unitId}`);
    this.name = 'UnitGoneError';
  }
}

/** The unit has no item with this id. */
export class ItemGoneError extends Error {
  constructor(unitId: string, itemId: string) {
    super(`Item not found: ${unitId}:${itemId}`);
    this.name = 'ItemGoneError';
  }
}

/** A reset, delete or restore happened after the writer read its token; the late write was dropped. */
export class StaleResetError extends Error {
  constructor(unitId: string) {
    super(`Unit was reset since this work started: ${unitId}`);
    this.name = 'StaleResetError';
  }
}

/** The article was edited while exercises were being generated from its previous content. */
export class ArticleChangedError extends Error {
  constructor() {
    super('Article content changed');
    this.name = 'ArticleChangedError';
  }
}

/** A unit id is already stored; saving never overwrites a unit (that would orphan its states). */
export class DuplicateUnitError extends Error {
  constructor(unitId: string) {
    super(`Unit already exists: ${unitId}`);
    this.name = 'DuplicateUnitError';
  }
}

/** Aborts a transaction after a failure and rethrows; a transaction that ended on its own is ignored. */
async function settle<T>(tx: { abort(): void; done: Promise<void> }, work: () => Promise<T>): Promise<T> {
  try {
    const result = await work();
    await tx.done;
    return result;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
}

// Attempts are ordered by timestamp, so two checks in one millisecond must not tie.
let lastStamp = 0;
const nextStamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

/* --------------------------------- units --------------------------------- */

/**
 * Saves units for a material in one transaction that checks the material still
 * exists (`ArticleGoneError` otherwise). Every unit is validated first (a Zod
 * error rejects the whole call) and its id must be new (`DuplicateUnitError`).
 * When supplied, expectedContent must still match the article; otherwise ArticleChangedError rejects the save.
 * Returns the stored units.
 */
export async function saveUnits(
  materialId: string,
  units: ExtractedUnit[],
  expectedContent?: string,
): Promise<ExerciseUnit[]> {
  const rows = units.map((unit) => ExerciseUnitSchema.parse({ ...unit, materialId }));
  const d = await db();
  const tx = d.transaction(['articles', 'units'], 'readwrite');
  await settle(tx, async () => {
    const article = await tx.objectStore('articles').get(materialId);
    if (!article) throw new ArticleGoneError();
    if (expectedContent !== undefined && article.content !== expectedContent) throw new ArticleChangedError();
    for (const row of rows) {
      if (await tx.objectStore('units').getKey(row.id)) throw new DuplicateUnitError(row.id);
      await tx.objectStore('units').put(row);
    }
  });
  if (rows.length) exercisesChanged();
  return rows;
}

/** Units of one material (insertion-independent: ordered by unit number), or every unit when no material is given. */
export async function listUnits(materialId?: string): Promise<ExerciseUnit[]> {
  const d = await db();
  const rows = materialId ? await d.getAllFromIndex('units', 'materialId', materialId) : await d.getAll('units');
  return rows.sort((a, b) => a.unitNumber - b.unitNumber);
}

export async function getUnit(unitId: string): Promise<ExerciseUnit | undefined> {
  return (await db()).get('units', unitId);
}

/** The sheet's unit, states and reset token from one consistent read, never across a reset or restore. */
export async function getUnitSnapshot(unitId: string): Promise<{
  unit: ExerciseUnit | undefined;
  states: ExerciseItemState[];
  resetToken: number;
}> {
  const tx = (await db()).transaction(['units', 'itemStates', 'meta']);
  const [unit, states, resetToken] = await Promise.all([
    tx.objectStore('units').get(unitId),
    tx.objectStore('itemStates').index('unitId').getAll(unitId),
    readResetToken(tx.objectStore('meta'), unitId),
  ]);
  await tx.done;
  return { unit, states, resetToken };
}

/** Deletes a unit and its item states in one transaction. Its attempts stay. Resolves false when there was no such unit. */
export async function deleteUnit(unitId: string): Promise<boolean> {
  const d = await db();
  const tx = d.transaction(['units', 'itemStates', 'meta'], 'readwrite');
  const existed = await settle(tx, async () => {
    if (!(await tx.objectStore('units').getKey(unitId))) return false;
    await deleteUnitRows(
      { units: tx.objectStore('units'), itemStates: tx.objectStore('itemStates'), meta: tx.objectStore('meta') },
      unitId,
    );
    return true;
  });
  if (existed) exercisesChanged();
  return existed;
}

/* ------------------------------- item states ------------------------------ */

export async function getItemState(unitId: string, itemId: string): Promise<ExerciseItemState | undefined> {
  return (await db()).get('itemStates', itemStateId(unitId, itemId));
}

/** Current states of a unit, one per item the learner touched. */
export async function listItemStates(unitId: string): Promise<ExerciseItemState[]> {
  return (await db()).getAllFromIndex('itemStates', 'unitId', unitId);
}

/**
 * The unit's reset token. Read it when work starts (opening the unit, sending
 * an AI request) and pass it to every write that work makes.
 */
export async function getResetToken(unitId: string): Promise<number> {
  return readResetToken((await db()).transaction('meta').store, unitId);
}

export interface ItemProgress {
  /** Ignored once the item is checked, so a late autosave cannot reopen a checked input. */
  answer?: ExerciseAnswer;
  hintShown?: boolean;
  explanationShown?: boolean;
}

/**
 * Saves a draft answer and/or the hint and explanation flags: state only, no
 * attempt. A checked item keeps its answer and result (only the flags change).
 * Rejects with `StaleResetError` for a stale token. Resolves with the stored state.
 */
export async function saveItemProgress(
  unitId: string,
  itemId: string,
  resetToken: number,
  progress: ItemProgress,
): Promise<ExerciseItemState> {
  const d = await db();
  const tx = d.transaction(['units', 'itemStates', 'meta'], 'readwrite');
  const state = await settle(tx, async () => {
    const unit = await tx.objectStore('units').get(unitId);
    if (!unit) throw new UnitGoneError(unitId);
    if ((await readResetToken(tx.objectStore('meta'), unitId)) !== resetToken) throw new StaleResetError(unitId);
    const item = unit.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new ItemGoneError(unitId, itemId);
    const id = itemStateId(unitId, itemId);
    const current = await tx.objectStore('itemStates').get(id);
    const next: ExerciseItemState = {
      id,
      unitId,
      itemId,
      answer: current?.answer ?? emptyAnswer(item),
      checked: current?.checked ?? null,
      hintShown: progress.hintShown ?? current?.hintShown ?? false,
      explanationShown: progress.explanationShown ?? current?.explanationShown ?? false,
      updatedAt: Date.now(),
    };
    if (progress.answer && !current?.checked) next.answer = progress.answer;
    await tx.objectStore('itemStates').put(next);
    return next;
  });
  exercisesChanged();
  return state;
}

export interface CheckInput {
  unitId: string;
  itemId: string;
  /** The token read when the work behind this result started. */
  resetToken: number;
  /** The answer that was graded. */
  answer: ExerciseAnswer;
  /** The grade (deterministic, or an AI grade with its feedback). */
  result: CheckedResult;
}

export interface CheckOutcome {
  /** False when the item was already checked: `state` is the committed one and no attempt was written. */
  created: boolean;
  state: ExerciseItemState;
}

/**
 * Checks an item: writes its state and its attempt in ONE transaction. The
 * attempt's material, tag, prompt and reference answer come from the stored
 * unit, not from the caller; the learner's answer text is derived from `answer`.
 * Rejects (nothing written) with `StaleResetError`, `UnitGoneError`,
 * `ItemGoneError` or the storage error itself.
 */
export async function checkItem(input: CheckInput): Promise<CheckOutcome> {
  const { unitId, itemId, resetToken, answer, result } = input;
  const d = await db();
  const tx = d.transaction(['units', 'itemStates', 'attempts', 'meta'], 'readwrite');
  const outcome = await settle(tx, async (): Promise<CheckOutcome> => {
    const unit = await tx.objectStore('units').get(unitId);
    if (!unit) throw new UnitGoneError(unitId);
    if ((await readResetToken(tx.objectStore('meta'), unitId)) !== resetToken) throw new StaleResetError(unitId);
    const item = unit.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new ItemGoneError(unitId, itemId);
    const id = itemStateId(unitId, itemId);
    const current = await tx.objectStore('itemStates').get(id);
    if (current?.checked) return { created: false, state: current };
    const state: ExerciseItemState = {
      id,
      unitId,
      itemId,
      answer,
      checked: result,
      hintShown: current?.hintShown ?? false,
      explanationShown: current?.explanationShown ?? false,
      updatedAt: Date.now(),
    };
    const attempt: ExerciseAttempt = {
      id: crypto.randomUUID(),
      unitId,
      itemId,
      materialId: unit.materialId,
      grammarTag: item.grammarTag,
      prompt: item.prompt,
      userAnswer: recordedAnswerText(effectiveItemType(item, unit), item, answer),
      expectedAnswer: expectedAnswerText(item),
      correct: result.correct,
      timestamp: nextStamp(),
    };
    await tx.objectStore('itemStates').put(state);
    await tx.objectStore('attempts').add(attempt);
    return { created: true, state };
  });
  if (outcome.created) exercisesChanged();
  return outcome;
}

/**
 * Clears the unit's current states and keeps its attempts, and moves the reset
 * token so work started before the reset cannot write afterwards. Resolves with
 * the new token; a screen that stays on the unit should keep using that one.
 */
export async function resetUnit(unitId: string): Promise<number> {
  const d = await db();
  const tx = d.transaction(['units', 'itemStates', 'meta'], 'readwrite');
  const token = await settle(tx, async () => {
    if (!(await tx.objectStore('units').getKey(unitId))) throw new UnitGoneError(unitId);
    return clearUnitStates({ itemStates: tx.objectStore('itemStates'), meta: tx.objectStore('meta') }, unitId);
  });
  exercisesChanged();
  return token;
}
