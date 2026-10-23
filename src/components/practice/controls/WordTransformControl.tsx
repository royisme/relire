/**
 * WORD_TRANSFORM: a word, an arrow, and a typed blank for its other form
 * (feminine, plural, …). The extra cue line (`secondaryPrompt`) sits under it.
 */
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpectedBeside, UnderlineInput } from './UnderlineInput';
import type { ExerciseControlProps } from './types';
import { InlineMarkup } from '../InlineMarkup';

export function WordTransformControl({
  item,
  onWord,
  answer,
  onChange,
  checked,
  disabled,
  registerInput,
}: ExerciseControlProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-lg text-ink-900">
        <span className="break-words">
          <InlineMarkup text={item.prompt} onWord={onWord} />
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 self-center text-ink-400" aria-hidden="true" />
        <UnderlineInput
          value={answer.singleAnswer}
          onChange={(value) => onChange({ ...answer, singleAnswer: value })}
          slot={0}
          registerInput={registerInput}
          label={t('practice.answerLabel', { number: item.itemNumber })}
          state={!checked ? 'open' : checked.correct ? 'right' : 'wrong'}
          readOnly={disabled}
          className="w-44 max-w-full"
          align="left"
        />
        {checked && !checked.correct && (
          <ExpectedBeside
            text={Array.isArray(item.expectedAnswer) ? item.expectedAnswer.join(' / ') : item.expectedAnswer}
          />
        )}
      </div>
      {item.secondaryPrompt && (
        <p className="break-words text-sm text-ink-500">
          <InlineMarkup text={item.secondaryPrompt} onWord={onWord} />
        </p>
      )}
    </div>
  );
}
