/** Owns noun-drill inputs and a bounded save status; useUnitSaver retains prepared identities after failure. */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUnitSaver } from '../../../hooks/useUnitSaver';
import {
  DEFAULT_GENDER_COUNT,
  DEFAULT_GENDER_LEVEL,
  prepareGenderDrills,
} from '../../../services/exercises/fromGender';
import { EXERCISE_LEVELS, type ExerciseLevel } from '../../../types/exercises';
import type { NounGenderPack } from '../../../types/nounGender';
import { Link } from '../../shell/Link';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

export function GenderDrillForm({ pack }: { pack: NounGenderPack }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<ExerciseLevel>(DEFAULT_GENDER_LEVEL);
  const [count, setCount] = useState(String(DEFAULT_GENDER_COUNT));
  const { status, save } = useUnitSaver();
  const number = Number(count);
  const valid = count.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= pack.nouns.length;
  const working = status.kind === 'working';
  // After a failed write the controls stay locked: Retry can only save the same prepared sample.
  const locked = working || status.kind === 'error';
  const levels = EXERCISE_LEVELS.map((value) => ({ value, label: t(`levels.${value}`) }));
  return (
    <form
      className="space-y-3 border-b border-ink-200 pb-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void save(() => prepareGenderDrills({ pack, count: number, level, t }));
      }}
    >
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('nounGender.drill.title')}</h3>
      <p className="text-sm text-ink-600">{t('nounGender.drill.description')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 w-48 max-w-full">
          <label id="gender-level-label" className="mb-1 block text-sm text-ink-700">
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
            <SelectTrigger aria-labelledby="gender-level-label">
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
          <label htmlFor="gender-count" className="mb-1 block text-sm text-ink-700">
            {t('practice.drillItems')}
          </label>
          <Input
            id="gender-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={pack.nouns.length}
            step={1}
            value={count}
            disabled={locked}
            onChange={(event) => setCount(event.target.value)}
            aria-invalid={!valid || undefined}
            aria-describedby="gender-save-status"
            className="tnum"
          />
        </div>
        <Button type="submit" className="w-48 max-w-full" disabled={!valid || working} aria-busy={working}>
          {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t(working ? 'nounGender.drill.making' : status.kind === 'error' ? 'common.retry' : 'nounGender.drill.make')}
        </Button>
      </div>
      <div id="gender-save-status" className="h-16 overflow-y-auto text-sm" aria-live="polite">
        {status.kind === 'error' && (
          <p role="alert" className="break-words text-bad-700">
            {status.message}
          </p>
        )}
        {!valid && <p className="text-bad-700">{t('nounGender.drill.countRange', { max: pack.nouns.length })}</p>}
        {status.kind === 'done' && (
          <Link
            to={{ name: 'practiceSet', setId: status.units[0].setId }}
            className="inline-flex min-h-10 items-center text-accent-900 underline underline-offset-2"
          >
            {t('nounGender.drill.open')}
          </Link>
        )}
      </div>
    </form>
  );
}
