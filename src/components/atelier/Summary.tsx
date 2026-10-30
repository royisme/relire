/** The end of a round: one brick per finished sentence (real results only) and the way on. Owns what it shows. */
import { useEffect, useRef } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TurnOutcome } from '../../services/atelier/roundState';
import { Button } from '../ui/button';
import { Hud } from './Hud';

interface SummaryProps {
  summary: { total: number; rightFirstTime: number };
  /** One outcome per sentence the learner finished, in order. */
  pips: TurnOutcome[];
  onAgain: () => void;
  onThemes: () => void;
  onLeave: () => void;
}

const LOOK = {
  first: { hue: 'green', Icon: Check },
  missed: { hue: 'red', Icon: X },
  retried: { hue: 'yellow', Icon: RotateCcw },
} as const;

export function Summary({ summary, pips, onAgain, onThemes, onLeave }: SummaryProps) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  // The round's focused control is gone, so the summary takes focus and announces its counts.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Hud onExit={onLeave} />
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto px-4 pb-4">
        <div>
          <h3 ref={heading} tabIndex={-1} className="font-serif text-3xl font-semibold outline-none">
            {t('atelier.summary.title')}
          </h3>
          <p role="status" className="tnum mt-2 break-words text-lg text-ink-800">
            {summary.total > 0
              ? t('atelier.summary.count', { count: summary.total, right: summary.rightFirstTime })
              : t('atelier.summary.none')}
          </p>
        </div>
        {pips.length > 0 && (
          <div className="plate flex flex-wrap gap-x-2 gap-y-3 p-3" role="list">
            {pips.map((outcome, index) => {
              const { hue, Icon } = LOOK[outcome];
              return (
                <span key={index} role="listitem" data-hue={hue} data-shape="verb" className="brick min-w-12">
                  <span className="brick-studs" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <Icon className="my-2 h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">{t(`atelier.summary.${outcome}`)}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <footer className="flex shrink-0 flex-col gap-2 px-3 pb-3">
        <Button variant="ghost" onClick={onThemes}>
          {t('atelier.summary.themes')}
        </Button>
        <Button className="game-cta" onClick={onAgain}>
          {t('atelier.summary.again')}
        </Button>
      </footer>
    </div>
  );
}
