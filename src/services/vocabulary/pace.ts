/** The learner's own time per rating, from real history only; null until there is enough of it. */
import type { VocabularyRow } from '../../types/vocabulary';
const SESSION_GAP_MS = 5 * 60_000;
const MIN_GAPS = 30;
export interface CardPace {
  p25: number;
  p50: number;
  p75: number;
}
/** Milliseconds per rating: percentiles of the gaps inside sessions; a session of k ratings yields k-1 gaps, because the first rating's own duration is unknown. */
export function cardPace(rows: VocabularyRow[]): CardPace | null {
  const times = rows.flatMap((row) => row.history.map((record) => record.reviewedAt)).sort((a, b) => a - b);
  const gaps: number[] = [];
  let sessionStart = 0;
  for (let i = 1; i <= times.length; i++) {
    if (i < times.length && times[i] - times[i - 1] <= SESSION_GAP_MS) continue;
    for (let j = sessionStart + 1; j < i; j++) gaps.push(times[j] - times[j - 1]);
    sessionStart = i;
  }
  if (gaps.length < MIN_GAPS) return null;
  gaps.sort((a, b) => a - b);
  const nearestRank = (p: number) => gaps[Math.ceil((p / 100) * gaps.length) - 1];
  return { p25: nearestRank(25), p50: nearestRank(50), p75: nearestRank(75) };
}
/** Whole minutes (at least 1) for one rating of each of `count` cards. */
export function estimateMinutes(pace: CardPace | null, count: number): { from: number; to: number } | null {
  if (!pace) return null;
  const minutes = (ms: number) => Math.max(1, Math.round((count * ms) / 60_000));
  return { from: minutes(pace.p25), to: minutes(pace.p75) };
}
