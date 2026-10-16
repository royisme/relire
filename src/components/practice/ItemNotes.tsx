/**
 * What sits under an item once there is something to say: the hint, the note
 * the unit carries for the item, the AI's feedback on an open answer (words
 * only, never a score), and why the last action failed. Polite live region, so
 * a hint or a verdict is read out when it arrives.
 */
import { useTranslation } from 'react-i18next';
import type { ExerciseItem } from '../../types/exercises';
import type { ItemRuntime } from '../../hooks/useExerciseUnit';
import { InlineMarkup } from './InlineMarkup';

export function ItemNotes({ item, runtime }: { item: ExerciseItem; runtime: ItemRuntime }) {
  const { t } = useTranslation();
  const { hint, checked, error } = runtime;
  const ai = checked?.aiFeedback;
  return (
    <div aria-live="polite" className="space-y-2">
      {hint && (
        <div className="space-y-1 border-l-2 border-ink-300 pl-3 text-sm text-ink-800">
          <p className="break-words">
            <span className="font-medium">{t('practice.hint')}. </span>
            <InlineMarkup text={hint.hint} />
          </p>
          <p className="break-words text-ink-600">
            {t('practice.rule')}: <InlineMarkup text={hint.grammarRule} />
            {hint.clueWord && (
              <>
                {' '}
                · {t('practice.clue')}: <InlineMarkup text={hint.clueWord} />
              </>
            )}
          </p>
        </div>
      )}
      {checked && item.explanation && (
        <p className="break-words text-sm text-ink-600">
          <span className="font-medium text-ink-800">{t('practice.note')}. </span>
          {item.explanation}
        </p>
      )}
      {ai && (
        <div className="space-y-1 border-l-2 border-ink-300 pl-3 text-sm text-ink-800">
          <p className="break-words">
            <span className="font-medium">{t('practice.aiFeedback')}. </span>
            <InlineMarkup text={ai.feedback} />
          </p>
          {ai.correctedVersion && (
            <p className="break-words text-ink-600">
              {t('practice.betterVersion')}:{' '}
              <span className="font-serif text-base text-ink-900">{ai.correctedVersion}</span>
            </p>
          )}
          <p className="text-xs text-ink-500">{t('practice.estimate')}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="break-words text-sm text-bad-700">
          {error}
        </p>
      )}
    </div>
  );
}
