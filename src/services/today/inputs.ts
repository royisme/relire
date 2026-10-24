/** Owns the pure joins from stored vocabulary, reader and studied-topic data to Today's step input values, not selection, storage reads or hooks. */
import { readerIdsActiveToday, reviewsToday, startOfLocalDay } from './activity';
import { readerListStatus } from '../gradedReaders/status';
import { nextTopicEntry } from '../grammarTopics/order';
import type { ReaderSummary } from '../gradedReaders/catalogue';
import { vocabularyQueue } from '../vocabulary/queue';
import type { PublishedReader } from '../../types/gradedReader';
import type { GrammarTopicList } from '../../types/grammarTopic';
import type { ReaderProgress } from '../../types/readerProgress';
import type { TopicStudied } from '../../types/topicStudied';
import type { VocabularyBook, VocabularyDay, VocabularyRow } from '../../types/vocabulary';
import type { TodayGrammar, TodayReader, TodayWords } from './plan';

/**
 * The words step's counts. Due candidates carry a schedule by construction.
 * The queue's new-card filter passes every unseen entry while the daily
 * allowance lasts (introductions persist one card at a time, like
 * `useVocabularyReview.remaining`), so the allowance caps the new count here;
 * it is also bounded by the cards actually available.
 */
export function wordsInput(
  rows: VocabularyRow[],
  book: VocabularyBook | undefined,
  day: VocabularyDay,
  newPerDay: number,
  now: number,
): TodayWords {
  const { candidates } = vocabularyQueue(rows, book, day, newPerDay, now, new Set());
  let due = 0;
  let unseen = 0;
  for (const candidate of candidates) {
    if (candidate.row?.schedule) due++;
    else unseen++;
  }
  return {
    due,
    newAvailable: Math.min(unseen, Math.max(0, newPerDay - day.introducedKeys.length)),
    reviewsToday: reviewsToday(rows, now),
  };
}

/**
 * The readers step's merged catalogue: bundled starters then service editions,
 * each joined with its progress status and today's activity, ascending by
 * order. The service list arrives already merged without the starters, and a
 * progress read error never reaches this join (the caller reports it instead).
 */
export function readerEntries(
  bundled: PublishedReader[],
  service: ReaderSummary[],
  progress: ReaderProgress[],
  now: number,
): TodayReader[] {
  const activeToday = readerIdsActiveToday(progress, now);
  return [
    ...bundled.map((reader) => ({
      readerId: reader.body.id,
      order: reader.body.order,
      status: readerListStatus(reader, progress).status,
      activeToday: activeToday.has(reader.body.id),
    })),
    ...service.map((reader) => ({
      readerId: reader.id,
      order: reader.order,
      version: reader.version,
      status: readerListStatus(reader, progress).status,
      activeToday: activeToday.has(reader.id),
    })),
  ].sort((a, b) => a.order - b.order);
}

/**
 * The grammar step's input: the first unstudied topic in book order titled in the
 * interface language (the same two-value rule as the Topics page), and whether
 * any topic was marked studied in the local day. With every topic marked there
 * is no next step to suggest.
 */
export function grammarInput(
  list: GrammarTopicList,
  studied: TopicStudied[],
  now: number,
  language: 'en' | 'zh',
): TodayGrammar {
  const next = nextTopicEntry(list, new Set(studied.map((row) => row.topicId)));
  return {
    ...(next ? { next: { topicId: next.id, title: next.title[language] } } : {}),
    studiedToday: studied.some((row) => row.at >= startOfLocalDay(now)),
  };
}
