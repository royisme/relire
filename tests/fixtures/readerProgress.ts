/** TEST-only synchronous grader adapter and answers for invented reader persistence fixtures. */
import type { ReaderQuestionGrader } from '../../src/types/readerProgress';
import { gradeItem } from '../../src/services/exercises/grading';
import { emptyAnswer } from '../../src/services/exercises/answer';
import { publishedReaderFixture } from './gradedReaders';

export const testReaderGrader: ReaderQuestionGrader = ({ question }, answer) => {
  const result = gradeItem(question.type, { ...question, itemNumber: 1, grammarTag: 'articles' }, answer, {
    strictAccents: true,
  });
  if (result.status !== 'graded') throw new Error('TEST question must be deterministic');
  return result;
};
export function readerAnswer(questionIndex: 0 | 1, value: string) {
  const { question } = publishedReaderFixture().body.learning.checkpoints[0].questions[questionIndex];
  const answer = emptyAnswer(question);
  if (question.type === 'CHOICE_SELECT') answer.choiceSelections[0] = value;
  else answer.singleAnswer = value;
  return answer;
}
