/** The map's regions over invented rows and books: page grouping, saved words, other words and the thresholds. */
import { expect, test } from 'bun:test';
import {
  LEECH_LAPSES,
  OTHER_REGION_ID,
  OTHER_REGION_TITLE,
  pageRegionId,
  summarizeRegions,
} from '../src/services/vocabulary/game/regions';
import type { VocabularyEntry, VocabularyRow, VocabularySchedule } from '../src/types/vocabulary';
import { testEntry, testMatureSchedule, testRow } from './fixtures/vocabulary';
import { vocabularyHash } from '../src/services/vocabulary/book';
import { assembleVocabularyBook } from '../scripts/vocabulary/publication';

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
/** A book whose positions have gaps and do not start at 0, like the real one (7,362 entries, positions to 7,390). */
const gappedBook = async (positions: number[]) => {
  const metadata = { bookId: 'tcf-7000' as const, title: { en: 'TEST', zh: '\u6d4b\u8bd5' } };
  const entries: VocabularyEntry[] = positions.map((position, index) => testEntry(`gap-${index}`, position));
  const contentHash = await vocabularyHash({ metadata, entries });
  return assembleVocabularyBook(
    { metadata, entries, contentHash },
    {
      bookId: 'tcf-7000',
      contentHash,
      reviewedBy: 'Synthetic TEST reviewer',
      reviewedAt: '2026-10-20T12:00:00.000Z',
    },
  );
};

test('without a book the map has the saved words, and every other row lands in Other words', () => {
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
      keys: ['mot', 'arbre', 'chien', 'chat'],
      counts: { total: 4, introduced: 3, learning: 1, young: 1, mature: 1, leech: 1, unseen: 1 },
    },
    {
      id: OTHER_REGION_ID,
      title: OTHER_REGION_TITLE,
      keys: ['sel'],
      counts: { total: 1, introduced: 1, learning: 0, young: 1, mature: 0, leech: 0, unseen: 0 },
    },
  ]);
});

test('rows no region claims land in Other words: a removed bookmark, a book word with no cached book', () => {
  // A scheduled personal word whose bookmark was removed keeps its schedule; an introduced book word has no page
  // to belong to while no book is cached. Neither is dropped.
  const rows = [{ ...row('mot', young, false), bookSource: undefined }, row('test-0', mature, false)];
  expect(summarizeRegions({ rows })).toEqual([
    {
      id: 'saved',
      title: 'Saved from reading',
      keys: [],
      counts: { total: 0, introduced: 0, learning: 0, young: 0, mature: 0, leech: 0, unseen: 0 },
    },
    {
      id: OTHER_REGION_ID,
      title: OTHER_REGION_TITLE,
      keys: ['mot', 'test-0'],
      counts: { total: 2, introduced: 2, learning: 0, young: 1, mature: 1, leech: 0, unseen: 0 },
    },
  ]);
});

test('a book of 300 entries is two page regions, and the region totals add up', async () => {
  const book = await gappedBook(Array.from({ length: 300 }, (_, index) => index));
  const rows = [
    row('gap-0', mature),
    row('gap-5', young),
    row('gap-260', learning),
    row('mot', null),
    row('sel', young, false),
  ];
  const regions = summarizeRegions({ rows, book });
  expect(regions.map((region) => region.id)).toEqual(['page-1', 'page-2', 'saved', 'other']);
  expect(regions[0]).toEqual({
    id: pageRegionId(1),
    title: 'Page 1',
    positions: { from: 0, to: 249 },
    keys: book.entries.slice(0, 250).map((entry) => entry.key),
    counts: { total: 250, introduced: 2, learning: 0, young: 1, mature: 1, leech: 0, unseen: 248 },
  });
  expect(regions[1]).toEqual({
    id: pageRegionId(2),
    title: 'Page 2',
    positions: { from: 250, to: 299 },
    keys: book.entries.slice(250).map((entry) => entry.key),
    counts: { total: 50, introduced: 1, learning: 1, young: 0, mature: 0, leech: 0, unseen: 49 },
  });
  expect(regions[2]).toEqual({
    id: 'saved',
    title: 'Saved from reading',
    keys: ['mot'],
    counts: { total: 1, introduced: 0, learning: 0, young: 0, mature: 0, leech: 0, unseen: 1 },
  });
  expect(regions[3]).toEqual({
    id: OTHER_REGION_ID,
    title: OTHER_REGION_TITLE,
    keys: ['sel'],
    counts: { total: 1, introduced: 1, learning: 0, young: 1, mature: 0, leech: 0, unseen: 0 },
  });
  const members = regions.flatMap((region) => region.keys);
  expect(new Set(members).size).toBe(members.length);
  for (const region of regions) {
    expect(region.keys).toHaveLength(region.counts.total);
    expect(region.keys.filter((key) => rows.find((row) => row.key === key)?.schedule)).toHaveLength(
      region.counts.introduced,
    );
    expect(region.keys.filter((key) => !rows.find((row) => row.key === key)?.schedule)).toHaveLength(
      region.counts.unseen,
    );
  }
  // Rows plus the book entries without a row: 5 + (300 - 3 catalogued ones that have rows).
  expect(regions.reduce((sum, region) => sum + region.counts.total, 0)).toBe(5 + 297);
});

test('pages follow the book’s own order, not positions with gaps', async () => {
  // 251 entries at positions 10 to 260: the transport page split is at index 250, not at position 250.
  const book = await gappedBook(Array.from({ length: 251 }, (_, index) => index + 10));
  const regions = summarizeRegions({ rows: [], book });
  expect(regions.map((region) => region.id)).toEqual(['page-1', 'page-2', 'saved', 'other']);
  expect(regions[0].counts).toMatchObject({ total: 250 });
  expect(regions[0].positions).toEqual({ from: 10, to: 259 });
  expect(regions[1].counts).toMatchObject({ total: 1 });
  expect(regions[1].positions).toEqual({ from: 260, to: 260 });
});

test('a bookmarked word that the book holds belongs to its page, not to the saved words', async () => {
  const book = await gappedBook([0, 1, 2]);
  const regions = summarizeRegions({ rows: [row('gap-1', null)], book });
  expect(regions.map((region) => region.id)).toEqual(['page-1', 'saved', 'other']);
  expect(regions[0].counts).toMatchObject({ total: 3, unseen: 3 });
  expect(regions[1].counts).toEqual({ total: 0, introduced: 0, learning: 0, young: 0, mature: 0, leech: 0, unseen: 0 });
  expect(regions[2].counts).toEqual({ total: 0, introduced: 0, learning: 0, young: 0, mature: 0, leech: 0, unseen: 0 });
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
