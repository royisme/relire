/** Pure vocabulary scheduling; all transitions and previews receive the actual clock explicitly. */
import type { VocabularyRating, VocabularySchedule } from '../types/vocabulary';
export const SM2_MIN_EASE = 1.3;
export const SM2_DEFAULT_EASE = 2.5;
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export function initialVocabularySchedule(
  now: number,
): Extract<VocabularySchedule, { phase: 'learning' | 'relearning' }> {
  return { phase: 'learning', step: 0, dueAt: now, repetitions: 0, intervalDays: 0, easeFactor: SM2_DEFAULT_EASE };
}
export function vocabularyDue(schedule: VocabularySchedule | null, now: number): boolean {
  return (
    schedule !== null &&
    (schedule.phase === 'review' ? schedule.dueDate <= formatDate(new Date(now)) : schedule.dueAt <= now)
  );
}
export function nextVocabularySchedule(
  prior: VocabularySchedule,
  rating: VocabularyRating,
  now: number,
): VocabularySchedule {
  const review = (intervalDays: number, repetitions: number, easeFactor: number): VocabularySchedule => ({
    phase: 'review',
    intervalDays,
    repetitions,
    easeFactor,
    dueDate: formatDate(addDays(new Date(now), intervalDays)),
  });
  if (prior.phase !== 'review') {
    if (rating === 5 || (prior.step === 1 && rating === 4)) return review(1, 1, prior.easeFactor);
    const step = rating === 1 ? 0 : rating === 4 ? 1 : prior.step;
    const minutes = rating === 1 ? 1 : rating === 3 && step === 0 ? 6 : 10;
    return { ...prior, step, dueAt: now + minutes * 60_000 };
  }
  const easeFactor = Math.max(
    SM2_MIN_EASE,
    Number((prior.easeFactor + 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)).toFixed(2)),
  );
  if (rating === 1) return { ...initialVocabularySchedule(now + 60_000), phase: 'relearning', easeFactor };
  const days = prior.repetitions === 1 ? (rating === 3 ? 3 : 6) : Math.round(prior.intervalDays * prior.easeFactor);
  return review(days, prior.repetitions + 1, easeFactor);
}
