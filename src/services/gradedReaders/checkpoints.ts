/**
 * Owns the deterministic verdict for one reader checkpoint question: the
 * question-to-item mapping, strict grading and the authored feedback that
 * belongs to the committed answer. Pure: no React, storage, AI or network.
 * Does not own the answer's shape, persistence or what a sheet shows.
 */
import type { ExerciseAnswer, ExerciseItem } from '../../types/exercises';
import { expectedAnswerText, recordedAnswerText } from '../exercises/answer';
import { gradeItem } from '../exercises/grading';
import { resolveTopicFeedback, type FeedbackMessage } from '../../types/grammarCheckpoint';
import type { ReaderQuestion } from '../../types/gradedReader';

/** A reader check is reading comprehension of the quoted sentence, never grammar accuracy. */
const READER_TAG = 'reading-comprehension';

/**
 * The exercise item a reader question is graded as, in the same shape
 * `topicToExerciseUnit` writes: strict accents are required on the item itself,
 * so the stored `CheckedResult.strictAccents` always equals the one used here.
 * `itemNumber` is the question's position in its reader, for control labels.
 */
export function readerQuestionItem(question: ReaderQuestion, itemNumber = 1): ExerciseItem {
  const { id, type, prompt, expectedAnswer, acceptableAnswers } = question.question;
  return {
    id,
    type,
    itemNumber,
    prompt,
    expectedAnswer,
    acceptableAnswers,
    grammarTag: READER_TAG,
    meta: { strictAccents: true },
  };
}

export interface ReaderCheckVerdict {
  correct: boolean;
  /** The reference answer as one line of text. */
  expectedAnswer: string;
  /** The authored message for the committed answer, never a generic one. */
  feedback: FeedbackMessage;
}

/**
 * Grades one answer with strict accents whatever the learner's preference says,
 * and pairs the verdict with the authored feedback for that answer. A reader
 * question is a choice or a typed blank, so the verdict is always final: free
 * text that would need an AI grader never reaches this module.
 */
export function gradeReaderQuestion(question: ReaderQuestion, answer: ExerciseAnswer): ReaderCheckVerdict {
  const item = readerQuestionItem(question);
  const graded = gradeItem(question.question.type, item, answer, { strictAccents: true });
  if (graded.status !== 'graded')
    throw new Error(`Reader question ${question.question.id} has no deterministic verdict`);
  return {
    correct: graded.correct,
    expectedAnswer: expectedAnswerText(item),
    feedback: resolveTopicFeedback(
      question.question.feedback,
      recordedAnswerText(item.type!, item, answer),
      graded.correct,
    ),
  };
}
