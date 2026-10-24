/** Owns pure ordered Today checklist selection, not activity counting, data loading or presentation. */
export type Source<T> = { value: T } | { error: string };
export type TodayStepId = 'words' | 'read' | 'sound' | 'mistakes' | 'grammar';
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
  /** The reader's French title, as the Read list shows it (never localized). */
  title: string;
  version?: string;
  status: 'read' | 'opened' | 'notOpened';
  activeToday: boolean;
}
/** The grammar step's next book-order topic and today's studied mark; requires a content service. */
export interface TodayGrammar {
  next?: { topicId: string; title: string };
  studiedToday: boolean;
}
export interface TodayInput {
  words: Source<TodayWords>;
  /** Merged catalogue joined with progress, ascending by order. */
  readers: Source<TodayReader[]>;
  sound: Source<{ attemptsToday: number }>;
  mistakes: Source<{ unresolved: number; attemptsToday: number }>;
  /** The aside's day counts; each source fails on its own, and a failure omits the count, never 0. */
  counts: { exercises: Source<number>; readers: Source<number> };
  /** Absent when no content service is configured: no grammar step at all. */
  grammar?: Source<TodayGrammar>;
}
export type TodayStep =
  | { id: 'words'; done: boolean; due: number; newAvailable: number }
  | {
      id: 'read';
      done: boolean;
      readerId: string;
      order: number;
      title: string;
      version?: string;
      state: 'start' | 'continue' | 'doneToday';
    }
  | { id: 'sound'; done: boolean }
  | { id: 'mistakes'; done: boolean; unresolved: number }
  | { id: 'grammar'; done: boolean; topicId: string; title: string }
  | { id: TodayStepId; done: false; error: string };
export interface TodayPlan {
  steps: TodayStep[];
  allDone: boolean;
  /** First step to act on; undefined when every step is done or failed (a failed step is never next). */
  nextIndex: number | undefined;
  doneCount: number;
  /** Real day counts; a key is absent when its source failed, never 0. */
  counts: { reviews?: number; exercises?: number; readers?: number };
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
        title: focus.title,
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

  if (input.grammar !== undefined) {
    if ('error' in input.grammar) {
      steps.push({ id: 'grammar', done: false, error: input.grammar.error });
    } else {
      const { next, studiedToday } = input.grammar.value;
      if (next !== undefined)
        steps.push({ id: 'grammar', done: studiedToday, topicId: next.topicId, title: next.title });
    }
  }

  const nextAt = steps.findIndex((step) => !step.done && !('error' in step));
  const counts: TodayPlan['counts'] = {};
  if (!('error' in input.words)) counts.reviews = input.words.value.reviewsToday;
  if (!('error' in input.counts.exercises)) counts.exercises = input.counts.exercises.value;
  if (!('error' in input.counts.readers)) counts.readers = input.counts.readers.value;

  return {
    steps,
    allDone: steps.length > 0 && steps.every((step) => step.done),
    nextIndex: nextAt === -1 ? undefined : nextAt,
    doneCount: steps.filter((step) => step.done).length,
    counts,
  };
}
