/**
 * Checks the shared exercise catalogue fixture: it parses, covers every exercise
 * type, quotes only the article, answers every item, and its mock AI answers
 * parse. Owns these assertions only; the data is in tests/fixtures/exerciseCatalog.ts.
 */
import { expect, test } from 'bun:test';
import {
  CATALOG_ANSWERS,
  CATALOG_ARTICLE,
  CATALOG_EXERCISES,
  CATALOG_EXPLANATION,
  CATALOG_HINT,
  CATALOG_OPEN_GRADE,
} from './fixtures/exerciseCatalog';
import { emptyAnswer } from '../src/services/exercises/answer';
import { unsupportedQuotes } from '../src/services/exercises/answerability';
import { gradeItem } from '../src/services/exercises/grading';
import { ExplanationSchema, GeneratedExercisesSchema, HintSchema, OpenGradeSchema } from '../src/types/exerciseAi';
import { ExerciseTypeSchema, effectiveItemType } from '../src/types/exercises';

const entries = CATALOG_EXERCISES.units.flatMap((unit) => unit.items.map((item) => ({ unit, item })));

test('the catalogue parses with GeneratedExercisesSchema', () => {
  const result = GeneratedExercisesSchema.safeParse(CATALOG_EXERCISES);
  expect(result.success ? [] : result.error.issues).toEqual([]);
});

test('the units cover all 11 exercise types, with at least one item each', () => {
  const covered = new Set(entries.map(({ unit, item }) => effectiveItemType(item, unit)));
  expect([...covered].sort()).toEqual([...ExerciseTypeSchema.options].sort());
});

test('item ids are unique across the catalogue, so answers can be keyed by id', () => {
  const ids = entries.map(({ item }) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('every quote occurs verbatim in the article', () => {
  expect(unsupportedQuotes(CATALOG_EXERCISES.units, CATALOG_ARTICLE)).toEqual([]);
});

test('every item has a right and a wrong answer, and nothing else', () => {
  expect(Object.keys(CATALOG_ANSWERS).sort()).toEqual(entries.map(({ item }) => item.id).sort());
  for (const { item } of entries) {
    const { right, wrong } = CATALOG_ANSWERS[item.id];
    const fields = Object.keys(emptyAnswer(item)).sort();
    expect(Object.keys(right).sort()).toEqual(fields);
    expect(Object.keys(wrong).sort()).toEqual(fields);
  }
});

for (const { unit, item } of entries) {
  test(`${item.id}: the right answer grades correct and the wrong one incorrect`, () => {
    const type = effectiveItemType(item, unit);
    const { right, wrong } = CATALOG_ANSWERS[item.id];
    for (const strictAccents of [false, true]) {
      expect(gradeItem(type, item, right, { strictAccents })).toMatchObject({ status: 'graded', correct: true });
      expect(gradeItem(type, item, wrong, { strictAccents })).toMatchObject({ status: 'graded', correct: false });
    }
  });
}

test('the mock AI answers parse with their schemas', () => {
  const hint = HintSchema.safeParse(CATALOG_HINT);
  const explanation = ExplanationSchema.safeParse(CATALOG_EXPLANATION);
  const grade = OpenGradeSchema.safeParse(CATALOG_OPEN_GRADE);
  expect(hint.success ? [] : hint.error.issues).toEqual([]);
  expect(explanation.success ? [] : explanation.error.issues).toEqual([]);
  expect(grade.success ? [] : grade.error.issues).toEqual([]);
});
