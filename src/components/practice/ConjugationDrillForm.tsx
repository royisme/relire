/**
 * "Conjugation drills": pick pack verbs and tenses, get one WORD_TRANSFORM
 * exercise set per tense. No AI key is involved: the verbs come from the
 * reviewed pack (useGrammarPack) through prepareConjugationDrills. The button
 * carries its own working state; the pack's loading, error and empty states
 * stay inside the fixed-height verb slot; a failed save keeps the prepared
 * units so the next press retries the same payload with the same ids.
 * Does not own the dialog it lives in (AddExercisesDialog) or the sets table.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ListPlus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { verifyPackVerb } from '../../services/conjugation/verify';
import { prepareConjugationDrills } from '../../services/exercises/fromConjugation';
import { saveUnits } from '../../storage/exercises';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { EXERCISE_LEVELS, type ExerciseLevel, type ExerciseUnit } from '../../types/exercises';
import { TENSES, type Tense } from '../../types/grammarPack';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';

const DEFAULT_COUNT = 8;
/** The pack verbs are the first a learner meets; the level stays a free choice. */
const DEFAULT_LEVEL: ExerciseLevel = 'A2';
const field =
  'h-10 rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900 focus:border-accent-600 focus:outline-none';

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; items: number; units: number };

export function ConjugationDrillForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const pack = useGrammarPack();
  const verbs = pack.status === 'ready' ? (pack.pack?.verbs ?? []) : [];
  const [pickedVerbs, setPickedVerbs] = useState<Set<string>>(new Set());
  const [pickedTenses, setPickedTenses] = useState<Set<Tense>>(new Set());
  const [level, setLevel] = useState<ExerciseLevel>(DEFAULT_LEVEL);
  const [count, setCount] = useState(String(DEFAULT_COUNT));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  /** Units prepared but not yet committed; a retry saves these, never a fresh batch. */
  const payload = useRef<ExerciseUnit[] | null>(null);
  const busy = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const number = Number(count);
  const validCount = count.trim() !== '' && Number.isInteger(number) && number >= 1;
  const ready = pack.status === 'ready' && verbs.length > 0;
  const valid = ready && pickedVerbs.size > 0 && pickedTenses.size > 0 && validCount;
  const working = status.kind === 'working';

  // Any change after a failed save drops the prepared batch: the next press prepares afresh.
  const dropPayload = () => {
    payload.current = null;
  };
  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  async function make() {
    if (busy.current || !valid) return;
    busy.current = true;
    setStatus({ kind: 'working' });
    try {
      const units =
        payload.current ??
        prepareConjugationDrills({
          verbs: verbs.filter((row) => pickedVerbs.has(row.id)).map(verifyPackVerb),
          tenses: TENSES.filter((tense) => pickedTenses.has(tense)),
          level,
          packVersion: pack.status === 'ready' ? pack.pack?.packVersion : undefined,
          perUnit: number,
          t,
        });
      payload.current = units;
      await saveUnits(units);
      payload.current = null;
      if (!live.current) return;
      setStatus({ kind: 'done', items: units.reduce((sum, unit) => sum + unit.items.length, 0), units: units.length });
      onSaved();
    } catch (err) {
      if (!live.current) return;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      busy.current = false;
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void make();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="min-h-24 space-y-1">
        <span className="block text-sm font-medium text-ink-800">{t('conjugation.drill.verbs')}</span>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {verbs.map((row) => (
              <label key={row.id} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-900">
                <Checkbox
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

      <div className="space-y-1">
        <span className="block text-sm font-medium text-ink-800">{t('conjugation.drill.tenses')}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TENSES.map((tense) => (
            <label key={tense} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-900">
              <Checkbox
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
      </div>

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
          <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.count')}</span>
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
        <Button type="submit" disabled={!valid || working} aria-busy={working}>
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
          <p className="text-ink-700">{t('conjugation.drill.made', { count: status.items })}</p>
        )}
        {status.kind === 'idle' && !validCount && <p className="text-bad-700">{t('conjugation.drill.countRange')}</p>}
      </div>
    </form>
  );
}
