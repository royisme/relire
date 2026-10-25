/** Local-calendar activity and accumulation, read only from learner rows. */
import type { VocabularyRow } from '../../../types/vocabulary';
import { formatDate } from '../../../utils/srs';
import { MATURE_DAYS } from './challenge';

export function summarizeRhythm(rows: readonly VocabularyRow[], now: number) {
  const today = new Date(now);
  // Calendar arithmetic, not elapsed 24-hour periods: DST must not duplicate or skip a day.
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
    gainedThisWeek: rows.filter((row) => {
      // Reset keeps history. Only the first attainment counts, even after lapsing and maturing again.
      const first = row.history.find((record) => record.next.scheduledDays >= MATURE_DAYS);
      return first !== undefined && dates.includes(formatDate(new Date(first.reviewedAt)));
    }).length,
  };
}
