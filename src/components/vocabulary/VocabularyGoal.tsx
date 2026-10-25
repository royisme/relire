/** The opt-in goal on the Words home: days left, real counts now and the real weekly series of words first
 *  reaching maturity. No forecast, no projection, no on-track judgement. Writes only appSettings. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyRow } from '../../types/vocabulary';
import { getAppSettings, saveAppSettings } from '../../utils/appSettings';
import {
  goalDaysLeft,
  parseGoalInput,
  type VocabularyGoal,
  type VocabularyGoalInputError,
} from '../../services/vocabulary/game/goal';
import { weeklyGained } from '../../services/vocabulary/game/rhythm';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

/** The weekly series covers the last four local-calendar weeks, oldest first (the plan's 5b item 5). */
const GOAL_WEEKS = 4;

export function VocabularyGoal({ rows, now, mature }: { rows: readonly VocabularyRow[]; now: number; mature: number }) {
  const { t, i18n } = useTranslation();
  // This component is the goal's only writer, so its state starts from storage and follows its own saves.
  const [goal, setGoal] = useState<VocabularyGoal | null>(() => getAppSettings().vocabularyGoal);
  const dialog = (label: string) => <VocabularyGoalDialog goal={goal} now={now} onSaved={setGoal} label={label} />;
  if (!goal) return <div>{dialog(t('vocab.goal.set'))}</div>;
  const days = goalDaysLeft(goal.examDate, now);
  const weeks = weeklyGained(rows, now, GOAL_WEEKS);
  const widest = Math.max(...weeks.map((week) => week.count));
  return (
    <section className="space-y-3" aria-label={t('vocab.goal.title')}>
      <p className="tnum text-sm text-ink-700">
        {days === 0
          ? t('vocab.goal.examToday')
          : days > 0
            ? t('vocab.goal.daysLeft', { count: days })
            : t('vocab.goal.examPassed')}
      </p>
      <p className="tnum text-sm text-ink-700">{t('vocab.goal.progress', { mature, target: goal.matureTarget })}</p>
      <div className="space-y-2">
        <p className="text-sm text-ink-600">{t('vocab.goal.weekly')}</p>
        <ol className="space-y-2">
          {weeks.map((week) => (
            <li key={week.weekStart} className="flex items-center gap-3">
              <time dateTime={week.weekStart} className="tnum w-20 shrink-0 text-xs text-ink-600">
                {new Date(`${week.weekStart}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage, {
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
              <span aria-hidden="true" className="h-1.5 min-w-0 flex-1 bg-ink-100">
                <span
                  className="block h-full bg-ink-600"
                  style={{ width: `${widest ? (100 * week.count) / widest : 0}%` }}
                />
              </span>
              <span className="tnum w-8 shrink-0 text-right text-sm text-ink-800">{week.count}</span>
            </li>
          ))}
        </ol>
      </div>
      {dialog(t('vocab.goal.change'))}
    </section>
  );
}

/** The set/clear form. Saving validates at the input boundary and closes; removing clears the stored goal. */
function VocabularyGoalDialog({
  goal,
  now,
  onSaved,
  label,
}: {
  goal: VocabularyGoal | null;
  now: number;
  onSaved: (goal: VocabularyGoal | null) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<VocabularyGoalInputError | null>(null);
  const openWith = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDate(goal?.examDate ?? '');
      setTarget(goal ? String(goal.matureTarget) : '');
      setError(null);
    }
  };
  const save = () => {
    const parsed = parseGoalInput(date, target, now);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    saveAppSettings({ vocabularyGoal: parsed.goal });
    onSaved(parsed.goal);
    setOpen(false);
  };
  const clear = () => {
    saveAppSettings({ vocabularyGoal: null });
    onSaved(null);
    setOpen(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={openWith}>
      <Dialog.Trigger render={<Button variant="ghost" />}>{label}</Dialog.Trigger>
      <DialogContent className="max-w-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Dialog.Title className="font-serif text-lg font-semibold">{t('vocab.goal.title')}</Dialog.Title>
            <Dialog.Description className="text-sm text-ink-600">{t('vocab.goal.description')}</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" />}>{t('common.close')}</Dialog.Close>
        </div>
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span>{t('vocab.goal.examDate')}</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('vocab.goal.target')}</span>
            <Input
              type="number"
              min={1}
              step={1}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setError(null);
              }}
            />
          </label>
          <p role="status" aria-live="polite" className="h-6 text-sm text-bad-700">
            {error ? t(`vocab.goal.errors.${error}`) : ''}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save}>{t('vocab.goal.save')}</Button>
            {goal && (
              <Button variant="ghost" onClick={clear}>
                {t('vocab.goal.clear')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}
