/**
 * The breakdown as an instruction-booklet page that rises from the bottom once a sentence is right (or
 * shown): the sentence as a connection diagram (its bricks, laid out for the lines drawn between them), then,
 * under a label that says it is AI analysis, what each connection is and the item's explanation. Owns its
 * own focus and Escape; the round decides when it is open, and what Next does.
 */
import { useEffect, useRef } from 'react';
import { Check, Eye, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AtelierItem } from '../../types/atelier';
import { rowText, type Turn } from '../../services/atelier/roundState';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { BrickBody } from './Brick';
import { Wired } from './Baseplate';

interface BookletProps {
  item: AtelierItem;
  turn: Turn;
  language: 'zh' | 'en';
  lastTurn: boolean;
  onClose: () => void;
  onNext: () => void;
}

export function Booklet({ item, turn, language, lastTurn, onClose, onNext }: BookletProps) {
  const { t } = useTranslation();
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-scrim/60" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('atelier.breakdown.frame')}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onClose();
        }}
        className="atelier-sheet ticket flex max-h-[88%] w-full max-w-[40rem] flex-col rounded-b-none rounded-t-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3">
          <p className="flex items-center gap-1.5 font-semibold">
            {turn.revealed ? (
              <Eye className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {turn.revealed ? t('atelier.round.answer') : t('atelier.round.right')}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
            {t('atelier.round.close')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-3">
          {turn.revealed && <p className="mb-3 text-sm">{t('atelier.round.revealed')}</p>}
          <h4 className="font-serif text-lg font-semibold">{t('atelier.breakdown.frame')}</h4>
          <Wired links={item.links} className="mt-2 flex flex-wrap content-start items-start gap-x-1.5 gap-y-2 pb-2">
            {item.bricks.map((brick, index) => (
              <span key={index} data-wire-brick={index} className="inline-flex">
                <BrickBody brick={brick} />
              </span>
            ))}
          </Wired>
          <h4 className="mt-4 text-xs text-ink-600">{t('atelier.breakdown.analysis')}</h4>
          <ol className="mt-1 divide-y divide-dashed divide-ink-400 border-y border-dashed border-ink-400">
            {item.links.map((link, index) => (
              <li key={index} className="flex gap-3 py-2.5">
                <svg viewBox="0 0 32 8" className="mt-1.5 h-2 w-8 shrink-0" aria-hidden="true">
                  <path d="M3 4H29" className="wire-line" data-relation={link.relation} />
                </svg>
                <div className="min-w-0">
                  <p className="break-words text-sm">
                    <span className="font-semibold">{link.label}</span>
                    <span className="text-ink-600"> · {t(`atelier.relations.${link.relation}`)}</span>
                  </p>
                  <p className="mt-0.5 break-words text-sm">{link.note[language]}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 break-words text-sm">{item.explanation[language]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 px-4 pt-1 pb-4">
          <SpeakButton
            text={rowText(turn)}
            variant="outline"
            showLabel
            label={t('atelier.round.listen')}
            stopLabel={t('atelier.round.stop')}
          />
          <Button ref={next} className="game-cta flex-1" onClick={onNext}>
            {t(lastTurn ? 'atelier.round.results' : 'atelier.round.next')}
          </Button>
        </div>
      </section>
    </div>
  );
}
