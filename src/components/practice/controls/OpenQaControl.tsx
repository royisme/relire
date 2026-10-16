/**
 * OPEN_QA: a question and a text area for a full sentence. A match with the
 * sample or an accepted wording is right at once; anything else is judged by an
 * AI, which writes feedback (shown by the row) but gives no score. The note
 * under the area says so before the learner checks. Enter checks; Shift+Enter
 * starts a new line.
 */
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';

export function OpenQaControl({ item, answer, onChange, checked, disabled, registerInput }: ExerciseControlProps) {
  const { t } = useTranslation();
  const sample = Array.isArray(item.expectedAnswer) ? item.expectedAnswer.join(' / ') : item.expectedAnswer;
  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">{item.prompt}</p>
      {item.secondaryPrompt && <p className="break-words text-sm text-ink-500">{item.secondaryPrompt}</p>}
      <textarea
        ref={(element) => registerInput(0, element)}
        lang="fr"
        value={answer.singleAnswer}
        readOnly={disabled}
        rows={3}
        onChange={(event) => onChange({ ...answer, singleAnswer: event.target.value })}
        aria-label={t('practice.answerLabel', { number: item.itemNumber })}
        aria-invalid={(checked && !checked.correct) || undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          'block h-24 w-full max-w-xl resize-none rounded-md border bg-surface px-3 py-2 font-serif text-base text-ink-900 outline-offset-2',
          !checked && 'border-ink-300 focus:border-accent-700',
          checked?.correct && 'border-ok-700 text-ok-800',
          checked && !checked.correct && 'border-bad-600 text-bad-700 line-through',
        )}
      />
      <p className="text-xs text-ink-500">{t('practice.openNote')}</p>
      {checked && !checked.correct && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-ink-600">{t('practice.sampleAnswer')}</span>
          <ExpectedBeside text={sample} />
        </p>
      )}
    </div>
  );
}
