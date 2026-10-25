/** The map's regions over invented rows and books: page grouping, saved words and counts at both thresholds. */
import { expect, test } from 'bun:test';
import { LEECH_LAPSES, pageRegionId, summarizeRegions } from '../src/services/vocabulary/game/regions';
import type { VocabularyRow, VocabularySchedule } from '../src/types/vocabulary';
import { testBook, testMatureSchedule, testRow } from './fixtures/vocabulary';

const now = new Date(2026, 9, 24, 12).getTime();
const row = (word: string, schedule: VocabularySchedule | null, bookmarked = true): VocabularyRow => ({
  ...testRow(word),
  bookmarked,
  bookmarkedAt: bookmarked ? 1 : null,
  introducedAt: schedule ? 1 : null,
  schedule,
});
const young = { ...testMatureSchedule(now), scheduledDays: 20 };
const mature = { ...testMatureSchedule(now), scheduledDays: 21 };
const learning = { ...testMatureSchedule(now), phase: 'learning' as const, scheduledDays: 0, learningSteps: 1 };

test('without a book the map has only the saved words, counted from the learner’s rows', () => {
  const rows = [
    row('mot', null),
    row('arbre', learning),
    row('chien', young),
    row('chat', { ...mature, repetitions: 9, lapses: LEECH_LAPSES }),
    row('sel', young, false),
  ];
  expect(summarizeRegions({ rows })).toEqual([
    {
      id: 'saved',
      title: 'Saved from reading',
      counts: { total: 4, introduced: 3, learning: 1, young: 1, mature: 1, leech: 1, unseen: 1 },
    },
  ]);
});

test('a book of 300 entries is two page regions, and each counts its own catalogue entries and rows', async () => {
  const book = await testBook(300);
  const rows = [
    row('test-0', mature),
    row('test-5', young),
    row('test-260', learning),
    row('mot', null),
    row('sel', young, false),
  ];
  const regions = summarizeRegions({ rows, book });
  expect(regions.map((region) => region.id)).toEqual(['page-1', 'page-2', 'saved']);
  expect(regions[0]).toEqual({
    id: pageRegionId(1),
    title: 'Page 1',
    positions: { from: 0, to: 249 },
    counts: { total: 250, introduced: 2, learning: 0, young: 1, mature: 1, leech: 0, unseen: 248 },
  });
  expect(regions[1]).toEqual({
    id: pageRegionId(2),
    title: 'Page 2',
    positions: { from: 250, to: 299 },
    counts: { total: 50, introduced: 1, learning: 1, young: 0, mature: 0, leech: 0, unseen: 49 },
  });
  expect(regions[2]).toEqual({
    id: 'saved',
    title: 'Saved from reading',
    counts: { total: 1, introduced: 0, learning: 0, young: 0, mature: 0, leech: 0, unseen: 1 },
  });
});

test('a bookmarked word that the book holds belongs to its page, not to the saved words', async () => {
  const book = await testBook(3);
  const regions = summarizeRegions({ rows: [row('test-1', null)], book });
  expect(regions.map((region) => region.id)).toEqual(['page-1', 'saved']);
  expect(regions[0].counts).toMatchObject({ total: 3, unseen: 3 });
  expect(regions[1].counts).toEqual({ total: 0, introduced: 0, learning: 0, young: 0, mature: 0, leech: 0, unseen: 0 });
});

test('the mature and leech thresholds count from their boundary', () => {
  const newSchedule: VocabularySchedule = {
    phase: 'new',
    dueAt: now,
    lastReviewedAt: null,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    repetitions: 0,
    lapses: 0,
  };
  const rows = [
    row('jeune', { ...young, scheduledDays: 20 }),
    row('mur', { ...mature, scheduledDays: 21 }),
    row('sept', { ...young, repetitions: 9, lapses: LEECH_LAPSES - 1 }),
    row('huit', { ...young, repetitions: 9, lapses: LEECH_LAPSES }),
    row('neuf', newSchedule),
  ];
  // A card introduced but not yet rated is introduced, and neither young, mature, learning nor unseen.
  expect(summarizeRegions({ rows })[0].counts).toEqual({
    total: 5,
    introduced: 5,
    learning: 0,
    young: 3,
    mature: 1,
    leech: 1,
    unseen: 0,
  });
  expect(summarizeRegions({ rows, matureDays: 30 })[0].counts).toMatchObject({ young: 4, mature: 0 });
  expect(summarizeRegions({ rows, leechLapses: 9 })[0].counts).toMatchObject({ leech: 0 });
});
