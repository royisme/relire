/** Local-calendar activity and accumulation, read only from learner rows. */
import type { VocabularyRow } from '../../../types/vocabulary';
import { formatDate } from '../../../utils/srs';
import { MATURE_DAYS } from './challenge';

/** The first rating whose next interval reached maturity. Reset keeps history, so a word that lapses and
 *  matures again, or whose schedule is reset, attains only this once for every gained-this-week number. */
function firstMatureAt(row: VocabularyRow): number | null {
  const first = row.history.find((record) => record.next.scheduledDays >= MATURE_DAYS);
  return first === undefined ? null : first.reviewedAt;
}

/** Words first reaching maturity per local-calendar week, oldest week first, each bucket labelled with its
 *  start date. The newest bucket is exactly `gainedThisWeek`'s seven-day window, by the same attainment rule. */
export function weeklyGained(rows: readonly VocabularyRow[], now: number, weeks: number) {
  const today = new Date(now);
  const attained = rows.flatMap((row) => {
    const at = firstMatureAt(row);
    return at === null ? [] : [formatDate(new Date(at))];
  });
  return Array.from({ length: weeks }, (_, index) => {
    // Calendar arithmetic at noon, not elapsed 24-hour periods: DST must not duplicate or skip a day.
    const from = formatDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - (7 * (weeks - index) - 1), 12),
    );
    const to = formatDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * (weeks - 1 - index), 12),
    );
    return { weekStart: from, count: attained.filter((date) => from <= date && date <= to).length };
  });
}

export function summarizeRhythm(rows: readonly VocabularyRow[], now: number) {
  const today = new Date(now);
  const dates = Array.from({ length: 7 }, (_, index) =>
    formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index, 12)),
  );
  const ratedDates = new Set(
    rows.flatMap((row) => row.history.map((record) => formatDate(new Date(record.reviewedAt)))),
  );
  const days = dates.map((date) => ({ date, rated: ratedDates.has(date) }));
  return {
    days,
    ratedDays: days.filter((day) => day.rated).length,
    now: {
      review: rows.filter((row) => row.schedule?.phase === 'review').length,
      mature: rows.filter((row) => row.schedule?.phase === 'review' && row.schedule.scheduledDays >= MATURE_DAYS)
        .length,
    },
    gainedThisWeek: weeklyGained(rows, now, 1)[0].count,
  };
}
