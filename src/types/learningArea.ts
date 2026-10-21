/** Primary instructional goals for saved units; interaction types and source sections are independent. */
import { z } from 'zod';

export const LearningAreaSchema = z.enum(['reading', 'grammar', 'listening', 'writing']);
export type LearningArea = z.infer<typeof LearningAreaSchema>;
export const LEARNING_AREAS = LearningAreaSchema.options;
export const learningAreaPath = (area: LearningArea) => (area === 'reading' ? 'read' : area);
export const ArticleExerciseAreaSchema = LearningAreaSchema.extract(['reading', 'grammar']);
export type ArticleExerciseArea = z.infer<typeof ArticleExerciseAreaSchema>;

/** Prompt TTS alone is not a listening interaction. */
export function supportsListening(unit: { type: string; items: { type?: string; audioText?: string }[] }) {
  return (
    unit.items.length > 0 &&
    unit.items.every((item) => (item.type ?? unit.type) === 'NUMBER_DICTATION' && !!item.audioText?.trim())
  );
}
