/** Owns pure ordered Today checklist selection, not activity counting, data loading or presentation. */
export type Source<T> = { value: T } | { error: string };
export type TodayStepId = 'words' | 'read' | 'sound' | 'mistakes';
/** The words step's queue counts. */
export interface TodayWords {
  due: number;
  newAvailable: number;
  reviewsToday: number;
}
/** One merged-catalogue reader joined with progress; a service edition carries its version. */
export interface TodayReader {
  readerId: string;
  order: number;
  version?: string;
  status: 'read' | 'opened' | 'notOpened';
  activeToday: boolean;
}
export interface TodayInput {
  words: Source<TodayWords>;
  /** Merged catalogue joined with progress, ascending by order. */
  readers: Source<TodayReader[]>;
  sound: Source<{ attemptsToday: number }>;
  mistakes: Source<{ unresolved: number; attemptsToday: number }>;
}
export type TodayStep =
  | { id: 'words'; done: boolean; due: number; newAvailable: number }
  | {
      id: 'read';
      done: boolean;
      readerId: string;
      order: number;
      version?: string;
      state: 'start' | 'continue' | 'doneToday';
    }
  | { id: 'sound'; done: boolean }
  | { id: 'mistakes'; done: boolean; unresolved: number }
  | { id: TodayStepId; done: false; error: string };
export interface TodayPlan {
  steps: TodayStep[];
  allDone: boolean;
}

export function buildTodayPlan(input: TodayInput): TodayPlan {
  const steps: TodayStep[] = [];
  if ('error' in input.words) {
    steps.push({ id: 'words', done: false, error: input.words.error });
  } else {
    const { due, newAvailable, reviewsToday } = input.words.value;
    if (due + newAvailable > 0 || reviewsToday > 0)
      steps.push({ id: 'words', done: reviewsToday > 0 && due + newAvailable === 0, due, newAvailable });
  }

  if ('error' in input.readers) {
    steps.push({ id: 'read', done: false, error: input.readers.error });
  } else {
    const readers = input.readers.value;
    const focus =
      readers.findLast((reader) => reader.activeToday) ?? readers.find((reader) => reader.status !== 'read');
    if (focus)
      steps.push({
        id: 'read',
        done: readers.some((reader) => reader.activeToday),
        readerId: focus.readerId,
        order: focus.order,
        ...(focus.version !== undefined ? { version: focus.version } : {}),
        state: focus.status === 'read' ? 'doneToday' : focus.status === 'opened' ? 'continue' : 'start',
      });
  }

  if ('error' in input.sound) {
    steps.push({ id: 'sound', done: false, error: input.sound.error });
  } else {
    steps.push({ id: 'sound', done: input.sound.value.attemptsToday > 0 });
  }

  if ('error' in input.mistakes) {
    steps.push({ id: 'mistakes', done: false, error: input.mistakes.error });
  } else {
    const { unresolved, attemptsToday } = input.mistakes.value;
    if (unresolved > 0 || attemptsToday > 0) steps.push({ id: 'mistakes', done: attemptsToday > 0, unresolved });
  }

  return { steps, allDone: steps.length > 0 && steps.every((step) => step.done) };
}
