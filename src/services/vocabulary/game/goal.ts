/** The opt-in exam-date goal: device-local shape, calendar days left and the dialog's input boundary.
 *  No forecast exists here or anywhere downstream (the plan's 5b item 5). */
import { z } from 'zod';
import { VocabularyDateSchema } from '../../../types/vocabulary';
import { formatDate } from '../../../utils/srs';

export const VocabularyGoalSchema = z.strictObject({
  examDate: VocabularyDateSchema,
  matureTarget: z.number().int().positive(),
});
export type VocabularyGoal = z.infer<typeof VocabularyGoalSchema>;

/** Local calendar days from today to the exam date: 0 is today, negative is past. Both dates are parsed at
 *  UTC midnight, so a daylight-saving change between them never adds or removes a day. */
export function goalDaysLeft(examDate: string, now: number): number {
  const today = formatDate(new Date(now));
  return (Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
}

export type VocabularyGoalInputError = 'missingDate' | 'pastDate' | 'invalidTarget';

/** The dialog's boundary check on raw field values: a real date today or later, and a positive whole target.
 *  The native date input owns the date's format; only presence and the past are checked here. */
export function parseGoalInput(
  examDate: string,
  target: string,
  now: number,
): { ok: true; goal: VocabularyGoal } | { ok: false; error: VocabularyGoalInputError } {
  const date = examDate.trim();
  if (!date) return { ok: false, error: 'missingDate' };
  if (date < formatDate(new Date(now))) return { ok: false, error: 'pastDate' };
  const count = Number(target.trim());
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: 'invalidTarget' };
  return { ok: true, goal: { examDate: date, matureTarget: count } };
}
