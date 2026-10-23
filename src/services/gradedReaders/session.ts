/** Serializes one opened edition's draft/check/redo/completion writes using only its captured epoch and revision. */
import type { ExerciseAnswer } from '../../types/exercises';
import type { ReaderProgress, ReaderSession } from '../../types/readerProgress';
import {
  saveReaderAnswer,
  checkReaderAnswer,
  redoReaderQuestion,
  setReaderCompletion,
  StaleReaderError,
} from '../../storage/gradedReaders';
import { gradeReaderQuestion } from './checkpoints';

export type OpenedReader = { row: ReaderProgress; session: ReaderSession };

export function readerSession(opened: OpenedReader, committed: (row: ReaderProgress) => void) {
  let current = opened;
  let listener: ((row: ReaderProgress) => void) | undefined = committed;
  let tail = Promise.resolve();
  let stale = false;
  const drafts = new Map<string, ExerciseAnswer>();
  const adopt = (next: OpenedReader) => {
    current = next;
    listener?.(next.row);
  };
  const flush = async () => {
    while (drafts.size) {
      const [id, answer] = drafts.entries().next().value!;
      const next = await saveReaderAnswer(current.session, id, answer);
      if (drafts.get(id) === answer) drafts.delete(id);
      adopt(next);
    }
  };
  const enqueue = (action: () => Promise<void>) => {
    const next = tail.then(async () => {
      if (stale) throw new StaleReaderError();
      try {
        await action();
      } catch (error) {
        if (error instanceof StaleReaderError) stale = true;
        throw error;
      }
    });
    tail = next.catch(() => undefined);
    return next;
  };
  return {
    listen: (next?: (row: ReaderProgress) => void) => {
      listener = next;
    },
    answers: () => ({
      ...current.row.answers,
      ...Object.fromEntries([...drafts].map(([id, answer]) => [id, { answer, checked: null }])),
    }),
    draft: (id: string, answer: ExerciseAnswer) => {
      drafts.set(id, answer);
    },
    flush: () => enqueue(flush),
    check: (id: string) =>
      enqueue(async () => {
        await flush();
        adopt(await checkReaderAnswer(current.session, id, gradeReaderQuestion));
      }),
    redo: (id: string) =>
      enqueue(async () => {
        drafts.delete(id);
        await flush();
        adopt(await redoReaderQuestion(current.session, id));
      }),
    complete: (completed: boolean) =>
      enqueue(async () => {
        await flush();
        adopt(await setReaderCompletion(current.session, completed));
      }),
  };
}
