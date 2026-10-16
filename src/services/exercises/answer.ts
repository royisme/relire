/**
 * Helpers for the learner's answer to one item: how many blanks and choice
 * groups a prompt has, the empty answer for an item, and whether an answer is
 * filled. Pure and React-free; shared by grading and the exercise sheet.
 * Does not own grading rules or persistence.
 */
import type { ExerciseAnswer, ExerciseItem, ExerciseType } from '../../types/exercises';

/** Number of `[___]` blanks in a prompt. */
export const countBlanks = (prompt: string) => (prompt.match(/\[___\]/g) || []).length;

/** Inline `{a|b}` option groups in a CHOICE_SELECT prompt, in order. */
export const choiceGroups = (prompt: string) =>
  [...prompt.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].split('|').map((option) => option.trim()));

/** The answer a learner starts from; dialogue lines start in the printed order. */
export function emptyAnswer(item: Pick<ExerciseItem, 'prompt' | 'options'>): ExerciseAnswer {
  const blanks = countBlanks(item.prompt);
  return {
    singleAnswer: '',
    multiAnswers: blanks > 1 ? new Array<string>(blanks).fill('') : [],
    choiceSelections: new Array<string>(choiceGroups(item.prompt).length).fill(''),
    selectedOdd: null,
    dialogueOrder: item.options ? [...item.options] : [],
    matchSelection: '',
  };
}

/**
 * Whether the learner has done anything for this item. A dialogue always counts
 * as filled because its lines start out arranged.
 */
export function isAnswerFilled(type: ExerciseType, answer: ExerciseAnswer): boolean {
  if (type === 'DIALOGUE_ORDER') return true;
  return Boolean(
    answer.singleAnswer.trim() ||
    answer.multiAnswers.some((value) => value.trim()) ||
    answer.choiceSelections.some((value) => value.trim()) ||
    answer.selectedOdd !== null ||
    answer.matchSelection.trim(),
  );
}

/** Reference answer as one line of text; slots are joined with " / ". */
export const expectedAnswerText = (item: Pick<ExerciseItem, 'expectedAnswer'>) =>
  Array.isArray(item.expectedAnswer) ? item.expectedAnswer.join(' / ') : item.expectedAnswer;

/** The learner's answer as one line of text, for the attempt log. */
export function recordedAnswerText(type: ExerciseType, item: Pick<ExerciseItem, 'prompt'>, answer: ExerciseAnswer) {
  if (type === 'ODD_ONE_OUT') return answer.selectedOdd || '';
  if (type === 'MATCH_PAIRS') return answer.matchSelection;
  if (type === 'DIALOGUE_ORDER') return answer.dialogueOrder.join(' / ');
  if (type === 'CHOICE_SELECT' && choiceGroups(item.prompt).length > 0) return answer.choiceSelections.join(' / ');
  if (countBlanks(item.prompt) > 1) return answer.multiAnswers.join(' / ');
  return answer.singleAnswer;
}
