/**
 * MATCH_PAIRS: the prompt is the left entry; the options are the right entries
 * stacked under it, and picking one writes its prefix letter (the key the
 * grader compares) into `matchSelection`. A wrong pick is struck through with
 * the right option beside it. Arrow keys move the pick, as a radio group does.
 */
import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeFrench } from '../../../services/exercises/grading';
import { cn } from '../../../lib/utils';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';

/** The letter an option is keyed by: its first character, as the grader does. */
const optionKey = (option: string) => (option.trim()[0] ?? '').toLowerCase();

export function MatchPairsControl({ item, answer, onChange, checked, disabled }: ExerciseControlProps) {
  const { t } = useTranslation();
  const options = item.options ?? [];
  const expected = String(item.expectedAnswer);
  const same = (a: string, b: string) =>
    normalizeFrench(a, checked?.strictAccents ?? true) === normalizeFrench(b, checked?.strictAccents ?? true);
  const rightOption = options.find((option) => same(optionKey(option), expected));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const picked = answer.matchSelection;

  const pick = (option: string) => {
    if (!disabled) onChange({ ...answer, matchSelection: optionKey(option) });
  };

  const onArrows = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    // Arrows move the pick from the radio that has focus, as a native radio group does.
    const focused = buttons.current.indexOf(event.target as HTMLButtonElement);
    const now =
      focused >= 0
        ? focused
        : Math.max(
            0,
            options.findIndex((option) => same(optionKey(option), picked)),
          );
    const next = (now + step + options.length) % options.length;
    pick(options[next]);
    buttons.current[next]?.focus();
  };

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">{item.prompt}</p>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <div
          role="radiogroup"
          aria-label={t('practice.answersLabel', { number: item.itemNumber })}
          onKeyDown={onArrows}
          className="flex w-full max-w-xl flex-col gap-0.5 rounded-md border border-ink-300 p-0.5"
        >
          {options.map((option, at) => {
            const selected = picked !== '' && same(optionKey(option), picked);
            const right = checked?.correct;
            return (
              <button
                key={option}
                ref={(element) => {
                  buttons.current[at] = element;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (!picked && at === 0) ? 0 : -1}
                aria-disabled={disabled || undefined}
                onClick={() => pick(option)}
                className={cn(
                  'min-h-9 max-sm:min-h-10 w-full max-w-full break-words rounded-md px-3 text-left font-sans text-sm',
                  disabled ? 'cursor-default' : 'cursor-pointer',
                  !selected && !disabled && 'text-ink-700 hover:bg-ink-100',
                  !selected && disabled && 'text-ink-500',
                  selected && !checked && 'bg-accent-100 font-medium text-accent-900',
                  selected && checked && right && 'bg-ok-50 font-medium text-ok-800',
                  selected && checked && !right && 'bg-bad-50 font-medium text-bad-700 line-through',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
        {checked && !checked.correct && <ExpectedBeside text={rightOption ?? expected} />}
      </div>
    </div>
  );
}
