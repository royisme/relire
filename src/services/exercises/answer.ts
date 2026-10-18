/**
 * Helpers for the learner's answer to one item: how many blanks and choice
 * groups a prompt has, the prompt as plain speech, the empty answer for an item,
 * and whether an answer is filled. Pure and React-free; shared by grading and
 * the exercise sheet. Does not own grading rules or persistence.
 */
import type { ExerciseAnswer, ExerciseItem, ExerciseType } from '../../types/exercises';

/** Number of `[___]` blanks in a prompt. */
export const countBlanks = (prompt: string) => (prompt.match(/\[___\]/g) || []).length;

/** Inline `{a|b}` option groups in a CHOICE_SELECT prompt, in order. */
export const choiceGroups = (prompt: string) =>
  [...prompt.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].split('|').map((option) => option.trim()));

/**
 * A prompt as something to read aloud: `[___]` blanks and `{a|b}` groups are
 * markup, not words, so they are left out instead of being spoken.
 */
export function spokenPrompt(prompt: string): string {
  return choicePieces(prompt)
    .filter((piece) => piece.kind === 'text')
    .map((piece) => piece.text)
    .join(' ')
    .replace(/\[___\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

/**
 * A stored answer made usable for the item as it is now. Rows are written by
 * the sheet, but a restored backup or an edited unit can leave arrays shorter
 * or longer than the item's blanks and choices; missing slots start empty and
 * extra ones are dropped, so a control never reads past its slots.
 */
export function restoreAnswer(
  item: Pick<ExerciseItem, 'prompt' | 'options'>,
  stored: Partial<ExerciseAnswer>,
): ExerciseAnswer {
  const empty = emptyAnswer(item);
  const fit = (values: string[] | undefined, size: number) =>
    Array.from({ length: size }, (_, index) => values?.[index] ?? '');
  return {
    singleAnswer: stored.singleAnswer ?? empty.singleAnswer,
    multiAnswers: fit(stored.multiAnswers, empty.multiAnswers.length),
    choiceSelections: fit(stored.choiceSelections, empty.choiceSelections.length),
    selectedOdd: stored.selectedOdd ?? null,
    dialogueOrder: stored.dialogueOrder?.length ? stored.dialogueOrder : empty.dialogueOrder,
    matchSelection: stored.matchSelection ?? '',
  };
}

/** A sentence with inline `{a|b}` choices cut into plain text and choice groups, numbered in reading order. */
export type ChoicePiece = { kind: 'text'; text: string } | { kind: 'group'; index: number; options: string[] };

export function choicePieces(prompt: string): ChoicePiece[] {
  let index = 0;
  return prompt
    .split(/(\{[^}]+\})/g)
    .filter(Boolean)
    .map((part): ChoicePiece => {
      if (!/^\{[^}]+\}$/.test(part)) return { kind: 'text', text: part };
      return {
        kind: 'group',
        index: index++,
        options: part
          .slice(1, -1)
          .split('|')
          .map((option) => option.trim()),
      };
    });
}
