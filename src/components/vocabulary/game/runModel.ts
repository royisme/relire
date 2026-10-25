import type { VocabularyBook, VocabularyBookSource, VocabularyRow } from '../../../types/vocabulary';
import { buildChallenge, cardContent, type ChallengePoolItem } from '../../../services/vocabulary/game/challenge';

export const RUN_SIZES = [5, 10, 20] as const;
export type RunSize = (typeof RUN_SIZES)[number];
export interface RunChunk {
  size: RunSize;
  baseline: number;
}
export const chunkRatings = (chunk: RunChunk, ratings: number) => Math.max(0, ratings - chunk.baseline);
export const chunkReached = (chunk: RunChunk, ratings: number) => chunkRatings(chunk, ratings) >= chunk.size;
export const continueChunk = (chunk: RunChunk, ratings: number): RunChunk => ({ ...chunk, baseline: ratings });

// The book's POS strings carry OCR noise, so match these marks accent-insensitively.
const CLOSED_CLASS_MARKS = ['prep', 'conj', 'pron', 'poss', 'art', 'function'];
export function closedClassPos(pos: string | undefined): boolean {
  if (!pos) return false;
  const plain = pos.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return CLOSED_CLASS_MARKS.some((mark) => plain.includes(mark));
}

export function posOf(card: {
  bookSource?: VocabularyBookSource;
  contexts: VocabularyRow['contexts'];
}): string | undefined {
  return cardContent(card, 'en').pos;
}

/** Closed-class cards ask for meaning, keeping the personal definition and book sense intact. */
export function buildRunChallenge(input: Parameters<typeof buildChallenge>[0]) {
  return buildChallenge(
    closedClassPos(posOf(input.card)) ? { ...input, card: { ...input.card, schedule: null } } : input,
  );
}

function poolItemOf(row: VocabularyRow): ChallengePoolItem {
  const content = cardContent(row, 'en');
  return {
    word: row.word,
    gloss: { en: content.gloss, zh: cardContent(row, 'zh').gloss },
    pos: content.pos,
    ...(content.deck !== undefined ? { deck: content.deck } : {}),
  };
}

export function runPool(rows: readonly VocabularyRow[], book?: VocabularyBook): ChallengePoolItem[] {
  return [
    ...rows.map(poolItemOf),
    ...(book?.entries ?? []).map((entry) => ({
      word: entry.word,
      gloss: entry.senses[0]?.gloss ?? {},
      pos: entry.senses[0]?.pos,
    })),
  ];
}
