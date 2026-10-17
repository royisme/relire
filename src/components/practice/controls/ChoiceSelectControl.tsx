/**
 * CHOICE_SELECT: the sentence with each `{a|b}` shown as a small row of
 * options to press. The pick goes into `choiceSelections` by group. A wrong
 * pick is struck through with the right option beside it.
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { choicePieces } from '../../../services/exercises/answer';
import { normalizeFrench } from '../../../services/exercises/grading';
import { cn } from '../../../lib/utils';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';

export function ChoiceSelectControl({ item, answer, onChange, checked, disabled, grading }: ExerciseControlProps) {
  const { t } = useTranslation();
  const pieces = choicePieces(item.prompt);
  const expected = Array.isArray(item.expectedAnswer) ? item.expectedAnswer : [item.expectedAnswer];
  const same = (a: string, b: string) =>
    normalizeFrench(a, grading.strictAccents) === normalizeFrench(b, grading.strictAccents);

  const pick = (group: number, option: string) => {
    if (disabled) return;
    onChange({ ...answer, choiceSelections: answer.choiceSelections.map((old, at) => (at === group ? option : old)) });
  };

  return (
    <p className="break-words font-serif text-lg leading-[2.4] text-ink-900">
      {pieces.map((piece, at) => {
        if (piece.kind === 'text') return <Fragment key={at}>{piece.text}</Fragment>;
        const chosen = answer.choiceSelections[piece.index] ?? '';
        const right = Boolean(checked) && same(chosen, expected[piece.index] ?? '');
        return (
          <span key={at} className="mx-1 inline-flex max-w-full flex-wrap items-center gap-x-2 align-middle">
            <span
              role="group"
              aria-label={t('practice.choiceLabel', { number: item.itemNumber, group: piece.index + 1 })}
              className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-ink-300 p-0.5"
            >
              {piece.options.map((option) => {
                const selected = chosen === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    aria-disabled={disabled || undefined}
                    onClick={() => pick(piece.index, option)}
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
            {checked && !right && <ExpectedBeside text={expected[piece.index] ?? ''} />}
          </span>
        );
      })}
    </p>
  );
}
