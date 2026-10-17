import { afterEach, expect, setSystemTime, test } from 'bun:test';
import type { VocabWord } from '../src/types';
import { addDays, calculateNextReview, formatDate, isDueToday, SM2_MIN_EASE } from '../src/utils/srs';

const word = (overrides: Partial<VocabWord> = {}): VocabWord => ({
  id: 'alpha',
  word: 'alpha',
  lemma: 'alpha',
  ipa: '',
  translation: 'alpha',
  partOfSpeech: 'nom',
  contextSentence: '',
  addedAt: '2026-10-01',
  repetitions: 0,
  intervalDays: 1,
  easeFactor: 2.5,
  nextReviewDate: '2026-10-17',
  reviewHistory: [],
  ...overrides,
});

// Local noon keeps calendar assertions independent of the machine's timezone.
const now = new Date(2026, 9, 17, 12);
afterEach(() => setSystemTime());

test('every first-review rating schedules one day, not static 3/6/12-day promises', () => {
  setSystemTime(now);
  for (const rating of [1, 3, 4, 5]) {
    const source = word();
    const updated = calculateNextReview(source, rating);
    expect(updated.intervalDays).toBe(1);
    expect(updated.nextReviewDate).toBe('2026-10-18');
    expect(updated.repetitions).toBe(rating === 1 ? 0 : 1);
    expect(updated.reviewHistory).toEqual([
      { date: '2026-10-17', rating, intervalDays: 1, easeFactor: updated.easeFactor },
    ]);
    expect(updated.lastReviewedAt).toBe(now.toISOString());
    expect(isDueToday(updated)).toBe(false);
    expect(source.reviewHistory).toEqual([]);
  }
});

test('second successful review uses three days for rating 3, six for ratings 4 and 5', () => {
  setSystemTime(now);
  const first = calculateNextReview(word(), 4);
  for (const [rating, days] of [
    [3, 3],
    [4, 6],
    [5, 6],
  ]) {
    const updated = calculateNextReview(first, rating);
    expect(updated.intervalDays).toBe(days);
    expect(updated.nextReviewDate).toBe(formatDate(addDays(now, days)));
    expect(updated.repetitions).toBe(2);
    expect(updated.reviewHistory).toHaveLength(2);
    expect(updated.reviewHistory[0]).toEqual(first.reviewHistory[0]);
  }
  expect(first.reviewHistory).toHaveLength(1);
});

test('later reviews multiply by the previous ease before updating it', () => {
  setSystemTime(now);
  const source = word({ repetitions: 3, intervalDays: 7, easeFactor: 2.3 });
  for (const [rating, ease] of [
    [3, 2.16],
    [4, 2.3],
    [5, 2.4],
  ]) {
    const updated = calculateNextReview(source, rating);
    expect(updated.intervalDays).toBe(16);
    expect(updated.nextReviewDate).toBe('2026-11-02');
    expect(updated.easeFactor).toBe(ease);
    expect(updated.repetitions).toBe(4);
  }
});

test('failed recall resets repetitions and interval but preserves prior history and minimum ease', () => {
  setSystemTime(now);
  const history = [{ date: '2026-10-01', rating: 3, intervalDays: 20, easeFactor: 1.4 }];
  const source = word({ repetitions: 5, intervalDays: 20, easeFactor: 1.4, reviewHistory: history });
  const updated = calculateNextReview(source, 1);
  expect(updated.repetitions).toBe(0);
  expect(updated.intervalDays).toBe(1);
  expect(updated.easeFactor).toBe(SM2_MIN_EASE);
  expect(updated.reviewHistory).toEqual([
    ...history,
    { date: '2026-10-17', rating: 1, intervalDays: 1, easeFactor: SM2_MIN_EASE },
  ]);
  expect(source.reviewHistory).toBe(history);
  expect(source.reviewHistory).toHaveLength(1);
});

test('due dates include today and overdue words, but not tomorrow', () => {
  setSystemTime(now);
  expect(isDueToday(word({ nextReviewDate: '2026-10-16' }))).toBe(true);
  expect(isDueToday(word())).toBe(true);
  expect(isDueToday(word({ nextReviewDate: '2026-10-18' }))).toBe(false);
});

test('review dates advance by calendar days across month and leap-year boundaries', () => {
  const leapDay = new Date(2024, 1, 28, 12);
  setSystemTime(leapDay);
  expect(calculateNextReview(word(), 4).nextReviewDate).toBe('2024-02-29');
  expect(formatDate(addDays(leapDay, 2))).toBe('2024-03-01');
});
