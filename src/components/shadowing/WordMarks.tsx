/**
 * WordMarks: renders assessed words inline with visual marks and accessible labels for errors.
 * Owns word-level presentation (wavy underlines, dimming, scores); owns no assessment or recording state.
 */
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { PronunciationAssessment } from '../../types';

export const WORK_ON_BELOW = 80;

export type WordResult = NonNullable<PronunciationAssessment['wordResults']>[number];

export function isMarkedWord(item: WordResult): boolean {
  const isFine =
    (!item.errorType || item.errorType === 'None') &&
    (item.accuracyScore === undefined || item.accuracyScore >= WORK_ON_BELOW);
  return !isFine;
}

/** The service's own error type, or a neutral "needs work" when only the score is low: never a claim it did not make. */
export function wordMarkLabel(item: WordResult, t: TFunction): string {
  return item.errorType && item.errorType !== 'None'
    ? t(`shadowing.wordError.${item.errorType}`, {
        defaultValue: item.errorType,
      })
    : t('shadowing.status.needs_work');
}

interface WordMarksProps {
  words: WordResult[];
  className?: string;
}

export function WordMarks({ words, className }: WordMarksProps) {
  const { t } = useTranslation();

  return (
    <span className={cn('font-serif break-words', className)}>
      {words.map((item, index) => {
        const marked = isMarkedWord(item);
        const spacer = index > 0 ? ' ' : null;

        if (!marked) {
          return (
            <span key={index}>
              {spacer}
              {item.word}
            </span>
          );
        }

        const isOmission = item.errorType === 'Omission';
        const isInsertion = item.errorType === 'Insertion';

        const errorLabel = wordMarkLabel(item, t);
        const label = item.accuracyScore !== undefined ? `${errorLabel} ${item.accuracyScore}` : errorLabel;

        if (isOmission) {
          return (
            <span key={index}>
              {spacer}
              <span
                className="opacity-50 underline decoration-dashed decoration-current underline-offset-4"
                title={label}
              >
                {item.word}
                <span className="sr-only"> ({label})</span>
              </span>
            </span>
          );
        }

        if (isInsertion) {
          return (
            <span key={index}>
              {spacer}
              <span className="opacity-60 text-sm" title={label}>
                +{item.word}
                <span className="sr-only"> ({label})</span>
              </span>
            </span>
          );
        }

        return (
          <span key={index}>
            {spacer}
            <span className="underline decoration-wavy decoration-current underline-offset-4" title={label}>
              {item.word}
              {item.accuracyScore !== undefined && (
                <span className="ml-0.5 text-xs tnum opacity-70" aria-hidden="true">
                  {item.accuracyScore}
                </span>
              )}
              <span className="sr-only"> ({label})</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
