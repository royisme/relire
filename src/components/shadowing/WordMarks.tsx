/**
 * WordMarks: renders assessed words inline with visual marks and accessible labels for errors.
 * Owns word-level presentation (wavy underlines, dimming); owns no assessment or recording state.
 * The sentence text stays clean: tapping a marked word is reported through `onWordPick` so its score
 * and error show outside the sentence, never as an inline number mixed into the text.
 */
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { MouseEvent } from 'react';
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
  /** Called when a marked word is tapped; the tap stops there, so a sentence button around it never toggles. */
  onWordPick: (index: number) => void;
  className?: string;
}

export function WordMarks({ words, onWordPick, className }: WordMarksProps) {
  const { t } = useTranslation();

  const pick = (event: MouseEvent<HTMLSpanElement>, index: number) => {
    event.stopPropagation();
    onWordPick(index);
  };

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
                className="py-1 opacity-50 underline decoration-dashed decoration-current underline-offset-4"
                title={label}
                onClick={(event) => pick(event, index)}
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
              <span className="py-1 opacity-60 text-sm" title={label} onClick={(event) => pick(event, index)}>
                +{item.word}
                <span className="sr-only"> ({label})</span>
              </span>
            </span>
          );
        }

        return (
          <span key={index}>
            {spacer}
            <span
              className="py-1 underline decoration-wavy decoration-current underline-offset-4"
              title={label}
              onClick={(event) => pick(event, index)}
            >
              {item.word}
              <span className="sr-only"> ({label})</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
