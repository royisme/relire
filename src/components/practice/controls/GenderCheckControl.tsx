/**
 * GENDER_CHECK: the word or phrase in the prompt, then a small row of gender
 * options (the item's own, or M and F when it names none) to pick one from.
 * The pick goes into `singleAnswer`. A wrong pick is struck through with the
 * right gender beside it. Arrow keys move the pick, as a radio group does.
 */
import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { nounGenderDrillMeta, tendencyPercent } from '../../../types/nounGenderDrill';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';
import { InlineMarkup } from '../InlineMarkup';

export function GenderCheckControl({ item, onWord, answer, onChange, checked, disabled }: ExerciseControlProps) {
  const { t } = useTranslation();
  const options = item.options ?? ['M', 'F'];
  const expected = String(item.expectedAnswer);
  const feedback = nounGenderDrillMeta(item.meta);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (option: string) => {
    if (!disabled) onChange({ ...answer, singleAnswer: option });
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
    const now = focused >= 0 ? focused : Math.max(0, options.indexOf(answer.singleAnswer));
    const next = (now + step + options.length) % options.length;
    pick(options[next]);
    buttons.current[next]?.focus();
  };

  const name = (option: string) =>
    option === 'M' ? t('practice.genderMasculine') : option === 'F' ? t('practice.genderFeminine') : option;

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">
        <InlineMarkup text={item.prompt} onWord={onWord} />
      </p>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          role="radiogroup"
          aria-label={t('practice.genderLabel', { number: item.itemNumber })}
          onKeyDown={onArrows}
          className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-ink-300 p-0.5"
        >
          {options.map((option, at) => {
            const selected = answer.singleAnswer === option;
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
                aria-label={name(option)}
                tabIndex={selected || (!answer.singleAnswer && at === 0) ? 0 : -1}
                aria-disabled={disabled || undefined}
                onClick={() => pick(option)}
                className={cn(
                  'min-h-9 max-sm:min-h-10 rounded-md px-4 font-sans text-sm',
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
        {checked && !checked.correct && <ExpectedBeside text={name(expected)} />}
      </p>
      {feedback && feedback.rules.length > 0 && (
        <div className="h-20 overflow-y-auto border-l-2 border-ink-300 pl-3 text-sm text-ink-700" aria-live="polite">
          {checked &&
            feedback.rules.map((rule) => (
              <p key={rule.id} className="break-words">
                {t('nounGender.ruleLine', {
                  rule: t(`nounGender.rules.${rule.id}`),
                  percent: tendencyPercent(rule.percent),
                  n: rule.n,
                })}
              </p>
            ))}
          {checked && feedback.exception && <p className="break-words">{t('nounGender.exception')}</p>}
        </div>
      )}
    </div>
  );
}
