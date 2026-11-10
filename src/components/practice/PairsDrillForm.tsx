/** Owns lazy pack readiness and sound-drill inputs; preparation and save-only retries use the ordinary unit flow. */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FRENCH_IPA } from '../../data/frenchIpa';
import { useUnitSaver } from '../../hooks/useUnitSaver';
import { DEFAULT_PAIRS_COUNT, DEFAULT_PAIRS_LEVEL, preparePairsDrills } from '../../services/exercises/fromPairs';
import { loadedMinimalPairsPack, loadMinimalPairsPack } from '../../services/minimalPairs/load';
import { EXERCISE_LEVELS, type ExerciseLevel } from '../../types/exercises';
import type { MinimalPairsPack } from '../../types/minimalPairs';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type PackState = { kind: 'loading' } | { kind: 'ready'; pack: MinimalPairsPack } | { kind: 'error'; message: string };

export function PairsDrillForm() {
  const { t } = useTranslation();
  const [state, setState] = useState<PackState>(() => {
    const pack = loadedMinimalPairsPack();
    return pack ? { kind: 'ready', pack } : { kind: 'loading' };
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [count, setCount] = useState(String(DEFAULT_PAIRS_COUNT));
  const [level, setLevel] = useState<ExerciseLevel>(DEFAULT_PAIRS_LEVEL);
  const { status, save } = useUnitSaver();
  useEffect(() => {
    let live = true;
    void loadMinimalPairsPack().then(
      (pack) => {
        if (live) setState({ kind: 'ready', pack });
      },
      (error: unknown) => {
        if (live) setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const pack = state.kind === 'ready' ? state.pack : undefined;
  const contrasts = [...new Set(pack?.pairs.map((pair) => pair.contrast))];
  const max = pack?.pairs.filter((pair) => picked.includes(pair.contrast)).length ?? 0;
  const number = Number(count);
  const validCount = count.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= max;
  const working = status.kind === 'working';
  // A failed write retries the same prepared sample, not a fresh selection.
  const locked = working || status.kind === 'error';
  const levels = EXERCISE_LEVELS.map((value) => ({ value, label: t(`levels.${value}`) }));
  const sounds = Object.values(FRENCH_IPA).flat();
  const soundLabel = (symbol: string) => {
    const sound = sounds.find((entry) => entry.symbol === symbol)!;
    return t('minimalPairs.drill.sound', { symbol: sound.symbol, word: sound.word });
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (pack && validCount && picked.length)
          void save(() => preparePairsDrills({ pack, contrasts: picked, count: number, level, t }));
      }}
    >
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('minimalPairs.drill.title')}</h3>
      <p className="text-sm text-ink-600">{t('minimalPairs.drill.description')}</p>
      <fieldset className="min-w-0" disabled={locked}>
        <legend className="mb-1 text-sm text-ink-700">{t('minimalPairs.drill.contrasts')}</legend>
        <div className="h-64 overflow-y-auto" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && <p className="text-sm text-ink-500">{t('common.loading')}</p>}
          {state.kind === 'error' && (
            <p role="alert" className="break-words text-sm text-bad-700">
              {state.message}
            </p>
          )}
          {contrasts.map((contrast) => {
            const [first, second] = contrast.split('-');
            return (
              <label
                key={contrast}
                className="flex min-h-10 cursor-pointer items-start gap-3 py-2 text-sm text-ink-800"
              >
                <Checkbox
                  className="mt-1"
                  checked={picked.includes(contrast)}
                  onCheckedChange={(checked) =>
                    setPicked((previous) =>
                      checked ? [...previous, contrast] : previous.filter((id) => id !== contrast),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {t('minimalPairs.drill.contrast', { first: soundLabel(first), second: soundLabel(second) })}
                  {(contrast === 'b-p' || contrast === 'y-u') && (
                    <span className="mt-1 block text-xs text-ink-600">{t(`minimalPairs.drill.tips.${contrast}`)}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 w-48 max-w-full">
          <label id="pairs-level-label" className="mb-1 block text-sm text-ink-700">
            {t('practice.level')}
          </label>
          <Select
            items={levels}
            value={level}
            disabled={locked}
            onValueChange={(value) => {
              if (value) setLevel(value);
            }}
          >
            <SelectTrigger aria-labelledby="pairs-level-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {levels.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28">
          <label htmlFor="pairs-count" className="mb-1 block text-sm text-ink-700">
            {t('practice.drillItems')}
          </label>
          <Input
            id="pairs-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            value={count}
            disabled={locked}
            onChange={(event) => setCount(event.target.value)}
            aria-invalid={(picked.length > 0 && !validCount) || undefined}
            aria-describedby="pairs-save-status"
            className="tnum"
          />
        </div>
        <Button
          type="submit"
          className="w-48 max-w-full"
          disabled={!pack || !picked.length || !validCount || working}
          aria-busy={working}
        >
          {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t(
            working
              ? 'minimalPairs.drill.making'
              : status.kind === 'error'
                ? 'common.retry'
                : 'minimalPairs.drill.make',
          )}
        </Button>
      </div>
      <div id="pairs-save-status" className="h-16 overflow-y-auto text-sm" aria-live="polite">
        {status.kind === 'error' && (
          <p role="alert" className="break-words text-bad-700">
            {status.message}
          </p>
        )}
        {!picked.length && <p className="text-ink-600">{t('minimalPairs.drill.pickContrast')}</p>}
        {picked.length > 0 && !validCount && (
          <p className="text-bad-700">{t('minimalPairs.drill.countRange', { max })}</p>
        )}
        {status.kind === 'done' && (
          <Link
            to={{ name: 'practiceSet', area: 'listening', setId: status.units[0].setId }}
            className="inline-flex min-h-10 items-center text-accent-900 underline underline-offset-2"
          >
            {t('minimalPairs.drill.open')}
          </Link>
        )}
      </div>
    </form>
  );
}
