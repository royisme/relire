/**
 * Owns the map's regions: the book's pages, the words saved from reading, and the words no other region holds,
 * each with counts read from the learner's real rows. Pure: no UI, i18n, storage or clock; titles are data, so the
 * screen translates them.
 */
import type { VocabularyBook, VocabularyRow } from '../../../types/vocabulary';
import { MATURE_DAYS } from './challenge';

/** Anki's own default, the plan's fork 4: a word with this many lapses is a leech. */
export const LEECH_LAPSES = 8;
export const SAVED_REGION_ID = 'saved';
export const SAVED_REGION_TITLE = 'Saved from reading';
export const OTHER_REGION_ID = 'other';
export const OTHER_REGION_TITLE = 'Other words';

/** The region key of one book page; an imported deck adds its own key scheme here. */
export const pageRegionId = (page: number) => `page-${page}`;
export const deckRegionId = (deck: string) => `deck:${deck}`;

export interface RegionCounts {
  /** Every word the region holds: catalogue entries plus the learner's own cards. */
  total: number;
  introduced: number;
  learning: number;
  young: number;
  mature: number;
  leech: number;
  unseen: number;
}

export interface VocabularyRegion {
  id: string;
  title: string;
  /** Imported tag labels; labels can overlap, region membership cannot. */
  tags?: string[];
  /** The book positions the page covers; absent where the region is not a page. */
  positions?: { from: number; to: number };
  counts: RegionCounts;
}

/**
 * The region's counts, all from real rows. A catalogued word without a row, and a row that is not introduced yet, are
 * both unseen; the counts do not add up to `total`, because a `phase: new` card is introduced but neither learning,
 * young nor mature until the learner rates it.
 */
function countsOf(rows: readonly (VocabularyRow | undefined)[], matureDays: number, leechLapses: number): RegionCounts {
  const schedules = rows.flatMap((row) => (row?.schedule ? [row.schedule] : []));
  const review = schedules.filter((schedule) => schedule.phase === 'review');
  return {
    total: rows.length,
    introduced: schedules.length,
    learning: schedules.filter((schedule) => schedule.phase === 'learning' || schedule.phase === 'relearning').length,
    young: review.filter((schedule) => schedule.scheduledDays < matureDays).length,
    mature: review.filter((schedule) => schedule.scheduledDays >= matureDays).length,
    leech: schedules.filter((schedule) => schedule.lapses >= leechLapses).length,
    unseen: rows.length - schedules.length,
  };
}

/**
 * Every region of the map, in book order, then the saved words, then the words no other region holds. With a book, a
 * region is one page of 250 entries in the book's own order; without one, the saved words and the rest exist all
 * the same. Nothing is dropped: a scheduled word whose bookmark was removed, or a book word introduced while no
 * book is cached, lands in "Other words". Imported words belong to their first deck, with tags as labels, so the region totals
 * add up to the learner's rows plus the book's entries that have no row.
 */
export function summarizeRegions(input: {
  rows: readonly VocabularyRow[];
  book?: VocabularyBook;
  matureDays?: number;
  leechLapses?: number;
}): VocabularyRegion[] {
  const { rows, book, matureDays = MATURE_DAYS, leechLapses = LEECH_LAPSES } = input;
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const pages = new Map<number, { from: number; to: number; keys: string[] }>();
  if (book)
    book.entries.forEach((entry, index) => {
      // The transport pages follow the book's own order (`vocabularyPages` slices by index); `position` has gaps in
      // the real book, so it only labels the region, it does not place the entry.
      const page = Math.floor(index / book.manifest.pageSize) + 1;
      const group = pages.get(page) ?? { from: entry.position, to: entry.position, keys: [] };
      group.from = Math.min(group.from, entry.position);
      group.to = Math.max(group.to, entry.position);
      group.keys.push(entry.key);
      pages.set(page, group);
    });
  const catalogue = new Set(book?.entries.map((entry) => entry.key) ?? []);
  const decks = new Map<string, { rows: VocabularyRow[]; tags: Set<string> }>();
  const importedKeys = new Set<string>();
  for (const row of rows) {
    if (catalogue.has(row.key)) continue;
    const context = row.contexts.find((context) => context.definition.kind === 'imported');
    if (context?.source?.kind !== 'import' || context.definition.kind !== 'imported') continue;
    const deck = context.source.title;
    const group = decks.get(deck) ?? { rows: [], tags: new Set<string>() };
    group.rows.push(row);
    for (const entry of row.contexts)
      if (
        entry.source?.kind === 'import' &&
        entry.source.id === context.source.id &&
        entry.definition.kind === 'imported'
      )
        for (const tag of entry.definition.tags) group.tags.add(tag);
    decks.set(deck, group);
    importedKeys.add(row.key);
  }
  const saved = rows.filter((row) => row.bookmarked && !catalogue.has(row.key) && !importedKeys.has(row.key));
  const other = rows.filter((row) => !row.bookmarked && !catalogue.has(row.key) && !importedKeys.has(row.key));
  return [
    ...[...pages.entries()]
      .sort(([left], [right]) => left - right)
      .map(([page, group]) => ({
        id: pageRegionId(page),
        title: `Page ${page}`,
        positions: { from: group.from, to: group.to },
        counts: countsOf(
          group.keys.map((key) => rowsByKey.get(key)),
          matureDays,
          leechLapses,
        ),
      })),
    ...[...decks].map(([deck, group]) => ({
      id: deckRegionId(deck),
      title: deck,
      tags: [...group.tags],
      counts: countsOf(group.rows, matureDays, leechLapses),
    })),
    {
      id: SAVED_REGION_ID,
      title: SAVED_REGION_TITLE,
      counts: countsOf(saved, matureDays, leechLapses),
    },
    {
      id: OTHER_REGION_ID,
      title: OTHER_REGION_TITLE,
      counts: countsOf(other, matureDays, leechLapses),
    },
  ];
}
