/** Owns the TEST-only reader verdict assertions: strict grading and authored feedback, never AI or storage. */
import { expect, test } from 'bun:test';
import { emptyAnswer } from '../src/services/exercises/answer';
import { effectiveStrictAccents, gradeItem } from '../src/services/exercises/grading';
import { gradeReaderQuestion, readerQuestionItem } from '../src/services/gradedReaders/checkpoints';
import { gradedReaderFixture } from './fixtures/gradedReaders';
import type { ReaderQuestion } from '../src/types/gradedReader';

const questions = () => gradedReaderFixture().learning.checkpoints[0]!.questions;

const choice = () => questions()[0]!;
const typed = () => questions()[1]!;
const check = (question: ReaderQuestion, patch: Partial<ReturnType<typeof emptyAnswer>>) =>
  gradeReaderQuestion(question, { ...emptyAnswer({ prompt: question.question.prompt, options: undefined }), ...patch });

test('the recognition question grades the picked option and reports the reference answer', () => {
  const question = choice();
  expect(check(question, { choiceSelections: ['un livre'] })).toMatchObject({
    correct: true,
    expectedAnswer: 'un livre',
    feedback: question.question.feedback.correct,
  });
});

test('a wrong option reports the authored message for that option', () => {
  const question = choice();
  const verdict = check(question, { choiceSelections: ['le livre'] });
  expect(verdict.correct).toBe(false);
  expect(verdict.expectedAnswer).toBe('un livre');
  expect(verdict.feedback).toBe(question.question.feedback.byAnswer![0]!.message);
  // The generic incorrect message stays behind the specific one, never beside it.
  expect(verdict.feedback).not.toBe(question.question.feedback.incorrect);
});

test('an unmatched typed answer falls back to the authored incorrect message', () => {
  const question = typed();
  const verdict = check(question, { singleAnswer: 'livre' });
  expect(verdict.correct).toBe(false);
  expect(verdict.expectedAnswer).toBe('petit');
  expect(verdict.feedback).toBe(question.question.feedback.incorrect);
});

test('accents count whatever the learner preference is, because the item requires them', () => {
  const question: ReaderQuestion = structuredClone(typed());
  question.question.expectedAnswer = 'élève';
  const answer = { ...emptyAnswer({ prompt: question.question.prompt, options: undefined }), singleAnswer: 'eleve' };
  const item = readerQuestionItem(question);
  expect(effectiveStrictAccents(item, { strictAccents: false })).toBe(true);
  // Without that requirement the shared grader would accept the lenient comparison; a reader check never offers it.
  const lenient = gradeItem('FILL_BLANKS', { ...item, meta: undefined }, answer, { strictAccents: false });
  expect(lenient).toEqual({ status: 'graded', correct: true, recordedAnswer: 'eleve' });
  expect(check(question, { singleAnswer: 'eleve' }).correct).toBe(false);
  expect(check(question, { singleAnswer: 'élève' }).correct).toBe(true);
});

test('whitespace and punctuation follow the shared French comparison key', () => {
  const question = typed();
  expect(check(question, { singleAnswer: '  PETIT  ' }).correct).toBe(true);
  expect(check(question, { singleAnswer: 'petit.' }).correct).toBe(false);
  expect(check(question, { singleAnswer: 'petit,' }).correct).toBe(false);
});

test('a typed question accepts an authored acceptable answer', () => {
  const question = typed();
  question.question.acceptableAnswers = ['petit ici'];
  expect(check(question, { singleAnswer: 'PETIT ICI' }).correct).toBe(true);
});

test('the evidence sentence is never the source of a verdict', () => {
  const question = choice();
  expect(question.evidence.quote).toBe('C’est un livre.');
  expect(check(question, { choiceSelections: ['C’est un livre.'] }).correct).toBe(false);
});
