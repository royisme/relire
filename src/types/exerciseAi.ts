/**
 * Shapes a text model must return for the exercise tasks: generated units,
 * adaptive drills, a hint, a mistake explanation and an open-answer grade.
 * Owns these answer contracts only. Does not own the exercise shapes
 * (types/exercises) or the prompts that ask for them.
 */
import { z } from 'zod';
import {
  ExerciseItemSchema,
  ExerciseTypeSchema,
  ExtractedUnitSchema,
  refineExerciseItem,
  type ExerciseType,
} from './exercises';

const text = z.string().trim().min(1);

/**
 * A dictation is played aloud, so the text to read must come with the item
 * (the draft contract allows a blocked item without it; generated sets do not).
 */
function requireDictationAudio(
  type: ExerciseType,
  item: { audioText?: string },
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  if (type === 'NUMBER_DICTATION' && !item.audioText?.trim())
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'audioText'],
      message: 'Dictation requires the text to read aloud',
    });
}

/**
 * One generated item. `articleQuote` is the article wording the answer rests on;
 * it is optional so a missing quote is not a schema failure, and the generation
 * task checks that a given quote really occurs in the article.
 */
export const GeneratedItemSchema = ExerciseItemSchema.extend({ articleQuote: text.optional() });
export type GeneratedItem = z.infer<typeof GeneratedItemSchema>;

const GeneratedUnitSchema = ExtractedUnitSchema.safeExtend({ items: z.array(GeneratedItemSchema).min(1) });

/** Units generated from an article ("Make exercises from this article"). */
export const GeneratedExercisesSchema = z
  .object({ units: z.array(GeneratedUnitSchema).min(1) })
  .superRefine((data, ctx) => {
    if (new Set(data.units.map((unit) => unit.id)).size !== data.units.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate unit IDs' });
    data.units.forEach((unit, u) =>
      unit.items.forEach((item, i) =>
        requireDictationAudio(item.type ?? unit.type, item, ctx, ['units', u, 'items', i]),
      ),
    );
  });
export type GeneratedExercises = z.infer<typeof GeneratedExercisesSchema>;

/** Adaptive drills: every item names its own type, since the set has no unit default. */
export const DrillsSchema = z
  .object({
    drillTitle: text,
    focusSummary: text,
    items: z.array(ExerciseItemSchema.extend({ type: ExerciseTypeSchema })).min(1),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.items.map((item) => item.id)).size !== data.items.length)
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Duplicate drill item IDs' });
    data.items.forEach((item, index) => {
      refineExerciseItem(item.type, item, ctx, ['items', index]);
      requireDictationAudio(item.type, item, ctx, ['items', index]);
    });
  });
export type Drills = z.infer<typeof DrillsSchema>;

export const HintSchema = z.object({
  hint: text,
  grammarRule: text,
  clueWord: z.string().optional(),
});
export type Hint = z.infer<typeof HintSchema>;

export const ExplanationSchema = z.object({
  summary: text,
  details: text,
  tip: text,
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export const OpenGradeSchema = z.object({
  isCorrect: z.boolean(),
  feedback: text,
  correctedVersion: z.string().optional(),
});
export type OpenGrade = z.infer<typeof OpenGradeSchema>;
