/**
 * The breakdown as an instruction-booklet page that rises from the bottom once a sentence is right (or
 * shown): the verb with its ports and the bricks that fill each one, then the item's explanation
 * under a label that says it is AI analysis. Owns its own focus and Escape; the round decides when it is
 * open, and what Next does.
 */
import { useEffect, useRef } from 'react';
import { Check, Eye, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AtelierItem } from '../../types/atelier';
import { rowText, type Turn } from '../../services/atelier/roundState';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { BrickBody } from './Brick';

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
  const bricks = (index: number) => turn.pieces.find((piece) => piece.origin === index)!.brick;
  // The verb brick is the first verb or auxiliary; its ports are the links that say what it takes.
  const verb = item.bricks.findIndex((brick) => brick.role === 'verb' || brick.role === 'auxiliary');
  const sockets = item.links
    .filter((link) => link.head === verb && (link.relation === 'object' || link.relation === 'complement'))
    .map((link) => ({ label: link.label, filledBy: link.dependents }));
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
          <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-3">
            <BrickBody brick={bricks(verb)} sockets={sockets.map((socket) => socket.label)} />
          </div>
          {sockets.length === 0 ? (
            <p className="mt-3 text-sm text-ink-600">{t('atelier.breakdown.nothing')}</p>
          ) : (
            <dl className="mt-3 divide-y divide-dashed divide-ink-400 border-y border-dashed border-ink-400">
              {sockets.map((socket) => (
                <div key={socket.label} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
                  <dt className="min-w-20 break-words text-sm font-semibold">{socket.label}</dt>
                  <dd className="flex flex-wrap items-start gap-x-2 gap-y-2">
                    {socket.filledBy.map((index) => (
                      <BrickBody key={index} brick={bricks(index)} />
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <h4 className="mt-4 text-xs text-ink-600">{t('atelier.breakdown.analysis')}</h4>
          <p className="mt-1 break-words text-sm">{item.explanation[language]}</p>
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
