/**
 * Import drafts: the lenient shape a model returns when it reads a worksheet
 * (answers may be missing, items may be blocked), and `prepareImport`, the one
 * explicit step that promotes a reviewed draft into strict exercise units.
 * Owns the draft contract, answer provenance, the one-unit-per-import merge and
 * promotion. Does not own extraction requests, the review UI or saving;
 * promotion has no side effects.
 */
import { z } from 'zod';
import {
  ExerciseItemSchema,
  ExerciseUnitSchema,
  ExtractedUnitSchema,
  ImportModeSchema,
  ImportSourceKindSchema,
  type ExerciseLevel,
  type ExerciseUnit,
  type ImportMode,
} from '../../types/exercises';

import type { LearningArea } from '../../types/learningArea';
import type { Route } from '../../utils/routes';
export { ImportModeSchema, type ImportMode };

/** Entry context is retained for mixed batches only when that domain is actually present. */
export function importDestination(units: ExerciseUnit[], entryArea: LearningArea): Route {
  const area = units.some((unit) => unit.learningArea === entryArea) ? entryArea : units[0].learningArea;
  return { name: 'practiceSet', area, setId: units[0].setId };
}

/** Which file the draft came from; the mode is added on promotion. */
export const ImportSourceSchema = z.object({
  kind: ImportSourceKindSchema,
  name: z.string().trim().min(1),
  pages: z.array(z.number().int().positive()),
});
export type ImportSource = z.infer<typeof ImportSourceSchema>;

/** A reference answer the model may legitimately not know yet. */
const draftAnswer = z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]).nullable();

// Models routinely omit draft-only fields described only in prose; defaults normalize
// those omissions while every other rule stays strict.
const DraftItemSchema = ExerciseItemSchema.omit({ answerSource: true, meta: true, topicQuestion: true }).extend({
  expectedAnswer: draftAnswer,
  /** The answer printed in the source material, when it has a key. */
  printedAnswer: draftAnswer.default(null),
  /** Reasons the item cannot be played yet (missing audio, unreadable text...). */
  blockers: z.array(z.string().min(1)).default([]),
});

const { importSource: _importSource, topicOrigin: _topicOrigin, ...unitShape } = ExtractedUnitSchema.shape;

