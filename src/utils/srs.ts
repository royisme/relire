import { VocabWord, ReviewRecord } from '../types';

export const SM2_MIN_EASE = 1.3;
export const SM2_DEFAULT_EASE = 2.5;

// Format Date as YYYY-MM-DD
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isDueToday(word: VocabWord): boolean {
  const today = formatDate(new Date());
  return word.nextReviewDate <= today;
}

export function calculateNextReview(word: VocabWord, rating: number): VocabWord {
  // rating: 1 (Again), 3 (Hard), 4 (Good), 5 (Easy)
  let repetitions = word.repetitions;
  let interval = word.intervalDays;
  let easeFactor = word.easeFactor || SM2_DEFAULT_EASE;

  if (rating >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = rating === 3 ? 3 : 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Failed recall
    repetitions = 0;
    interval = 1;
  }

  // Calculate new Ease Factor
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const newEase = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  easeFactor = Math.max(SM2_MIN_EASE, Number(newEase.toFixed(2)));

  const now = new Date();
  const nextDate = addDays(now, interval);

  const newRecord: ReviewRecord = {
    date: formatDate(now),
    rating,
    intervalDays: interval,
    easeFactor,
  };

  return {
    ...word,
    repetitions,
    intervalDays: interval,
    easeFactor,
    lastReviewedAt: new Date().toISOString(),
    nextReviewDate: formatDate(nextDate),
    reviewHistory: [...(word.reviewHistory || []), newRecord],
  };
}
