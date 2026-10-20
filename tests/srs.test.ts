/** Exact two-step and mature vocabulary scheduler contracts, including calendar boundaries and immutability. */
import { expect, test } from 'bun:test';
import type { VocabularyRating, VocabularySchedule } from '../src/types/vocabulary';
import {
  addDays,
  formatDate,
  initialVocabularySchedule,
  nextVocabularySchedule,
  vocabularyDue,
} from '../src/utils/srs';
const now = new Date(2026, 9, 20, 12).getTime();
const ratings: VocabularyRating[] = [1, 3, 4, 5];
test('all learning and relearning transitions use minute steps without changing ease', () => {
  for (const phase of ['learning', 'relearning'] as const)
    for (const step of [0, 1] as const) {
      const prior: VocabularySchedule = { ...initialVocabularySchedule(now), phase, step, easeFactor: 1.7 };
      const before = structuredClone(prior);
      for (const rating of ratings) {
        const result = nextVocabularySchedule(prior, rating, now);
        expect(result.easeFactor).toBe(1.7);
        if (rating === 5 || (step === 1 && rating === 4))
          expect(result).toEqual({
            phase: 'review',
            dueDate: '2026-10-21',
            repetitions: 1,
            intervalDays: 1,
            easeFactor: 1.7,
          });
        else {
          const expectedStep = rating === 1 ? 0 : rating === 4 ? 1 : step;
          expect(result).toEqual({
            ...prior,
            step: expectedStep,
            dueAt: now + (rating === 1 ? 1 : rating === 3 && expectedStep === 0 ? 6 : 10) * 60_000,
          });
        }
      }
      expect(prior).toEqual(before);
    }
});
test('mature Again enters one-minute relearning; due is real rather than an immediate repeat', () => {
  const result = nextVocabularySchedule(
    { phase: 'review', repetitions: 5, intervalDays: 20, easeFactor: 1.4, dueDate: '2026-10-20' },
    1,
    now,
  );
  expect(result).toEqual({
    phase: 'relearning',
    step: 0,
    dueAt: now + 60_000,
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 1.3,
  });
  expect(vocabularyDue(result, now)).toBe(false);
  expect(vocabularyDue(result, now + 60_000)).toBe(true);
});
test('mature ratings share immediate interval but have distinct future ease and floor convergence', () => {
  for (const easeFactor of [2.5, 1.3]) {
    const prior: VocabularySchedule = {
      phase: 'review',
      repetitions: 2,
      intervalDays: 7,
      easeFactor,
      dueDate: '2026-10-20',
    };
    const results = ([3, 4, 5] as const).map((rating) => nextVocabularySchedule(prior, rating, now));
    expect(results.map((s) => s.intervalDays)).toEqual(Array(3).fill(Math.round(7 * easeFactor)));
    expect(results.map((s) => s.easeFactor)).toEqual(easeFactor === 2.5 ? [2.36, 2.5, 2.6] : [1.3, 1.3, 1.4]);
  }
  for (const rating of [3, 4, 5] as const)
    expect(
      nextVocabularySchedule(
        { phase: 'review', repetitions: 1, intervalDays: 1, easeFactor: 2.5, dueDate: '2026-10-20' },
        rating,
        now,
      ).intervalDays,
    ).toBe(rating === 3 ? 3 : 6);
});
test('null is not due; calendar days handle leap year and DST without elapsed-day arithmetic', () => {
  expect(vocabularyDue(null, now)).toBe(false);
  expect(formatDate(addDays(new Date(2024, 1, 28, 12), 1))).toBe('2024-02-29');
  const original = process.env.TZ;
  process.env.TZ = 'America/Toronto';
  try {
    const before = new Date(2026, 2, 7, 12);
    const after = addDays(before, 1);
    expect(after.getHours()).toBe(12);
    expect(after.getTime() - before.getTime()).toBe(23 * 60 * 60_000);
  } finally {
    process.env.TZ = original;
  }
});
