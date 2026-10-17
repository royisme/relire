/**
 * The explanation of a wrong answer, in a side sheet (bottom sheet on phones)
 * like a word lookup, so the unit stays where it was. Shows the item, the
 * learner's answer against the reference, then the explanation or why it did
 * not arrive, with a way to ask again.
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ItemRuntime } from '../../hooks/useExerciseUnit';
import { expectedAnswerText, recordedAnswerText } from '../../services/exercises/answer';
import type { ExerciseItem, ExerciseType } from '../../types/exercises';
import { Button } from '../ui/button';
import { OverlayHeader, Sheet } from '../ui/overlay';
import { InlineMarkup } from './InlineMarkup';

interface ExplanationSheetProps {
  item: ExerciseItem;
  onWord: (word: string, sentence: string) => void;
  type: ExerciseType;
  runtime: ItemRuntime;
  onClose: () => void;
  onRetry: () => void;
}

export function ExplanationSheet({ item, type, runtime, onClose, onRetry, onWord }: ExplanationSheetProps) {
  const { t } = useTranslation();
  const { explanation, busy, error } = runtime;
  const given = recordedAnswerText(type, item, runtime.answer);
  return (
    <Sheet onClose={onClose} label={t('practice.explanationTitle')}>
      <OverlayHeader
        title={t('practice.explanationTitle')}
        subtitle={t(`grammarTags.${item.grammarTag}`)}
        onClose={onClose}
        closeLabel={t('common.close')}
      />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-2">
          <p className="break-words font-serif text-lg text-ink-900">
            <InlineMarkup text={item.prompt} onWord={onWord} />
          </p>
          <p className="break-words text-sm">
            <span className="text-ink-600">{t('practice.yourAnswer')}: </span>
            <span className="font-serif text-base text-bad-700 line-through">{given || '—'}</span>
          </p>
          <p className="break-words text-sm">
            <span className="text-ink-600">{t('practice.expected')}: </span>
            <span className="font-serif text-base font-semibold text-ok-800">{expectedAnswerText(item)}</span>
          </p>
        </section>

        {busy === 'explain' && (
          <p className="flex items-center gap-2 text-sm text-ink-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t('practice.explaining')}</span>
          </p>
        )}

        {error && (
          <div className="space-y-2">
            <p role="alert" className="break-words text-sm text-bad-700">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {explanation && (
          <section className="space-y-3 text-sm text-ink-800">
            <h4 className="break-words font-serif text-base font-semibold text-ink-900">
              <InlineMarkup text={explanation.summary} onWord={onWord} />
            </h4>
            {explanation.details.split(/\n+/).map((paragraph, index) => (
              <p key={index} className="break-words leading-relaxed">
                <InlineMarkup text={paragraph} onWord={onWord} />
              </p>
            ))}
            <p className="break-words border-t border-ink-200 pt-3 text-ink-600">
              <span className="font-medium text-ink-800">{t('practice.tip')}. </span>
              <InlineMarkup text={explanation.tip} onWord={onWord} />
            </p>
          </section>
        )}
      </div>
    </Sheet>
  );
}
