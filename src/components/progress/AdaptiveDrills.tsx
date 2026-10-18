/** One adaptive action with retained-save retry and explicit discard/leave decisions. */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ListPlus } from 'lucide-react';
import { EXERCISE_LEVELS, type ExerciseLevel } from '../../types/exercises';
import type { GrammarTag } from '../../types/grammar';
import { MAX_GENERATED_ITEMS } from '../../services/api';
import { useAdaptiveDrills } from '../../hooks/useAdaptiveDrills';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';

const field = 'h-10 rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900';
export function AdaptiveDrills({
  targets,
  disabled,
  onMissingKey,
}: {
  targets: GrammarTag[];
  disabled: boolean;
  onMissingKey: () => void;
}) {
  const { t } = useTranslation();
  const drills = useAdaptiveDrills(onMissingKey);
  const [level, setLevel] = useState<ExerciseLevel>('B1');
  const [count, setCount] = useState('8');
  const [discarding, setDiscarding] = useState(false);
  const pending = drills.phase !== 'idle';
  const saving = drills.phase === 'saving';
  const valid =
    count.trim() !== '' &&
    Number.isInteger(Number(count)) &&
    Number(count) >= 1 &&
    Number(count) <= MAX_GENERATED_ITEMS;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (drills.prepared) void drills.retry();
    else if (valid && !disabled) void drills.make(targets, level, Number(count));
  }
  function keep() {
    if (saving) return;
    drills.guard.decide(false);
    setDiscarding(false);
  }
  return (
    <div className="space-y-3 min-w-0">
      <h3 className="font-serif text-lg text-ink-900">{t('adaptive.title')}</h3>
      <p className="text-sm text-ink-600 break-words">
        {targets.length
          ? t('adaptive.targets', { tags: targets.map((tag) => t(`grammarTags.${tag}`)).join(', ') })
          : t('adaptive.noTargets')}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={pending || !!drills.prepared} className="flex flex-wrap gap-3">
          <label className="block text-sm text-ink-800">
            <span className="block mb-1">{t('practice.level')}</span>
            <select value={level} onChange={(event) => setLevel(event.target.value as ExerciseLevel)} className={field}>
              {EXERCISE_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {t(`levels.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-ink-800">
            <span className="block mb-1">{t('practice.count')}</span>
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
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            className="w-48"
            disabled={pending || (!drills.prepared && (disabled || !targets.length || !valid))}
            aria-busy={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ListPlus className="h-4 w-4" aria-hidden="true" />
            )}
            {t(drills.prepared ? 'adaptive.retry' : 'adaptive.make')}
          </Button>
          {drills.prepared && (
            <Button variant="outline" disabled={pending} onClick={() => setDiscarding(true)}>
              {t('adaptive.discard')}
            </Button>
          )}
        </div>
        <div role="status" className="h-24 overflow-auto text-sm break-words whitespace-pre-wrap">
          {pending && <p className="text-ink-600">{t(saving ? 'adaptive.saving' : 'adaptive.generating')}</p>}
          {drills.error && <p className="text-bad-700">{drills.error}</p>}
          {drills.prepared && !pending && (
            <p className="text-ink-700">
              {t('adaptive.unsaved', {
                title: drills.prepared.title,
                items: t('practice.items', { count: drills.prepared.items.length }),
              })}{' '}
              {drills.prepared.instruction}
            </p>
          )}
          {!valid && !drills.prepared && (
            <p className="text-bad-700">{t('practice.countRange', { max: MAX_GENERATED_ITEMS })}</p>
          )}
        </div>
      </form>
      {(drills.guard.leaving || discarding) && (
        <Dialog label={t('adaptive.leaveTitle')} onClose={keep} className="max-w-sm">
          <OverlayHeader title={t('adaptive.leaveTitle')} closeLabel={t('common.close')} onClose={keep} />
          <div className="p-5 space-y-4">
            <p className="text-sm">{t(saving ? 'adaptive.saving' : 'adaptive.leaveHelp')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving} onClick={keep}>
                {t('adaptive.keep')}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  if (discarding) {
                    drills.discard();
                    setDiscarding(false);
                  } else drills.guard.decide(true);
                }}
              >
                {t('adaptive.discard')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
