/** Canonical catalogue/learner join and deterministic review selection; unseen fronts never persist rows; only the chosen wordbook's words are selected. */
import type { VocabularyBook, VocabularyCandidate, VocabularyDay, VocabularyRow } from '../../types/vocabulary';
import { formatDate, vocabularyDue } from '../../utils/srs';
import { effectiveStudyBook, inStudyBook } from './wordbooks';
export interface VocabularyJoined extends VocabularyCandidate {
  row?: VocabularyRow;
  builtIn: boolean;
}
export function joinVocabulary(rows: VocabularyRow[], book?: VocabularyBook): VocabularyJoined[] {
  const joined = new Map<string, VocabularyJoined>();
  for (const entry of book?.entries ?? [])
    joined.set(entry.key, {
      key: entry.key,
      word: entry.word,
      builtIn: true,
      bookSource: {
        bookId: book!.manifest.bookId,
        version: book!.manifest.version,
        senses: entry.senses,
        sourceIds: entry.sourceIds,
      },
    });
  for (const row of rows)
    joined.set(row.key, {
      ...(joined.get(row.key) ?? { key: row.key, word: row.word, builtIn: !!row.bookSource }),
      row,
      bookSource: joined.get(row.key)?.bookSource ?? row.bookSource,
    });
  return [...joined.values()];
}
export function vocabularyQueue(
  rows: VocabularyRow[],
  book: VocabularyBook | undefined,
  day: VocabularyDay,
  newPerDay: number,
  now: number,
  excluded: ReadonlySet<string>,
  studyBook: string,
) {
  // One resolution rule shared with Settings, so the list and the queue never disagree.
  const effective = effectiveStudyBook(studyBook, book, rows);
  const joined = joinVocabulary(rows, book).filter((word) => !excluded.has(word.key) && inStudyBook(word, effective));
  const compareKey = (a: VocabularyJoined, b: VocabularyJoined) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const minute = joined
    .filter(
      (word) => word.row?.schedule && word.row.schedule.phase !== 'review' && vocabularyDue(word.row.schedule, now),
    )
    .sort((a, b) => a.row!.schedule!.dueAt - b.row!.schedule!.dueAt || compareKey(a, b));
  const review = joined
    .filter((word) => word.row?.schedule?.phase === 'review' && vocabularyDue(word.row.schedule, now))
    .sort((a, b) => {
      const left = a.row!.schedule!,
        right = b.row!.schedule!;
      return left.phase === 'review' && right.phase === 'review'
        ? formatDate(new Date(left.dueAt)).localeCompare(formatDate(new Date(right.dueAt))) || compareKey(a, b)
        : 0;
    });
  const eligible = (word: VocabularyJoined) =>
    !word.row?.schedule && (day.introducedKeys.includes(word.key) || day.introducedKeys.length < newPerDay);
  const personal = joined
    .filter((word) => word.row?.bookmarked && eligible(word))
    .sort((a, b) => a.row!.bookmarkedAt! - b.row!.bookmarkedAt! || compareKey(a, b));
  const personalKeys = new Set(personal.map((word) => word.key));
  const catalogueKeys = new Set(book?.entries.map((entry) => entry.key));
  const unseen = joined.filter((word) => catalogueKeys.has(word.key) && eligible(word) && !personalKeys.has(word.key));
  const future = joined.flatMap((word) =>
    word.row?.schedule && word.row.schedule.phase !== 'review' && word.row.schedule.dueAt > now
      ? [word.row.schedule.dueAt]
      : [],
  );
  return {
    candidates: [...minute, ...review, ...personal, ...unseen],
    nextDue: future.length ? Math.min(...future) : null,
  };
}
