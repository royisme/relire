/** The practice card's score strip: Check and glanced metrics; opens the full AssessmentResult in a Sheet. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AudioLines, Loader2 } from 'lucide-react';
import type { PracticeCardController } from '../../hooks/usePracticeCard';
import { AssessmentResult } from '../shadowing/AssessmentResult';
import { Button } from '../ui/button';
import { OverlayHeader, Sheet } from '../ui/overlay';
import { panelGhost, panelOutline } from './panel';

export function PracticeAssessment({ card }: { card: PracticeCardController }) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const assessment = card.assessment;
  const metrics = assessment
    ? [
        { label: t('shadowing.accuracy'), value: assessment.accuracyScore },
        { label: t('shadowing.fluency'), value: assessment.fluencyScore },
        {
          label: t('shadowing.completeness'),
          value: assessment.completenessScore,
        },
        { label: t('shadowing.rhythm'), value: assessment.rhythmScore },
      ].filter((m): m is { label: string; value: number } => m.value !== undefined)
    : [];

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-t border-panel-line px-4 py-3 min-h-[5.5rem]">
        <div className="min-w-0 flex-1" aria-live="polite" aria-busy={card.isEvaluating}>
          {card.assessmentError ? (
            <p role="alert" className="text-xs text-panel-bad-ink break-words">
              {t('shadowing.assessError')} {card.assessmentError}
            </p>
          ) : assessment ? (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-3xl font-semibold tnum leading-none">{assessment.overallScore}</span>
                <span className="text-xs text-panel-muted">{t('shadowing.overallEstimate')}</span>
              </div>
              {metrics.length > 0 && (
                <div className="flex flex-wrap gap-x-3 text-xs">
                  {metrics.map((m) => (
                    <span key={m.label} className="inline-flex items-baseline gap-1">
                      <span className="text-panel-muted">{m.label}</span>
                      <span className="tnum font-medium">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-panel-muted leading-relaxed">{t('practiceCard.checkHint')}</p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <Button
            variant="outline"
            className={panelOutline}
            disabled={!card.latest || card.phase !== 'ready' || card.isEvaluating}
            onClick={() => void card.assess()}
          >
            {card.isEvaluating ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <AudioLines className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{card.isEvaluating ? t('shadowing.checking') : t('practiceCard.check')}</span>
          </Button>

          {assessment && (
            <Button variant="ghost" size="sm" className={panelGhost} onClick={() => setShowDetails(true)}>
              {t('practiceCard.details')}
            </Button>
          )}
        </div>
      </div>

      {/* Portalled: the dock is its own stacking layer, and the scrim must cover the whole page. */}
      {showDetails &&
        assessment &&
        createPortal(
          <Sheet onClose={() => setShowDetails(false)} label={t('practiceCard.detailsLabel')}>
            <OverlayHeader
              title={t('practiceCard.detailsTitle')}
              onClose={() => setShowDetails(false)}
              closeLabel={t('common.close')}
            />
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <AssessmentResult assessment={assessment} />
            </div>
          </Sheet>,
          document.body,
        )}
    </>
  );
}
