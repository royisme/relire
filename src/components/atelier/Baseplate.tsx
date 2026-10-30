/**
 * The baseplate: the board of studs the sentence is built on. Placed bricks snap onto it in order and the
 * slots still to fill sit after them as recessed pads. Its foot is a plaque of fixed height (the caller's
 * `children`) that says why a brick is wrong, what fused, or how far the build is, so a message never
 * covers a brick or moves anything. Owns the layout and which motion reaches which brick; the state
 * itself belongs to the round.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoundEvent, Turn } from '../../services/atelier/roundState';
import { Brick, Slot, type BrickFx } from './Brick';
import { play } from './fx';

interface BaseplateProps {
  turn: Turn;
  /** How many bricks the sentence has: the slots left are this minus the bricks placed. */
  size: number;
  event: RoundEvent | null;
  motion: boolean;
  /** Where the brick that just moved was on screen, so it can fly to its place. */
  origin: DOMRect | undefined;
  onRemove: (pieceId: string) => void;
  children?: ReactNode;
}

export function Baseplate({ turn, size, event, motion, origin, onRemove, children }: BaseplateProps) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const placed = turn.placed.map((id) => turn.pieces.find((piece) => piece.id === id)!);
  const flagged = placed.some((piece) => piece.reason);
  const locked = turn.right || turn.pending;

  // A mismatch with no flagged brick shakes the whole row; a flagged brick bounces by itself below.
  useEffect(() => {
    if (event?.kind === 'wrong' && !flagged) play(row.current, 'shake', motion);
    // Only a new event may move the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.n]);

  const fxFor = (pieceId: string, index: number): BrickFx | undefined => {
    if (!event) return undefined;
    const piece = turn.pieces.find((candidate) => candidate.id === pieceId)!;
    if (event.kind === 'snap' && event.pieceId === pieceId) return { n: event.n, kind: 'snap', from: origin };
    if (event.kind === 'reject' && event.pieceId === pieceId) return { n: event.n, kind: 'bounce', from: origin };
    if (event.kind === 'fuse' && event.pieceId === pieceId)
      return {
        n: event.n,
        kind: 'fuse',
        from: origin,
        parts: turn.note?.kind === 'fused' ? turn.note.parts : undefined,
      };
    if (event.kind === 'wrong' && piece.reason) return { n: event.n, kind: 'shake' };
    if (event.kind === 'right' || event.kind === 'reveal') return { n: event.n, kind: 'settle', delay: index * 40 };
    return undefined;
  };

  return (
    <div
      ref={row}
      role="group"
      aria-label={t('atelier.round.row')}
      className="plate flex min-h-[9.5rem] flex-1 flex-col p-3 pb-2"
    >
      <div className="flex-1 pt-1">
        <div className="flex flex-wrap content-start items-start gap-x-2 gap-y-2">
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
          {Array.from({ length: Math.max(0, size - placed.length) }, (_, index) => (
            <Slot key={index} />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
