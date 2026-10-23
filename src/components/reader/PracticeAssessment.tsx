/** The expanded card's Check and reserved result slot; adapts the shared result to neutral ink-panel tokens. */
import type { CSSProperties } from 'react';
import { AudioLines, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PracticeCardController } from '../../hooks/usePracticeCard';
import { AssessmentResult } from '../shadowing/AssessmentResult';
import { Button } from '../ui/button';
import { panelOutline } from './panel';

// The shared result stays unchanged for Speaking; the card has no pass/fail colours.
const resultTokens = {
  '--color-ink-50': 'var(--color-panel)',
  '--color-surface': 'var(--color-panel-raised)',
  '--color-ink-200': 'var(--color-panel-line)',
  '--color-ink-500': 'var(--color-panel-muted)',
  '--color-ink-600': 'var(--color-panel-muted)',
  '--color-ink-700': 'var(--color-panel-ink)',
  '--color-ink-800': 'var(--color-panel-ink)',
  '--color-ink-900': 'var(--color-panel-ink)',
  '--color-ok-800': 'var(--color-panel-muted)',
  '--color-bad-700': 'var(--color-panel-muted)',
} as CSSProperties;

export function PracticeAssessment({ card }: { card: PracticeCardController }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-panel-line px-4 py-2">
      <Button
        variant="outline"
        className={`${panelOutline} w-52`}
        disabled={!card.latest || card.phase !== 'ready' || card.isEvaluating}
        onClick={() => void card.assess()}
      >
        {card.isEvaluating ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <AudioLines className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{card.isEvaluating ? t('shadowing.checking') : t('shadowing.check')}</span>
      </Button>
      <div
        aria-live="polite"
        aria-busy={card.isEvaluating}
        className="h-40 overflow-y-auto break-words pt-3 [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:rounded-none"
        style={resultTokens}
      >
        {card.assessmentError ? (
          <p role="alert" className="text-xs text-panel-bad-ink">
            {t('shadowing.assessError')} {card.assessmentError}
          </p>
        ) : card.assessment ? (
          <AssessmentResult assessment={card.assessment} />
        ) : null}
      </div>
    </div>
  );
}
