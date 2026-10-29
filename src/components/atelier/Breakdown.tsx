/**
 * What the learner sees once a sentence is right: the frame's verb with its
 * sockets and the bricks that fill each one, then the item's explanation under
 * a label that says it is AI analysis. Reads the item and the turn's pieces;
 * owns no state and no speech (the Listen button sits with the round's actions).
 */
import { useTranslation } from 'react-i18next';
import type { AtelierItem } from '../../types/atelier';
import type { Turn } from '../../services/atelier/roundState';
import { BrickFace } from './Brick';

export function Breakdown({ item, turn, language }: { item: AtelierItem; turn: Turn; language: 'zh' | 'en' }) {
  const { t } = useTranslation();
  const bricks = (index: number) => turn.pieces.find((piece) => piece.origin === index)!;
  const { verb, sockets } = item.frame;
  return (
    <section className="space-y-5" aria-label={t('atelier.breakdown.frame')}>
      <div>
        <h4 className="font-serif text-base font-semibold text-ink-900">{t('atelier.breakdown.frame')}</h4>
        <div className="mt-3 inline-flex flex-col items-start">
          <BrickFace piece={bricks(verb)} />
        </div>
        {sockets.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">{t('atelier.breakdown.nothing')}</p>
        ) : (
          <dl className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
            {sockets.map((socket) => (
              <div key={socket.label} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <dt className="min-w-20 break-words text-sm font-medium text-ink-800">{socket.label}</dt>
                <dd className="flex flex-wrap items-start gap-2">
                  {socket.filledBy.map((index) => (
                    <span key={index} className="inline-flex flex-col items-start">
                      <BrickFace piece={bricks(index)} />
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div>
        <h4 className="text-xs text-ink-500">{t('atelier.breakdown.analysis')}</h4>
        <p className="mt-1 break-words text-sm text-ink-800">{item.explanation[language]}</p>
      </div>
    </section>
  );
}
