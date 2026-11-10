/** Wordbook identity, listing and study-book membership: the one rule Settings lists by and the queue filters by. */
import type { VocabularyBook, VocabularyRow } from '../../types/vocabulary';

/** The default wordbook: every word saved from reading or an AI lookup. Always present, never deleted. */
export const MY_WORDS = 'mine';
/** The downloaded built-in wordbook. */
export const BUILTIN_WORDS = 'builtin';
const DECK_PREFIX = 'deck:';

/** The study-book id of an imported deck. */
export function deckStudyBook(id: string): string {
  return DECK_PREFIX + id;
}

export interface DeckSummary {
  id: string;
  title: string;
  words: number;
  withHistory: number;
}

/** One entry per imported deck found in the rows, ordered by title; `words` counts rows, not notes. */
export function deckSummaries(rows: readonly VocabularyRow[]): DeckSummary[] {
  const decks = new Map<string, DeckSummary>();
  for (const row of rows) {
    const counted = new Set<string>();
    for (const context of row.contexts) {
      if (context.source?.kind !== 'import' || counted.has(context.source.id)) continue;
      counted.add(context.source.id);
      const deck = decks.get(context.source.id);
      if (deck) {
        deck.words += 1;
        if (row.schedule) deck.withHistory += 1;
      } else {
        decks.set(context.source.id, {
          id: context.source.id,
          title: context.source.title,
          words: 1,
          withHistory: row.schedule ? 1 : 0,
        });
      }
    }
  }
  return [...decks.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** The wordbook actually studied: the saved choice when it names a wordbook that exists now, otherwise My words. */
export function effectiveStudyBook(
  saved: string,
  book: VocabularyBook | undefined,
  rows: readonly VocabularyRow[],
): string {
  if (saved === BUILTIN_WORDS) return book ? BUILTIN_WORDS : MY_WORDS;
  if (saved.startsWith(DECK_PREFIX)) {
    const id = saved.slice(DECK_PREFIX.length);
    return rows.some((row) => row.contexts.some((c) => c.source?.kind === 'import' && c.source.id === id))
      ? saved
      : MY_WORDS;
  }
  return MY_WORDS;
}

/** A context saved from reading or an AI lookup makes a word part of My words. */
export function inMyWords(row: VocabularyRow): boolean {
  return row.contexts.some((context) => context.definition.kind === 'ai' || context.definition.kind === 'reader');
}

/** Whether a joined word belongs to the study book; a word can belong to several wordbooks. */
export function inStudyBook(word: { row?: VocabularyRow; builtIn: boolean }, studyBook: string): boolean {
  if (studyBook === BUILTIN_WORDS) return word.builtIn;
  if (!word.row) return false;
  if (studyBook === MY_WORDS) return inMyWords(word.row);
  const id = studyBook.slice(DECK_PREFIX.length);
  return word.row.contexts.some((context) => context.source?.kind === 'import' && context.source.id === id);
}
