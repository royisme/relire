/**
 * Backup of the exercise stores: Zod schemas for what is stored per learner,
 * validation of a whole payload before anything is written, and the in-transaction
 * restore that `importData` calls. Owns the backup format and its consistency
 * rules; does not open transactions or notify (db.ts does) and never touches
 * settings or API keys.
 *
 * Rules: each of `units`, `itemStates`, `attempts` is optional; an absent key
 * keeps what is stored, an array (even empty) replaces it. Malformed data, a
 * duplicate id, or a reference that points nowhere rejects the whole restore.
 * Whatever the restore leaves dangling in rows it did not replace (units whose
 * article the backup dropped, states of a replaced unit list) is removed in
 * the same transaction, like an article delete would.
 */
import { z } from 'zod';
import { GrammarTagSchema } from '../types/grammar';
import {
  ExerciseUnitSchema,
  itemStateId,
  type ExerciseAttempt,
  type ExerciseItemState,
  type ExerciseUnit,
} from '../types/exercises';
import { bumpResetToken, deleteUnitRows, type RwStore } from './exerciseRows';

const ExerciseAnswerSchema = z.object({
  singleAnswer: z.string(),
  multiAnswers: z.array(z.string()),
  choiceSelections: z.array(z.string()),
  selectedOdd: z.string().nullable(),
  dialogueOrder: z.array(z.string()),
  matchSelection: z.string(),
});

const CheckedResultSchema = z.object({
  correct: z.boolean(),
  strictAccents: z.boolean(),
  aiFeedback: z.object({ feedback: z.string(), correctedVersion: z.string().optional() }).optional(),
});

export const ExerciseItemStateSchema = z
  .object({
    id: z.string().min(1),
    unitId: z.string().min(1),
    itemId: z.string().min(1),
    answer: ExerciseAnswerSchema,
    checked: CheckedResultSchema.nullable(),
    hintShown: z.boolean(),
    explanationShown: z.boolean(),
    updatedAt: z.number().finite(),
  })
  .refine(
    (state) => state.id === itemStateId(state.unitId, state.itemId),
    'Item state id is not unitId:itemId',
  ) satisfies z.ZodType<ExerciseItemState>;

export const ExerciseAttemptSchema = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  itemId: z.string().min(1),
  materialId: z.string().min(1),
  grammarTag: GrammarTagSchema,
  prompt: z.string(),
  userAnswer: z.string(),
  expectedAnswer: z.string(),
  correct: z.boolean(),
  timestamp: z.number().finite(),
}) satisfies z.ZodType<ExerciseAttempt>;

/** What a backup carries of the exercise stores. A missing field means "keep what is stored". */
export interface ExerciseBackup {
  units?: ExerciseUnit[];
  itemStates?: ExerciseItemState[];
  attempts?: ExerciseAttempt[];
}

/** The backup's exercise data is malformed or inconsistent; the whole restore is refused. */
export class ExerciseBackupError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ExerciseBackupError';
  }
}

function parseList<T>(name: string, schema: z.ZodType<T>, value: unknown): T[] {
  const parsed = z.array(schema).safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ExerciseBackupError(`${name}${issue.path.map((part) => `[${String(part)}]`).join('')}: ${issue.message}`);
  }
  const ids = new Set<string>();
  for (const row of parsed.data) {
    const id = (row as { id: string }).id;
    if (ids.has(id)) throw new ExerciseBackupError(`${name}: duplicate id ${JSON.stringify(id)}`);
    ids.add(id);
  }
  return parsed.data;
}

/**
 * Validates the whole payload; nothing is written here. `articleIds` is the id
 * list of the articles in the same backup, when it has any, so units can be
 * checked against them; references into stored rows are checked in the
 * restore transaction.
 */
export function parseExerciseBackup(
  data: { units?: unknown; itemStates?: unknown; attempts?: unknown },
  articleIds?: ReadonlySet<string>,
): ExerciseBackup {
  const out: ExerciseBackup = {};
  if (data.units !== undefined) out.units = parseList('units', ExerciseUnitSchema, data.units);
  if (data.itemStates !== undefined) out.itemStates = parseList('itemStates', ExerciseItemStateSchema, data.itemStates);
  if (data.attempts !== undefined) out.attempts = parseList('attempts', ExerciseAttemptSchema, data.attempts);
  if (out.units && articleIds) {
    for (const unit of out.units)
      if (!articleIds.has(unit.materialId))
        throw new ExerciseBackupError(
          `units: ${unit.id} belongs to ${unit.materialId}, which the backup does not hold`,
        );
  }
  if (out.units && out.itemStates) {
    const items = new Map(out.units.map((unit) => [unit.id, new Set(unit.items.map((item) => item.id))]));
    for (const state of out.itemStates)
      if (!items.get(state.unitId)?.has(state.itemId))
        throw new ExerciseBackupError(`itemStates: ${state.id} points at an item the backup's units do not hold`);
  }
  return out;
}

type Stores = {
  articles: RwStore<'articles'>;
  units: RwStore<'units'>;
  itemStates: RwStore<'itemStates'>;
  attempts: RwStore<'attempts'>;
  meta: RwStore<'meta'>;
};

/**
 * Replaces the exercise stores `backup` carries, inside the caller's
 * transaction, after the caller wrote the articles. Throws before the caller
 * commits when a reference points at nothing; the caller must abort then.
 * Pass `articlesReplaced` when the article store was replaced in this restore,
 * so units of vanished articles are removed with their states.
 */
export async function restoreExerciseRows(stores: Stores, backup: ExerciseBackup, articlesReplaced: boolean) {
  const priorUnitIds = await stores.units.getAllKeys();
  if (backup.units) {
    await stores.units.clear();
    for (const unit of backup.units) await stores.units.put(unit);
  }
  if (backup.itemStates) {
    await stores.itemStates.clear();
    for (const state of backup.itemStates) await stores.itemStates.put(state);
  }
  if (backup.attempts) {
    await stores.attempts.clear();
    for (const attempt of backup.attempts) await stores.attempts.put(attempt);
  }
  // Provided rows must point at something that now exists.
  for (const unit of backup.units ?? [])
    if (!(await stores.articles.getKey(unit.materialId)))
      throw new ExerciseBackupError(`units: ${unit.id} belongs to ${unit.materialId}, which is not in the library`);
  for (const state of backup.itemStates ?? []) {
    const unit = await stores.units.get(state.unitId);
    if (!unit?.items.some((item) => item.id === state.itemId))
      throw new ExerciseBackupError(`itemStates: ${state.id} points at a unit or item that does not exist`);
  }
  // Rows this restore did not replace but whose owner is gone.
  if (articlesReplaced || backup.units) {
    for (const unit of await stores.units.getAll())
      if (!(await stores.articles.getKey(unit.materialId))) await deleteUnitRows(stores, unit.id);
  }
  if (backup.units) {
    for (const state of await stores.itemStates.getAll()) {
      const unit = await stores.units.get(state.unitId);
      if (!unit?.items.some((item) => item.id === state.itemId)) await stores.itemStates.delete(state.id);
    }
  }
  // Work started before the restore must not write into what it put back.
  if (backup.units || backup.itemStates) for (const unitId of priorUnitIds) await bumpResetToken(stores.meta, unitId);
}
