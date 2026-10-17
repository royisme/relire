/**
 * Storage test helpers: a fresh in-memory IndexedDB per test (fake-indexeddb),
 * a seeded material, and shorthand for the answers the exercise tests check.
 * Import this module before any `src/storage` module is used.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { Article } from '../../src/types';
import type { ExerciseAnswer, ExerciseUnit } from '../../src/types/exercises';
import { closeDb, db } from '../../src/storage/db';
import { saveUnits } from '../../src/storage/exercises';
import { emptyAnswer } from '../../src/services/exercises/answer';
import { ITEMS, unitOf } from './units';

/** Drops the previous connection and installs an empty database for the next `db()` call. */
export async function freshDb() {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
}

export const article = (id = 'material-1', kind?: Article['kind']): Article => ({
  id,
  title: `Material ${id}`,
  level: 'A1',
  category: 'test',
  content: 'Je suis française.',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...(kind ? { kind } : {}),
});

export async function putArticle(id = 'material-1') {
  const d = await db();
  await d.put('articles', article(id));
  await d.put('meta', true, 'started'); // as saveArticle does; without it loadData treats the app as never used
}

/** A material with one stored FILL_BLANKS unit holding two items. */
export async function seedUnit(materialId = 'material-1'): Promise<ExerciseUnit> {
  await putArticle(materialId);
  const base = unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS, ITEMS.FILL_BLANKS_MULTI]);
  const [unit] = await saveUnits(materialId, [{ ...base, id: `unit-${materialId}` }]);
  return unit;
}

export const answered = (text: string): ExerciseAnswer => ({
  ...emptyAnswer(ITEMS.FILL_BLANKS),
  singleAnswer: text,
});

/** An answer to the two-blank item (FILL_BLANKS_MULTI): both blanks hold `text`. */
export const answeredMulti = (text: string): ExerciseAnswer => ({
  ...emptyAnswer(ITEMS.FILL_BLANKS_MULTI),
  multiAnswers: [text, text],
});

export const right = { correct: true };
export const wrong = { correct: false };

/** The error a promise rejects with, or undefined when it resolves (Bun's `.rejects` types trip the lint rules). */
export async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}
