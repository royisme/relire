/** Owns durable reader-edition opens and guarded field writes in meta; no exercise rows or UI state. */
import type { IDBPTransaction } from 'idb';
import { PublishedReaderSchema } from '../types/gradedReader';
import type { ExerciseAnswer } from '../types/exercises';
import {
  ReaderProgressSchema,
  ReaderCheckedSchema,
  readerProgressKey,
  type ReaderProgress,
  type ReaderSession,
  type ReaderQuestionGrader,
} from '../types/readerProgress';
import { vocabularyHash, canonicalVocabularyJson } from '../services/vocabulary/book';
import { db, type RelireDB } from './db';

const listeners = new Set<() => void | Promise<void>>();
export function subscribeReaders(listener: () => void | Promise<void>) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function readersChanged() {
  await Promise.allSettled([...listeners].map(async (listener) => listener()));
}
export class StaleReaderError extends Error {
  constructor() {
    super('Reader session changed; reload the edition');
    this.name = 'StaleReaderError';
  }
}
export class ReaderEditionConflictError extends Error {
  constructor() {
    super('Reader snapshot differs under the same edition identity');
    this.name = 'ReaderEditionConflictError';
  }
}
type Transaction = IDBPTransaction<RelireDB, ['meta'], 'readwrite'>;
async function write<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = (await db()).transaction(['meta'] as const, 'readwrite');
  let result: T;
  try {
    result = await action(tx);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already aborted. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
  await tx.done;
  await readersChanged();
  return result;
}
async function epoch(tx: Transaction) {
  return ((await tx.objectStore('meta').get('readerEpoch')) as number | undefined) ?? 0;
}
function result(row: ReaderProgress, epoch: number) {
  return { row, session: { readerId: row.readerId, version: row.version, revision: row.revision, epoch } };
}
export async function listReaderProgress(): Promise<ReaderProgress[]> {
  const tx = (await db()).transaction('meta');
  const range = IDBKeyRange.bound('readerProgress:', 'readerProgress:\uffff');
  const rows = await tx.store.getAll(range);
  await tx.done;
  return rows
    .map((row) => ReaderProgressSchema.parse(row))
    .sort(
      (a, b) =>
        a.snapshot.body.order - b.snapshot.body.order ||
        a.readerId.localeCompare(b.readerId) ||
        a.version.localeCompare(b.version),
    );
}
/** Hashing/validation must finish before IDB opens; the committed snapshot is the workspace authority. */
export async function openReaderEdition(input: unknown, now = Date.now()) {
  const snapshot = PublishedReaderSchema.parse(input);
  if ((await vocabularyHash(snapshot.body)) !== snapshot.version) throw new ReaderEditionConflictError();
  return write(async (tx) => {
    const key = readerProgressKey(snapshot.body.id, snapshot.version);
    const stored = await tx.objectStore('meta').get(key);
    const prior = stored === undefined ? undefined : ReaderProgressSchema.parse(stored);
    if (prior && canonicalVocabularyJson(prior.snapshot) !== canonicalVocabularyJson(snapshot))
      throw new ReaderEditionConflictError();
    const row = ReaderProgressSchema.parse(
      prior
        ? { ...prior, lastOpenedAt: now }
        : {
            readerId: snapshot.body.id,
            version: snapshot.version,
            snapshot,
            openedAt: now,
            lastOpenedAt: now,
            lastSentenceId: null,
            answers: {},
            completedAt: null,
            revision: 0,
          },
    );
    await tx.objectStore('meta').put(row, key);
    return result(row, await epoch(tx));
  });
}
async function current(tx: Transaction, session: ReaderSession) {
  if ((await epoch(tx)) !== session.epoch) throw new StaleReaderError();
  const stored = await tx.objectStore('meta').get(readerProgressKey(session.readerId, session.version));
  if (stored === undefined) throw new StaleReaderError();
  return ReaderProgressSchema.parse(stored);
}
function guard(row: ReaderProgress, session: ReaderSession) {
  if (row.revision !== session.revision) throw new StaleReaderError();
}
function question(row: ReaderProgress, questionId: string) {
  const found = row.snapshot.body.learning.checkpoints
    .flatMap((checkpoint) => checkpoint.questions)
    .find((entry) => entry.question.id === questionId);
  if (!found) throw new Error('Unknown reader question');
  return found;
}
async function put(tx: Transaction, row: ReaderProgress, session: ReaderSession) {
  const updated = ReaderProgressSchema.parse({ ...row, revision: row.revision + 1 });
  await tx.objectStore('meta').put(updated, readerProgressKey(row.readerId, row.version));
  return result(updated, session.epoch);
}
export async function saveReaderAnswer(session: ReaderSession, questionId: string, answer: ExerciseAnswer) {
  return write(async (tx) => {
    const row = await current(tx, session);
    guard(row, session);
    question(row, questionId);
    if (row.answers[questionId]?.checked) throw new Error('Redo the reader question before editing');
    return put(tx, { ...row, answers: { ...row.answers, [questionId]: { answer, checked: null } } }, session);
  });
}
export async function checkReaderAnswer(
  session: ReaderSession,
  questionId: string,
  grade: ReaderQuestionGrader,
  now = Date.now(),
) {
  return write(async (tx) => {
    const row = await current(tx, session);
    const item = question(row, questionId);
    const saved = row.answers[questionId];
    // Only the immediately committed check may receipt an older revision; redo/other writes invalidate it.
    if (saved?.checked) {
      if (row.revision !== session.revision && row.revision !== session.revision + 1) throw new StaleReaderError();
      return result(row, session.epoch);
    }
    guard(row, session);
    if (!saved) throw new Error('Reader question has no saved answer');
    const checked = ReaderCheckedSchema.parse({
      correct: grade(item, saved.answer).correct,
      strictAccents: true,
      checkedAt: now,
    });
    return put(tx, { ...row, answers: { ...row.answers, [questionId]: { ...saved, checked } } }, session);
  });
}
export async function redoReaderQuestion(session: ReaderSession, questionId: string) {
  return write(async (tx) => {
    const row = await current(tx, session);
    guard(row, session);
    question(row, questionId);
    const answers = { ...row.answers };
    delete answers[questionId];
    return put(tx, { ...row, answers }, session);
  });
}
export async function setReaderCompletion(session: ReaderSession, completed: boolean, now = Date.now()) {
  return write(async (tx) => {
    const row = await current(tx, session);
    guard(row, session);
    return put(tx, { ...row, completedAt: completed ? now : null }, session);
  });
}
