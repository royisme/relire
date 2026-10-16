/**
 * FILL_BLANKS: the sentence with a typed underline wherever the prompt has
 * `[___]`. One blank answers into `singleAnswer`, several into `multiAnswers`.
 * A prompt without a blank is a question with one answer line under it.
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeFrench } from '../../../services/exercises/grading';
import { ExpectedBeside, UnderlineInput, type BlankState } from './UnderlineInput';
import type { ExerciseControlProps } from './types';

export function FillBlanksControl({
  item,
  answer,
  onChange,
  checked,
  disabled,
  grading,
  registerInput,
}: ExerciseControlProps) {
  const { t } = useTranslation();
  const parts = item.prompt.split('[___]');
  const blanks = Math.max(1, parts.length - 1);
  const expected = Array.isArray(item.expectedAnswer) ? item.expectedAnswer : [item.expectedAnswer];
  const values = blanks > 1 ? answer.multiAnswers : [answer.singleAnswer];

  const setValue = (index: number, value: string) =>
    onChange(
      blanks > 1
        ? { ...answer, multiAnswers: answer.multiAnswers.map((old, at) => (at === index ? value : old)) }
        : { ...answer, singleAnswer: value },
    );

  const stateOf = (index: number): BlankState => {
    if (!checked) return 'open';
    if (checked.correct) return 'right';
    // A wrong item can still have blanks that were right; mark them the way the grader compared them.
    if (blanks === 1) return 'wrong';
    const same =
      normalizeFrench(values[index] ?? '', grading.strictAccents) ===
      normalizeFrench(expected[index] ?? '', grading.strictAccents);
    return same ? 'right' : 'wrong';
  };

  const blank = (index: number, className: string, align?: 'left') => (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 align-baseline">
      <UnderlineInput
        value={values[index] ?? ''}
        onChange={(value) => setValue(index, value)}
        slot={index}
        registerInput={registerInput}
        label={
          blanks > 1
            ? t('practice.blankLabel', { number: item.itemNumber, blank: index + 1 })
            : t('practice.answerLabel', { number: item.itemNumber })
        }
        state={stateOf(index)}
        readOnly={disabled}
        className={className}
        align={align}
      />
      {stateOf(index) === 'wrong' && (
        <ExpectedBeside text={blanks > 1 ? (expected[index] ?? '') : expected.join(' / ')} />
      )}
    </span>
  );

  if (parts.length === 1) {
    return (
      <div className="space-y-2">
        <p className="break-words font-serif text-lg text-ink-900">{item.prompt}</p>
        {blank(0, 'w-full max-w-md', 'left')}
      </div>
    );
  }

  return (
    <p className="break-words font-serif text-lg leading-[2.1] text-ink-900">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <span className="mx-1">{blank(index, 'w-28')}</span>}
        </Fragment>
      ))}
    </p>
  );
}
