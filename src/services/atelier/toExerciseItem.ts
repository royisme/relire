/**
 * Maps one boundary-checked atelier item onto the stored SENTENCE_BUILD shape.
 * The reference answer is the app's own join of the bricks, never the AI's
 * sentence text, so the exact-match path in grading can never see a difference
 * of apostrophe or spacing. Pure; no AI, no storage.
 */
import type { AtelierItem, AtelierLevel } from '../../types/atelier';
import { ExerciseItemSchema, type ExerciseItem } from '../../types/exercises';
import type { ThemeId } from '../../types/themes';
import { joinBricks, normalizeSentence } from './join';

/** What one item needs from its round to be stored and replayed. */
interface AtelierItemContext {
  id: string;
  itemNumber: number;
  themeId: ThemeId;
  level: AtelierLevel;
  /** The learner's language, for the prompt and the explanation. */
  language: 'zh' | 'en';
}

export function toExerciseItem(item: AtelierItem, context: AtelierItemContext): ExerciseItem {
  const expectedAnswer = joinBricks(item.bricks);
  // SentenceBuildControl splits options on spaces and joins the placed tiles
  // with spaces, so each tile is one whitespace token of the join (j’aime
  // stays one tile, so does plage.) and a replay rebuilds the exact answer.
  // Duplicates stay: a sentence can repeat a word, and each tile is placed once.
  const options = [
    ...expectedAnswer.split(/\s+/),
    ...item.distractors.flatMap((distractor) => distractor.text.split(/\s+/)),
  ];
  return ExerciseItemSchema.parse({
    id: context.id,
    type: 'SENTENCE_BUILD',
    itemNumber: context.itemNumber,
    prompt: item.meaning[context.language],
    expectedAnswer,
    // A variant equal to the join would only duplicate the reference.
    acceptableAnswers: item.variants.map(normalizeSentence).filter((variant) => variant !== expectedAnswer),
    options,
    grammarTag: item.grammarTag,
    explanation: item.explanation[context.language],
    answerSource: 'ai',
    meta: {
      source: 'atelier',
      themeId: context.themeId,
      level: context.level,
      bricks: item.bricks,
      distractors: item.distractors,
      links: item.links,
      // Both languages, so a replayed item never depends on the round's language.
      explanation: item.explanation,
      modify: item.modify,
      strictAccents: true,
    },
  });
}
