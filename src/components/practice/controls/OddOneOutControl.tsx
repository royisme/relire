/**
 * ODD_ONE_OUT: the question, then the words as options to pick the one that
 * does not belong. The pick goes into `selectedOdd` as the word itself. A wrong
 * pick is struck through with the right word beside it. Arrow keys move the
 * pick, as a radio group does.
 */
import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';
import { InlineMarkup } from '../InlineMarkup';

export function OddOneOutControl({ item, onWord, answer, onChange, checked, disabled }: ExerciseControlProps) {
  const { t } = useTranslation();
  const options = item.options ?? [];
  const expected = String(item.expectedAnswer);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const picked = answer.selectedOdd ?? '';

  const pick = (option: string) => {
    if (!disabled) onChange({ ...answer, selectedOdd: option });
  };

  const onArrows = (event: KeyboardEvent<HTMLSpanElement>) => {
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
    const now = focused >= 0 ? focused : Math.max(0, options.indexOf(picked));
    const next = (now + step + options.length) % options.length;
    pick(options[next]);
    buttons.current[next]?.focus();
  };

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">
        <InlineMarkup text={item.prompt} onWord={onWord} />
      </p>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          role="radiogroup"
          aria-label={t('practice.wordsLabel', { number: item.itemNumber })}
          onKeyDown={onArrows}
          className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-ink-300 p-0.5"
        >
          {options.map((option, at) => {
            const selected = picked === option;
            const right = Boolean(checked) && selected && option === expected;
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
                  'min-h-9 max-sm:min-h-10 max-w-full break-words rounded-md px-3 font-sans text-sm',
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
        </span>
        {checked && !checked.correct && <ExpectedBeside text={expected} />}
      </p>
      {item.secondaryPrompt && (
        <p className="break-words text-sm text-ink-500">
          <InlineMarkup text={item.secondaryPrompt} onWord={onWord} />
        </p>
      )}
    </div>
  );
}
