/** One pure FSRS-6 scheduler; private library serialization, explicit instants and preferences only. */
import { createEmptyCard, fsrs, Rating, State, type Card } from 'ts-fsrs';
import {
  VocabularyOutcomeSchema,
  VocabularyPreferencesSchema,
  VocabularyScheduleSchema,
  VocabularyTimestampSchema,
  type VocabularyOutcome,
  type VocabularyPreferences,
  type VocabularySchedule,
} from '../types/vocabulary';

export class VocabularyClockError extends Error {
  constructor() {
    super('Review time is invalid or earlier than the last review; correct the device clock and submit again');
  }
}
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function reviewTime(now: number, lastReviewedAt: number | null = null) {
  if (!VocabularyTimestampSchema.safeParse(now).success || (lastReviewedAt !== null && now < lastReviewedAt))
    throw new VocabularyClockError();
  return new Date(now);
}
const phases = ['new', 'learning', 'review', 'relearning'] as const;
const states = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };
const grades = { forgot: Rating.Again, fuzzy: Rating.Hard, remembered: Rating.Good } as const;
function serialize(card: Card): VocabularySchedule {
  return VocabularyScheduleSchema.parse({
    phase: phases[card.state],
    dueAt: card.due.getTime(),
    lastReviewedAt: card.last_review?.getTime() ?? null,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    repetitions: card.reps,
    lapses: card.lapses,
  });
}
export function initialVocabularySchedule(now: number): VocabularySchedule {
  return serialize(createEmptyCard(reviewTime(now)));
}
/** When a scheduled card becomes studyable: a review card from the start of its due day, a learning step at its exact time. */
export function vocabularyAvailableAt(schedule: VocabularySchedule): number {
  if (schedule.phase !== 'review') return schedule.dueAt;
  const day = new Date(schedule.dueAt);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
export function vocabularyDue(schedule: VocabularySchedule | null, now: number): boolean {
  reviewTime(now);
  return schedule !== null && vocabularyAvailableAt(schedule) <= now;
}
export function nextVocabularySchedule(
  prior: VocabularySchedule,
  outcome: VocabularyOutcome,
  reviewedAt: number,
  preferences: VocabularyPreferences,
): VocabularySchedule {
  const saved = VocabularyScheduleSchema.parse(prior);
  const now = reviewTime(reviewedAt, saved.lastReviewedAt);
  const { retentionPercent } = VocabularyPreferencesSchema.parse(preferences);
  const grade = grades[VocabularyOutcomeSchema.parse(outcome)];
  const card: Card = {
    state: states[saved.phase],
    due: new Date(saved.dueAt),
    ...(saved.lastReviewedAt === null ? {} : { last_review: new Date(saved.lastReviewedAt) }),
    stability: saved.stability,
    difficulty: saved.difficulty,
    elapsed_days: saved.elapsedDays,
    scheduled_days: saved.scheduledDays,
    learning_steps: saved.learningSteps,
    reps: saved.repetitions,
    lapses: saved.lapses,
  };
  // All other defaults are pinned by ts-fsrs@5.4.2 and policy1; never share mutable scheduler parameters.
  return serialize(fsrs({ request_retention: retentionPercent / 100, enable_fuzz: false }).next(card, now, grade).card);
}
