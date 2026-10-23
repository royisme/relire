/** Primary instructional goals for saved units; interaction types and source sections are independent. */
import { z } from 'zod';

export const LearningAreaSchema = z.enum(['reading', 'grammar', 'listening', 'writing']);
export type LearningArea = z.infer<typeof LearningAreaSchema>;
export const LEARNING_AREAS = LearningAreaSchema.options;
export const learningAreaPath = (area: LearningArea) => (area === 'reading' ? 'read' : area);
export const ArticleExerciseAreaSchema = LearningAreaSchema.extract(['reading', 'grammar']);
export type ArticleExerciseArea = z.infer<typeof ArticleExerciseAreaSchema>;

/** Prompt TTS alone is not listening: only dictation and pack-backed sound choices qualify. */
export function supportsListening(unit: {
  type: string;
  items: { type?: string; audioText?: string; meta?: Record<string, unknown> }[];
}) {
  return (
    unit.items.length > 0 &&
    unit.items.every((item) => {
      const type = item.type ?? unit.type;
      return (
        !!item.audioText?.trim() &&
        (type === 'NUMBER_DICTATION' || (type === 'CHOICE_SELECT' && item.meta?.source === 'minimal-pairs'))
      );
    })
  );
}
