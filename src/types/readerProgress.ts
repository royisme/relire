/** Owns strict learner reader-edition rows and session capabilities, not grading or IndexedDB. */
import { z } from 'zod';
import { PublishedReaderSchema, type ReaderQuestion } from './gradedReader';
import type { ExerciseAnswer } from './exercises';
import { choiceGroups } from '../services/exercises/answer';

export const ReaderAnswerSchema = z.strictObject({
  singleAnswer: z.string(),
  multiAnswers: z.array(z.string()),
  choiceSelections: z.array(z.string()),
  selectedOdd: z.string().nullable(),
  dialogueOrder: z.array(z.string()),
  matchSelection: z.string(),
});
export const ReaderCheckedSchema = z.strictObject({
  correct: z.boolean(),
  strictAccents: z.literal(true),
  checkedAt: z.number().finite(),
});
export type ReaderChecked = z.infer<typeof ReaderCheckedSchema>;
/** R1-7 supplies the synchronous strict checker; storage never accepts a caller's verdict. */
export type ReaderQuestionGrader = (question: ReaderQuestion, answer: ExerciseAnswer) => { correct: boolean };
export const ReaderProgressSchema = z
  .strictObject({
    readerId: z.string().min(1),
    version: z.string().regex(/^[0-9a-f]{64}$/),
    snapshot: PublishedReaderSchema,
    openedAt: z.number().finite(),
    lastOpenedAt: z.number().finite(),
    lastSentenceId: z.string().nullable(),
    answers: z.record(
      z.string(),
      z.strictObject({ answer: ReaderAnswerSchema, checked: ReaderCheckedSchema.nullable() }),
    ),
    completedAt: z.number().finite().nullable(),
    revision: z.number().int().nonnegative(),
  })
  .superRefine((row, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (row.readerId !== row.snapshot.body.id || row.version !== row.snapshot.version) fail('Reader identity mismatch');
    if (
      row.lastSentenceId !== null &&
      !row.snapshot.body.sentences.some((sentence) => sentence.id === row.lastSentenceId)
    )
      fail('Unknown reader sentence');
    const questions = row.snapshot.body.learning.checkpoints.flatMap((checkpoint) => checkpoint.questions);
    for (const [id, { answer }] of Object.entries(row.answers)) {
      const question = questions.find((entry) => entry.question.id === id)?.question;
      if (!question) {
        fail('Unknown reader question');
        continue;
      }
      if (
        answer.multiAnswers.length ||
        answer.dialogueOrder.length ||
        answer.selectedOdd !== null ||
        answer.matchSelection
      )
        fail('Answer contains fields for another question type');
      if (question.type === 'CHOICE_SELECT') {
        const options = choiceGroups(question.prompt)[0];
        if (
          answer.singleAnswer ||
          answer.choiceSelections.length !== 1 ||
          answer.choiceSelections.some((value) => value !== '' && !options.includes(value))
        )
          fail('Invalid reader choice');
      } else if (answer.choiceSelections.length) fail('Typed answer contains choice selections');
    }
  });
export type ReaderProgress = z.infer<typeof ReaderProgressSchema>;
export interface ReaderSession {
  readerId: string;
  version: string;
  epoch: number;
  revision: number;
}
export const readerProgressKey = (readerId: string, version: string) =>
  `readerProgress:${encodeURIComponent(readerId)}:${version}`;
