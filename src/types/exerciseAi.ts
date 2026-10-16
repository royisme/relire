/**
 * Shapes a text model must return for the exercise tasks: generated units,
 * adaptive drills, a hint, a mistake explanation and an open-answer grade.
 * Owns these answer contracts only. Does not own the exercise shapes
 * (types/exercises) or the prompts that ask for them.
 */
import { z } from 'zod';
import { ExerciseItemSchema, ExerciseTypeSchema, ExtractedUnitSchema, refineExerciseItem } from './exercises';

const text = z.string().trim().min(1);

/** Units generated from an article ("Make exercises from this article"). */
export const GeneratedExercisesSchema = z
  .object({ units: z.array(ExtractedUnitSchema).min(1) })
  .superRefine((data, ctx) => {
    if (new Set(data.units.map((unit) => unit.id)).size !== data.units.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate unit IDs' });
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
    data.items.forEach((item, index) => refineExerciseItem(item.type, item, ctx, ['items', index]));
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
