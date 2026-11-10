/** Owns pure local-day activity counters, not storage reads, scheduling or checklist selection. */
import type { VocabularyRow } from '../../types/vocabulary';
import type { ReaderProgress } from '../../types/readerProgress';
import { itemStateId, type ExerciseAttempt, type ExerciseUnit } from '../../types/exercises';

export function startOfLocalDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function reviewsToday(rows: VocabularyRow[], now: number): number {
  const start = startOfLocalDay(now);
  return rows.reduce((total, row) => total + row.history.filter((review) => review.reviewedAt >= start).length, 0);
}

export function readerIdsActiveToday(rows: ReaderProgress[], now: number): Set<string> {
  const start = startOfLocalDay(now);
  return new Set(
    rows
      .filter(
        (row) =>
          (row.completedAt !== null && row.completedAt >= start) ||
          Object.values(row.answers).some(({ checked }) => checked !== null && checked.checkedAt >= start),
      )
      .map((row) => row.readerId),
  );
}

export function soundAttemptsToday(
  attempts: ExerciseAttempt[],
  units: ReadonlyMap<string, ExerciseUnit>,
  now: number,
): number {
  const start = startOfLocalDay(now);
  return attempts.filter(
    (attempt) =>
      attempt.timestamp >= start &&
      units.get(attempt.unitId)?.items.find((item) => item.id === attempt.itemId)?.meta?.source === 'minimal-pairs',
  ).length;
}

export function mistakeAttemptsToday(
  attempts: ExerciseAttempt[],
  mistakeKeys: ReadonlySet<string>,
  now: number,
): number {
  const start = startOfLocalDay(now);
  return attempts.filter(
    (attempt) => attempt.timestamp >= start && mistakeKeys.has(itemStateId(attempt.unitId, attempt.itemId)),
  ).length;
}
