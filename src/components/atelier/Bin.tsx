/**
 * The bin: where the bricks wait, in the thumb zone and at a fixed height until the sentence is right, when it closes and hands its room to the lit sentence. A brick that was taken leaves
 * nothing visible behind (the others stay where they are), and one that is taken back flies home to its
 * own place. Owns the layout of the bin only; the state belongs to the round.
 */
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { RoundEvent, Turn } from '../../services/atelier/roundState';
import { Brick, BrickBody, type BrickFx } from './Brick';

interface BinProps {
  turn: Turn;
  event: RoundEvent | null;
  motion: boolean;
  disabled: boolean;
  /** The sentence is right: the bin has done its work and gives its room to the lit sentence. */
  closed: boolean;
  /** Where the brick that just moved was on screen, so a returning brick can fly home. */
  origin: DOMRect | undefined;
  register: (pieceId: string, element: HTMLButtonElement | null) => void;
  onPlace: (pieceId: string) => void;
}

export function Bin({ turn, event, motion, disabled, closed, origin, register, onPlace }: BinProps) {
  const { t } = useTranslation();
  // A fusion hands its two words back to the bin once the weld is made.
  const welded =
    event?.kind === 'fuse' && turn.note?.kind === 'fused' ? turn.note.parts.map((part) => part.toLowerCase()) : [];
  return (
    <div
      role="group"
      aria-label={t('atelier.round.tray')}
      inert={closed}
      className={cn(
        'bin flex shrink-0 flex-wrap content-start items-start gap-x-1.5 gap-y-2 overflow-y-auto transition-[height,padding,opacity] duration-300',
        closed ? 'h-0 p-0 opacity-0' : 'h-[12rem] p-3 pt-4',
      )}
    >
      {turn.pieces.map((piece) => {
        if (turn.placed.includes(piece.id))
          return (
            <span key={piece.id} aria-hidden="true" className="invisible">
              <BrickBody brick={piece.brick} />
            </span>
          );
        const fx: BrickFx | undefined =
          event?.kind === 'remove' && event.pieceId === piece.id
            ? { n: event.n, kind: 'snap', from: origin }
            : event && welded.includes(piece.brick.text.toLowerCase())
              ? { n: event.n, kind: 'reappear' }
              : undefined;
        return (
          <Brick
            key={piece.id}
            ref={(element) => register(piece.id, element)}
            piece={piece}
            mode="tray"
            fx={fx}
            motion={motion}
            disabled={disabled}
            onPress={() => onPlace(piece.id)}
          />
        );
      })}
    </div>
  );
}