export const ImportDraftSchema = z
  .object({
    /** Name of the material; absent when the model found none (the caller picks a fallback). */
    materialTitle: z.string().trim().min(1).optional(),
    warnings: z.array(z.string()).default([]),
    units: z.array(
      z.object({
        ...unitShape,
        items: z.array(DraftItemSchema),
      }),
    ),
  })
  .superRefine((draft, ctx) => {
    if (new Set(draft.units.map((u) => u.id)).size !== draft.units.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate unit IDs' });
    for (const unit of draft.units)
      if (new Set(unit.items.map((i) => i.id)).size !== unit.items.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate item IDs' });
  });
export type ImportDraft = z.infer<typeof ImportDraftSchema>;
type DraftItem = ImportDraft['units'][number]['items'][number];

/**
 * One import is one exercise, whatever sections the source has: every unit the
 * model split by section merges into the first of them, so mixed question
 * kinds live as per-item `type` overrides. The merged unit keeps the first
 * unit's other unit-level fields, joins distinct section instructions and examples
 * in source order (one per line) and unions the grammar tags; items stay in
 * source order and an id that collides in the merge is prefixed with its unit
 * id, then numbered until it is unique. The only exception is a unit with its own `readingPassage`: one unit
 * holds one passage, so each such unit stays separate and untouched.
 */
function mergeIntoOneUnit(draft: ImportDraft): ImportDraft {
  const toMerge = draft.units.filter((unit) => !unit.readingPassage);
  if (toMerge.length < 2) return draft;
  const [first, ...rest] = toMerge;
  const seen = new Set(first.items.map((item) => item.id));
  const items = [...first.items];
  const instructions = [first.instruction];
  const examples = first.example ? [first.example] : [];
  const grammarTags = new Set(first.grammarTags);
  for (const unit of rest) {
    for (const item of unit.items) {
      let id = seen.has(item.id) ? `${unit.id}-${item.id}` : item.id;
      for (let n = 2; seen.has(id); n++) id = `${unit.id}-${item.id}-${n}`;
      seen.add(id);
      // An item that leaves a unit of another type carries its effective type on itself.
      items.push(unit.type === first.type ? { ...item, id } : { ...item, id, type: item.type ?? unit.type });
    }
    if (!instructions.includes(unit.instruction)) instructions.push(unit.instruction);
    if (unit.example && !examples.includes(unit.example)) examples.push(unit.example);
    unit.grammarTags.forEach((tag) => grammarTags.add(tag));
  }
  const merged: ImportDraft['units'][number] = {
    ...first,
    instruction: instructions.join('\n'),
    example: examples.join('\n') || undefined,
    grammarTags: [...grammarTags],
    items,
  };
  const separate = new Set(draft.units.filter((unit) => unit.readingPassage));
  const units = draft.units.flatMap((unit) => (unit === first ? [merged] : separate.has(unit) ? [unit] : []));
  return { ...draft, units };
}

/**
 * Parses model output, merges it into one exercise per import and settles which
 * answers may stand for the mode: `generate` has no printed key, `complete` and
 * `extract` prefer the printed one, `extract` drops answers the model inferred,
 * and a blocked item keeps none.
 */
export function parseImportDraft(input: unknown, mode: ImportMode): ImportDraft {
  const draft = mergeIntoOneUnit(ImportDraftSchema.parse(input));
  for (const unit of draft.units)
    for (const item of unit.items) {
      if (mode === 'generate') item.printedAnswer = null;
      else if (item.printedAnswer !== null) item.expectedAnswer = item.printedAnswer;
      else if (mode === 'extract') item.expectedAnswer = null;
      if (item.blockers.length) item.expectedAnswer = null;
    }
  return draft;
}

export const answerText = (answer: string | string[] | null) =>
  Array.isArray(answer) ? answer.join(' / ') : answer || '';

/** Identifies a draft item across edits (draft ids are replaced on promotion). */
export const answerKey = (unitId: string, itemId: string) => JSON.stringify([unitId, itemId]);

/** Provenance of a reference answer: the learner's edit, the printed key, or the model. */
export function answerOrigin(item: DraftItem, edited = false) {
  if (edited) return 'user' as const;
  return item.printedAnswer !== null && JSON.stringify(item.printedAnswer) === JSON.stringify(item.expectedAnswer)
    ? ('material' as const)
    : ('ai' as const);
}

/**
 * Why a draft unit could not be promoted. The UI words these (no strings here);
 * `issues` carries the schema's own English messages for `invalid`.
 */
export type ImportErrorCode = 'no-items' | 'blocked' | 'missing-answer' | 'invalid';
export interface ImportUnitError {
  unitId: string;
  unitTitle: string;
  code: ImportErrorCode;
  issues: string[];
}

export interface PrepareImportOptions {
  /** Shared by every unit of this import. */
  setId: string;
  /** The level the learner chose for the whole import. */
  level: ExerciseLevel;
  /** When the batch was made (epoch milliseconds); every unit of it carries this value. */
  createdAt: number;
  /** Answers the learner edited during review (see `answerKey`). */
  editedAnswers?: ReadonlySet<string>;
  /** Id source; replaceable so tests can be deterministic. */
  makeId?: () => string;
}

/**
 * Only this explicit conversion can promote reviewed content to playable
 * units. Pure: it saves nothing, and every promoted unit and item gets a
 * fresh id. Units that fail are reported, never repaired.
 */
export function prepareImport(
  draft: ImportDraft,
  source: ImportSource,
  mode: ImportMode,
  {
    setId,
    level,
    createdAt,
    editedAnswers = new Set<string>(),
    makeId = () => crypto.randomUUID(),
  }: PrepareImportOptions,
) {
  const units: ExerciseUnit[] = [];
  const errors: ImportUnitError[] = [];
  for (const unit of draft.units) {
    const fail = (code: ImportErrorCode, issues: string[] = []) =>
      errors.push({ unitId: unit.id, unitTitle: unit.title, code, issues });
    if (!unit.items.length) {
      fail('no-items');
      continue;
    }
    if (unit.items.some((item) => item.blockers.length)) {
      fail('blocked');
      continue;
    }
    if (unit.items.some((item) => item.expectedAnswer === null)) {
      fail('missing-answer');
      continue;
    }
    const missingContext = unit.items.some((item) => {
      const type = item.type ?? unit.type;
      return (
        (type === 'NUMBER_DICTATION' && !item.audioText?.trim()) ||
        (type === 'READING_CLOZE' && !unit.readingPassage?.content.trim())
      );
    });
    if (missingContext) {
      fail('invalid', ['Dictation requires audio text; reading cloze requires a reading passage']);
      continue;
    }
    const parsed = ExerciseUnitSchema.safeParse({
      ...unit,
      id: `unit-${makeId()}`,
      setId,
      setTitle: draft.materialTitle?.trim() || undefined,
      level,
      createdAt,
      importSource: { ...source, mode },
      items: unit.items.map((item) => ({
        ...item,
        id: `item-${makeId()}`,
        answerSource: answerOrigin(item, editedAnswers.has(answerKey(unit.id, item.id))),
      })),
    });
    if (!parsed.success) {
      fail(
        'invalid',
        parsed.error.issues.map((i) => i.message),
      );
      continue;
    }
    units.push(parsed.data);
  }
  return { units, errors };
}
