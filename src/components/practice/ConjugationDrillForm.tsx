/**
 * "Conjugation drills": pick pack verbs and tenses, get one WORD_TRANSFORM
 * exercise set per tense. No AI key is involved: the verbs come from the
 * reviewed pack (useGrammarPack) through prepareConjugationDrills. The button
 * carries its own working state; the pack's loading, error and empty states
 * stay inside the fixed-height verb slot; a failed save keeps the prepared
 * units so the next press retries the same payload with the same ids.
 * Does not own the dialog it lives in (AddExercisesDialog) or the sets table.
 */
import { useState, type FormEvent } from 'react';
import { ListPlus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { verifyPackVerb } from '../../services/conjugation/verify';
import {
  DEFAULT_DRILL_COUNT,
  DEFAULT_DRILL_LEVEL,
  prepareConjugationDrills,
} from '../../services/exercises/fromConjugation';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { useUnitSaver } from '../../hooks/useUnitSaver';
import { EXERCISE_LEVELS, type ExerciseLevel } from '../../types/exercises';
import { TENSES, type Tense } from '../../types/grammarPack';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';

const field =
  'h-10 rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900 focus:border-accent-600 focus:outline-none';

export function ConjugationDrillForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const pack = useGrammarPack();
  const verbs = pack.status === 'ready' ? (pack.pack?.verbs ?? []) : [];
  const [pickedVerbs, setPickedVerbs] = useState<Set<string>>(new Set());
  const [pickedTenses, setPickedTenses] = useState<Set<Tense>>(new Set());
  const [level, setLevel] = useState<ExerciseLevel>(DEFAULT_DRILL_LEVEL);
  const [count, setCount] = useState(String(DEFAULT_DRILL_COUNT));
  const { status, save, drop: dropPayload } = useUnitSaver();

  const number = Number(count);
  const validCount = count.trim() !== '' && Number.isInteger(number) && number >= 1;
  const ready = pack.status === 'ready' && verbs.length > 0;
  const valid = ready && pickedVerbs.size > 0 && pickedTenses.size > 0 && validCount;
  const working = status.kind === 'working';

  // Any change after a failed save drops the prepared batch (dropPayload): the next press prepares afresh.
  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  async function make() {
    if (!valid) return;
    const units = await save(() =>
      prepareConjugationDrills({
        verbs: verbs.filter((row) => pickedVerbs.has(row.id)).map(verifyPackVerb),
        tenses: TENSES.filter((tense) => pickedTenses.has(tense)),
        level,
        packVersion: pack.status === 'ready' ? pack.pack?.packVersion : undefined,
        perUnit: number,
        t,
      }),
    );
    if (units) onSaved();
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void make();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="min-w-0 space-y-1">
        <legend className="text-sm font-medium text-ink-800">{t('conjugation.drill.verbs')}</legend>
        <div className="h-20 overflow-y-auto sm:h-10">
          {pack.status === 'loading' && <p className="text-sm text-ink-500">{t('conjugation.drill.loading')}</p>}
          {pack.status === 'error' && (
            <p role="alert" className="break-words text-sm text-bad-700">
              {pack.error}
            </p>
          )}
          {pack.status === 'ready' && verbs.length === 0 && (
            <p className="text-sm text-ink-500">{t('conjugation.drill.noVerbs')}</p>
          )}
          {verbs.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
              {verbs.map((row) => (
                <label
                  key={row.id}
                  className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 text-sm text-ink-900"
                >
                  <Checkbox
                    className="size-6"
                    checked={pickedVerbs.has(row.id)}
                    onCheckedChange={() => {
                      dropPayload();
                      setPickedVerbs(toggle(pickedVerbs, row.id));
                    }}
                  />
                  <span className="break-words">{row.infinitive}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-1">
        <legend className="text-sm font-medium text-ink-800">{t('conjugation.drill.tenses')}</legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {TENSES.map((tense) => (
            <label key={tense} className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 text-sm text-ink-900">
              <Checkbox
                className="size-6"
                checked={pickedTenses.has(tense)}
                onCheckedChange={() => {
                  dropPayload();
                  setPickedTenses(toggle(pickedTenses, tense));
                }}
              />
              <span className="break-words">{t(`conjugation.tenses.${tense}.name`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.level')}</span>
          <select
            value={level}
            onChange={(event) => {
              dropPayload();
              setLevel(event.target.value as ExerciseLevel);
            }}
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
          <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.drillItems')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={count}
            onChange={(event) => {
              dropPayload();
              setCount(event.target.value);
            }}
            aria-invalid={!validCount || undefined}
            className={`${field} w-24 tnum`}
          />
        </label>
        <Button type="submit" variant={valid ? 'default' : 'outline'} disabled={!valid || working} aria-busy={working}>
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ListPlus className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{t('conjugation.drill.make')}</span>
        </Button>
      </div>

      <div className="min-h-10 text-sm" aria-live="polite">
        {working && <p className="text-ink-600">{t('conjugation.drill.making')}</p>}
        {status.kind === 'error' && (
          <p role="alert" className="break-words text-bad-700">
            {status.message}
          </p>
        )}
        {status.kind === 'done' && (
          <p className="text-ink-700">
            {t('conjugation.drill.made', { count: status.units.reduce((sum, unit) => sum + unit.items.length, 0) })}
          </p>
        )}
        {status.kind === 'idle' && !validCount && <p className="text-bad-700">{t('conjugation.drill.countRange')}</p>}
      </div>
    </form>
  );
}
