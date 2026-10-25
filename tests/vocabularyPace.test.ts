/** P1b acceptance, hand-derived from the rule: sessions split only above 5 minutes, k ratings yield k-1 gaps, null below 30 gaps, nearest-rank percentiles. */
import { expect, test } from 'bun:test';
import type { VocabularyRow } from '../src/types/vocabulary';
import { cardPace, estimateMinutes } from '../src/services/vocabulary/pace';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';

const start = new Date(2026, 9, 25, 10).getTime();
/** Rating timestamps that follow the given gaps: gaps.length + 1 ratings in one run. */
const sessionTimes = (from: number, gaps: number[]): number[] => {
  const times = [from];
  for (const gap of gaps) times.push(times[times.length - 1] + gap);
  return times;
};
const uniform = (count: number, step: number) => Array.from({ length: count }, () => step);
const row = (word: string, times: number[]): VocabularyRow => ({
  ...testRow(word),
  history: times.map((reviewedAt, index) => ({
    operationId: `pace-${word}-${index}`,
    reviewedAt,
    outcome: 'remembered' as const,
    retentionPercent: 90,
    prior: testMatureSchedule(reviewedAt),
    next: testMatureSchedule(reviewedAt),
    revision: index + 1,
  })),
});

test('fewer than 30 gaps is no pace; exactly 30 gaps is', () => {
  // 30 ratings 30 s apart = 29 gaps.
  expect(cardPace([row('test-short-history', sessionTimes(start, uniform(29, 30_000)))])).toBeNull();
  // 31 ratings 30 s apart = 30 gaps, all 30 s: every percentile is 30 s.
  expect(cardPace([row('test-uniform-history', sessionTimes(start, uniform(30, 30_000)))])).toEqual({
    p25: 30_000,
    p50: 30_000,
    p75: 30_000,
  });
});

test('a gap of exactly 5 minutes stays inside the session; one millisecond more splits it', () => {
  // 31 ratings exactly 5 minutes apart: one session, 30 gaps of 5 minutes.
  expect(cardPace([row('test-exact-gap', sessionTimes(start, uniform(30, 300_000)))])).toEqual({
    p25: 300_000,
    p50: 300_000,
    p75: 300_000,
  });
  // The same ratings 1 ms further apart end every session after one rating: 0 gaps, no pace.
  expect(cardPace([row('test-split-gap', sessionTimes(start, uniform(30, 300_001)))])).toBeNull();
});

test('a one-rating session adds no gap and a two-rating session adds one', () => {
  // Two-rating sessions 20 minutes apart (far outside one session), plus one lone rating in between.
  const sessions = (count: number) =>
    Array.from({ length: count }, (_, index) => [index * 1_200_000, index * 1_200_000 + 45_000]).flat();
  const lone = 600_000;
  expect(cardPace([row('test-gap-count', [...sessions(29), lone])])).toBeNull();
  expect(cardPace([row('test-gap-count-plus', [...sessions(30), lone])])).toEqual({
    p25: 45_000,
    p50: 45_000,
    p75: 45_000,
  });
});

test('rows with empty history add nothing', () => {
  expect(cardPace([testRow('test-empty-one'), testRow('test-empty-two')])).toBeNull();
  const rich = row('test-only-history', sessionTimes(start, uniform(30, 30_000)));
  expect(cardPace([testRow('test-empty-beside'), rich])).toEqual({ p25: 30_000, p50: 30_000, p75: 30_000 });
});

test('timestamps from different rows interleave into one time order', () => {
  // Each row is 30 s apart on its own; interleaved they are 15 s apart, and only the merged
  // order reaches 30 gaps (15 + 14 alone would stay under the minimum).
  const even = row('test-even-row', sessionTimes(start, uniform(15, 30_000)));
  const odd = row('test-odd-row', sessionTimes(start + 15_000, uniform(14, 30_000)));
  expect(cardPace([odd, even])).toEqual({ p25: 15_000, p50: 15_000, p75: 15_000 });
});

test('nearest-rank percentiles on gaps of 1 to 30 seconds', () => {
  // Gaps arrive out of value order (evens then odds); sorted they are 1..30 s, so with n = 30:
  // p25 is the ceil(0.25 x 30) = 8th gap (8 s), p50 the 15th (15 s), p75 the ceil(0.75 x 30) = 23rd (23 s).
  const outOfOrder = [
    2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29,
  ];
  expect(outOfOrder).toHaveLength(30);
  expect(
    cardPace([
      row(
        'test-ranks',
        sessionTimes(
          start,
          outOfOrder.map((seconds) => seconds * 1000),
        ),
      ),
    ]),
  ).toEqual({
    p25: 8_000,
    p50: 15_000,
    p75: 23_000,
  });
});

const pace = { p25: 30_000, p50: 45_000, p75: 60_000 };

test('no pace or no cards means no estimate', () => {
  expect(estimateMinutes(null, 4)).toBeNull();
  expect(estimateMinutes(pace, 0)).toBeNull();
});

test('each end is at least one whole minute', () => {
  expect(estimateMinutes({ p25: 2_000, p50: 3_000, p75: 4_000 }, 1)).toEqual({ from: 1, to: 1 });
  expect(estimateMinutes({ p25: 10_000, p50: 20_000, p75: 44_000 }, 1)).toEqual({ from: 1, to: 1 });
});

test('each end rounds to the nearest minute, halves up', () => {
  // 2 x 45 s = 1.5 min and 2 x 75 s = 2.5 min.
  expect(estimateMinutes({ p25: 45_000, p50: 60_000, p75: 75_000 }, 2)).toEqual({ from: 2, to: 3 });
  // 2 x 72 s = 2.4 min and 2 x 78 s = 2.6 min.
  expect(estimateMinutes({ p25: 72_000, p50: 75_000, p75: 78_000 }, 2)).toEqual({ from: 2, to: 3 });
});

test('equal percentiles give equal ends; the collapse to one number belongs to the component', () => {
  const estimate = estimateMinutes({ p25: 45_000, p50: 45_000, p75: 45_000 }, 4);
  expect(estimate).toEqual({ from: 3, to: 3 });
  expect(estimate!.from).toBe(estimate!.to);
});
