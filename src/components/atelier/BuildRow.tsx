/**
 * The two places bricks live: the row the sentence is built on and the tray
 * the bricks come from. The row reserves the height the finished sentence
 * needs, and a placed brick leaves an empty slot on the tray, so neither moves
 * while the learner taps. Owns the layout and which motion reaches which brick;
 * the state itself belongs to the round.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoundEvent, Turn } from '../../services/atelier/roundState';
import { Brick, BrickFace, BrickSlot, type BrickFx } from './Brick';
import { play } from './fx';

interface BuildRowProps {
  turn: Turn;
  event: RoundEvent | null;
  motion: boolean;
  /** The checked row is locked once it is right. */
  onRemove: (pieceId: string) => void;
}

export function BuildRow({ turn, event, motion, onRemove }: BuildRowProps) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const placed = turn.placed.map((id) => turn.pieces.find((piece) => piece.id === id)!);
  const flagged = placed.some((piece) => piece.reason);
  const locked = turn.right || turn.pending;

  // A mismatch with no flagged brick shakes the whole row; a flagged brick shakes by itself below.
  useEffect(() => {
    if (event?.kind === 'wrong' && !flagged) play(row.current, 'shake', motion);
    // Only a new event may move the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.n]);

  const fxFor = (pieceId: string, index: number): BrickFx | undefined => {
    if (!event) return undefined;
    if ((event.kind === 'snap' || event.kind === 'fuse') && event.pieceId === pieceId)
      return { n: event.n, kind: event.kind };
    if (event.kind === 'wrong' && turn.pieces.find((piece) => piece.id === pieceId)!.reason)
      return { n: event.n, kind: 'shake' };
    if (event.kind === 'right') return { n: event.n, kind: 'settle', delay: index * 35 };
    return undefined;
  };

  return (
    <div ref={row} role="group" aria-label={t('atelier.round.row')} className="border-b-2 border-ink-300 pb-3">
      <div className="grid">
        <div aria-hidden="true" className="invisible col-start-1 row-start-1 flex flex-wrap items-start gap-2">
          {turn.pieces
            .filter((piece) => piece.origin !== null)
            .sort((a, b) => a.origin! - b.origin!)
            .map((piece) => (
              <span key={piece.id} className="inline-flex flex-col items-start">
                <BrickFace piece={piece} />
              </span>
            ))}
        </div>
        <div className="col-start-1 row-start-1 flex flex-wrap content-start items-start gap-2">
          {placed.length === 0 && (
            <p className="flex min-h-12 items-center text-sm text-ink-500">{t('atelier.round.rowEmpty')}</p>
          )}
          {placed.map((piece, index) => (
            <Brick
              key={piece.id}
              piece={piece}
              mode="row"
              state={turn.right ? 'right' : piece.reason ? 'flagged' : 'rest'}
              fx={fxFor(piece.id, index)}
              motion={motion}
              disabled={locked}
              onPress={() => onRemove(piece.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TrayProps {
  turn: Turn;
  motion: boolean;
  disabled: boolean;
  register: (pieceId: string, element: HTMLButtonElement | null) => void;
  onPlace: (pieceId: string) => void;
}

export function Tray({ turn, motion, disabled, register, onPlace }: TrayProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('atelier.round.tray')} className="flex flex-wrap items-start gap-2">
      {turn.pieces.map((piece) =>
        turn.placed.includes(piece.id) ? (
          <BrickSlot key={piece.id} piece={piece} />
        ) : (
          <Brick
            key={piece.id}
            ref={(element) => register(piece.id, element)}
            piece={piece}
            mode="tray"
            motion={motion}
            disabled={disabled}
            onPress={() => onPlace(piece.id)}
          />
        ),
      )}
    </div>
  );
}
