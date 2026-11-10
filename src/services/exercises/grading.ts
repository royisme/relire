/**
 * Deterministic answer checking for the 11 exercise types, ported from
 * FrenchLab with item-level accent and sentence-punctuation policies. Pure: no
 * React, storage or AI. Free-text answers that do not match a reference are
 * reported as needing an AI grader instead of being guessed at here.
 * Does not own the AI call, persistence or what the sheet shows.
 */
import type { ExerciseAnswer, ExerciseAttempt, ExerciseItem, ExerciseType, ExerciseUnit } from '../../types/exercises';
import { effectiveItemType } from '../../types/exercises';
import { choiceGroups, countBlanks, expectedAnswerText, recordedAnswerText } from './answer';

import { normalizeFrench } from './normalizeFrench';

export interface GradingOptions {
  /** The learner's "strict accents" preference. */
  strictAccents: boolean;
}

/** How answers are compared until the Practice settings offer a choice: accents count as spelling help. */
export const DEFAULT_GRADING: GradingOptions = { strictAccents: false };

/**
 * Whether accents are significant for one item: an item may require them
 * (`meta.strictAccents === true`, conjugation drills do) on top of the
 * learner's preference, never against it. The stored `CheckedResult.strictAccents`
 * must come from here too, so the saved boolean always equals the one used to grade.
 */
export const effectiveStrictAccents = (item: Pick<ExerciseItem, 'meta'>, { strictAccents }: GradingOptions) =>
  item.meta?.strictAccents === true || strictAccents;

/**
 * - `graded`: the verdict is final.
 * - `needs-ai`: a free-text answer that matched no reference; only an AI
 *   grader can say whether it is acceptable. Until then it is neither right nor wrong.
 * `recordedAnswer` is the answer as text for the attempt log.
 */
export type GradeResult =
  | { status: 'graded'; correct: boolean; recordedAnswer: string }
  | { status: 'needs-ai'; recordedAnswer: string };

/** Types whose unmatched free text goes to the AI grader (FrenchLab: OPEN_QA and SENTENCE_BUILD). */
const AI_GRADED_TYPES: readonly ExerciseType[] = ['OPEN_QA', 'SENTENCE_BUILD'];

/** Shortest unmatched answer worth sending to the AI grader; shorter ones are simply wrong. */
const MIN_AI_GRADED_LENGTH = 3;

const toList = (answer: string | string[]) => (Array.isArray(answer) ? answer : [answer]);

/** The letter a dialogue or match option is keyed by: its first character. */
const lineKey = (line: string) => (line.trim()[0] ?? '').toLowerCase();

function gradeSlots(given: string[], expected: string[], strict: boolean) {
  return (
    given.length >= expected.length &&
    expected.every((exp, index) => normalizeFrench(given[index] || '', strict) === normalizeFrench(exp || '', strict))
  );
}

/**
 * Checks one item. `type` is the item's effective type (see `effectiveItemType`).
 * The answer is read from the field that type's control writes.
 */
export function gradeItem(
  type: ExerciseType,
  item: ExerciseItem,
  answer: ExerciseAnswer,
  options: GradingOptions,
): GradeResult {
  const strictAccents = effectiveStrictAccents(item, options);
  const recordedAnswer = recordedAnswerText(type, item, answer);
  const graded = (correct: boolean): GradeResult => ({ status: 'graded', correct, recordedAnswer });
  const expected = item.expectedAnswer;

  if (type === 'ODD_ONE_OUT') return graded(answer.selectedOdd === expected);
  if (type === 'MATCH_PAIRS')
    return graded(
      normalizeFrench(answer.matchSelection, strictAccents) === normalizeFrench(String(expected), strictAccents),
    );
  if (type === 'DIALOGUE_ORDER') {
    const given = answer.dialogueOrder.map(lineKey);
    const wanted = toList(expected).map((key) => key.toLowerCase());
    return graded(given.length === wanted.length && given.every((key, index) => key === wanted[index]));
  }
  if (type === 'CHOICE_SELECT' && choiceGroups(item.prompt).length > 0) {
    const wanted = toList(expected);
    return graded(
      answer.choiceSelections.length === wanted.length && gradeSlots(answer.choiceSelections, wanted, strictAccents),
    );
  }
  if (countBlanks(item.prompt) > 1 || Array.isArray(expected))
    return graded(gradeSlots(answer.multiAnswers, toList(expected), strictAccents));

  const normalize = (value: string) =>
    normalizeFrench(
      item.meta?.ignoreSentencePunctuation === true ? value.replace(/[.,;:!?…«»()]/g, ' ') : value,
      strictAccents,
    );
  const given = normalize(answer.singleAnswer);
  const matches =
    given === normalize(String(expected)) || (item.acceptableAnswers?.some((alt) => normalize(alt) === given) ?? false);
  if (matches) return graded(true);
  if (AI_GRADED_TYPES.includes(type) && answer.singleAnswer.trim().length >= MIN_AI_GRADED_LENGTH)
    return { status: 'needs-ai', recordedAnswer };
  return graded(false);
}

/** Convenience: grade an item of a unit, resolving the item's own type override. */
export const gradeUnitItem = (
  unit: ExerciseUnit,
  item: ExerciseItem,
  answer: ExerciseAnswer,
  options: GradingOptions,
) => gradeItem(effectiveItemType(item, unit), item, answer, options);

/** The attempt row for a finished check. Carries its own prompt and answer text. */
export function buildAttempt(
  unit: Pick<ExerciseUnit, 'id' | 'learningArea'>,
  item: ExerciseItem,
  recordedAnswer: string,
  correct: boolean,
  meta: { id: string; timestamp: number },
): ExerciseAttempt {
  return {
    id: meta.id,
    unitId: unit.id,
    learningArea: unit.learningArea,
    itemId: item.id,
    grammarTag: item.grammarTag,
    prompt: item.prompt,
    userAnswer: recordedAnswer,
    expectedAnswer: expectedAnswerText(item),
    correct,
    timestamp: meta.timestamp,
  };
}
