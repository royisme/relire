/**
 * "Make exercises from this article": level, how many items, and the one filled
 * button of the page. The button shows work in progress by swapping its icon;
 * the result (made, left out, or the real error) shows on one status line that
 * always has its height, so nothing around it moves.
 */
import { useState, type FormEvent } from 'react';
import { ListPlus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExerciseGeneration } from '../../hooks/useExerciseGeneration';
import { MAX_GENERATED_ITEMS } from '../../services/api';
import type { Article } from '../../types';
import { EXERCISE_LEVELS, type ExerciseLevel } from '../../types/exercises';
import { Button } from '../ui/button';

const DEFAULT_COUNT = 8;
const field =
  'h-10 rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900 focus:border-accent-600 focus:outline-none';

/** The article's own level when it names one of ours; otherwise the middle of the range. */
const startLevel = (article: Article): ExerciseLevel =>
  EXERCISE_LEVELS.find((level) => article.level.toUpperCase().includes(level)) ?? 'B1';

export function GenerateForm({
  article,
  onMissingKey,
  onSaved,
}: {
  article: Article;
  onMissingKey: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { state, make } = useExerciseGeneration(article, onMissingKey);
  const [level, setLevel] = useState<ExerciseLevel>(() => startLevel(article));
  const [count, setCount] = useState(String(DEFAULT_COUNT));
  const number = Number(count);
  const valid = count.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= MAX_GENERATED_ITEMS;
  const working = state.status === 'working';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !working)
      void make({ level, count: number }).then((saved) => {
        if (saved) onSaved();
      });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.level')}</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as ExerciseLevel)}
            className={`${field} cursor-pointer`}
          >
            {EXERCISE_LEVELS.map((value) => (
              <option key={value} value={value}>
                {t(`levels.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.count')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GENERATED_ITEMS}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            aria-invalid={!valid || undefined}
            className={`${field} w-24 tnum`}
          />
        </label>
        <Button type="submit" disabled={!valid || working} aria-busy={working}>
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ListPlus className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{t('practice.make')}</span>
        </Button>
      </div>

      <div className="min-h-10 text-sm" aria-live="polite">
        {working && <p className="text-ink-600">{t('practice.making')}</p>}
        {state.status === 'error' && (
          <p role="alert" className="break-words text-bad-700">
            {state.message}
          </p>
        )}
        {state.status === 'done' && (
          <div className="space-y-1">
            <p className="text-ink-700">{t('practice.made', { count: state.items, units: state.units })}</p>
            {state.dropped > 0 && <p className="text-ink-700">{t('practice.dropped', { count: state.dropped })}</p>}
          </div>
        )}
        {state.status === 'idle' && !valid && (
          <p className="text-bad-700">{t('practice.countRange', { max: MAX_GENERATED_ITEMS })}</p>
        )}
      </div>
    </form>
  );
}
