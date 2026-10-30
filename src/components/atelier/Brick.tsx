/**
 * One brick of the sentence workshop: a solid toy brick (fill, offset shadow, studs) that is a button on the
 * tray and the baseplate and a plain body in the booklet. The hue and silhouette follow its role
 * (`roles.ts`) and a small label names the role, so colour is never the only cue. The verb brick
 * hangs one port per grammar term under it while it sits on the baseplate and the sentence is still being built. Text is
 * ordinary DOM text. Owns how a brick looks and the motion it plays; which bricks exist and where they sit
 * belongs to the round state.
 */
import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { Brick as BrickData } from '../../types/atelier';
import type { Piece } from '../../services/atelier/roundState';
import { play, type Fx } from './fx';
import { LOOK } from './roles';

export type BrickState = 'rest' | 'flagged' | 'right';

/** Role contraction is the welded brick (au, aux, du, des). */
const isFused = (brick: BrickData) => brick.role === 'contraction';
const studCount = (brick: BrickData) => (isFused(brick) ? 4 : brick.text.length > 5 ? 3 : 2);

/** What a brick looks like, with its socket notches when it is the verb on the baseplate or in the booklet. */
export function BrickBody({
  brick,
  state = 'rest',
  sockets,
  fill,
}: {
  brick: BrickData;
  state?: BrickState;
  sockets?: Piece['sockets'];
  /** Stretch to the parent's width (the halves of a fusion). */
  fill?: boolean;
}) {
  const { t } = useTranslation();
  const { hue, shape } = LOOK[brick.role];
  return (
    <span className={cn('inline-flex flex-col items-center', fill && 'w-full')}>
      <span
        data-hue={hue}
        data-shape={shape}
        data-state={state === 'rest' ? undefined : state}
        data-fused={isFused(brick) ? '' : undefined}
        data-half={fill ? '' : undefined}
        className={cn('brick', fill && 'w-full min-w-0 px-1')}
      >
        <span className="brick-studs" aria-hidden="true">
          {Array.from({ length: studCount(brick) }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className="brick-role">{t(`atelier.roles.${brick.role}`)}</span>
        <span lang="fr" className="brick-word">
          {brick.text}
        </span>
      </span>
      {sockets && sockets.length > 0 && (
        <span data-hue="blue" className="mt-1 flex gap-2.5 px-2">
          {sockets.map(({ relation, label }) => (
            <span key={label} className="flex flex-col items-center">
              <span className="brick-socket" aria-hidden="true" />
              <span className="text-xs leading-4 text-ink-900">{t(`atelier.relations.${relation}`)}</span>
              <span className="text-[10px] leading-3 text-ink-600">{label}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** The recessed pad where a brick is still to go: a pattern of stud holes no brick wears. */
export function Slot() {
  return (
    <span className="slot" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

export interface BrickFx {
  /** The round event's counter, so the same effect twice in a row still plays twice. */
  n: number;
  kind: Fx;
  delay?: number;
  /** Where the brick came from on screen, for the flight. */
  from?: DOMRect;
  /** The two words a fusion welds, for the halves that slide together. */
  parts?: [string, string];
}

/** The two halves of a fusion slide into the welded brick's footprint, then a ring marks the weld. */
function FuseHalves({ parts, from, onDone }: { parts: [string, string]; from?: DOMRect; onDone: () => void }) {
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const meet = 0.42;
    const duration = 600;
    left.current?.animate(
      [
        { transform: 'translateX(-6px)', opacity: 1, offset: 0 },
        { transform: 'translateX(0)', opacity: 1, offset: meet, easing: 'ease-in' },
        { opacity: 0, offset: meet + 0.06 },
        { opacity: 0, offset: 1 },
      ],
      { duration, fill: 'forwards' },
    );
    const target = right.current!.getBoundingClientRect();
    const dx = from ? from.left - target.left : 22;
    const dy = from ? from.top - target.top : 0;
    const slide = right.current!.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 0, easing: 'ease-out' },
        {
          transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px)`,
          opacity: 1,
          offset: meet * 0.5,
          easing: 'ease-in',
        },
        { transform: 'translate(0, 0)', opacity: 1, offset: meet },
        { opacity: 0, offset: meet + 0.06 },
        { opacity: 0, offset: 1 },
      ],
      { duration, fill: 'forwards' },
    );
    ring.current?.animate(
      [
        { transform: 'scale(1)', opacity: 0, offset: 0 },
        { transform: 'scale(1)', opacity: 0, offset: 0.4 },
        { transform: 'scale(1)', opacity: 0.9, offset: 0.5, easing: 'ease-out' },
        { transform: 'scale(1.3, 1.6)', opacity: 0, offset: 1 },
      ],
      { duration },
    );
    void slide.finished.then(onDone, () => undefined);
    // The halves belong to one fusion event; they mount for it and are removed when it ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span ref={left} className="absolute top-0 left-0 w-1/2">
        <BrickBody brick={{ text: parts[0], role: 'preposition' }} fill />
      </span>
      <span ref={right} className="absolute top-0 right-0 w-1/2">
        <BrickBody brick={{ text: parts[1], role: 'determiner' }} fill />
      </span>
      <span ref={ring} className="weld-ring absolute inset-x-0 top-1.5 bottom-1 opacity-0" />
    </span>
  );
}

interface BrickProps {
  piece: Piece;
  /** The bin's brick is placed; the baseplate's brick is taken back. */
  mode: 'tray' | 'row';
  state?: BrickState;
  fx?: BrickFx;
  /** The brick's index in the sentence, so the wiring can find it; a brick that is not part of the sentence has none. */
  wire?: number;
  /** The sentence is wired: the verb's empty ports give way to the links drawn between the bricks. */
  wired?: boolean;
  /** Whether motion may play: the effects switch combined with reduced motion. */
  motion: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export const Brick = forwardRef<HTMLButtonElement, BrickProps>(function Brick(
  { piece, mode, state = 'rest', fx, wire, wired, motion, disabled, onPress },
  ref,
) {
  const { t } = useTranslation();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [halvesDone, setHalvesDone] = useState(0);
  useLayoutEffect(() => {
    if (fx) play(wrapper.current, fx.kind, motion, { from: fx.from, delay: fx.delay });
    // The effect belongs to one event; a re-render with the same event must not play it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx?.n, fx?.kind]);
  const halves = fx?.kind === 'fuse' && fx.parts && motion && halvesDone !== fx.n;
  return (
    <span className="relative inline-flex" data-wire-brick={wire}>
      <span ref={wrapper} className="inline-flex origin-bottom flex-col items-center">
        <button
          ref={ref}
          type="button"
          data-brick={piece.id}
          aria-disabled={disabled || undefined}
          aria-label={t(mode === 'tray' ? 'atelier.round.place' : 'atelier.round.take', { text: piece.brick.text })}
          onClick={() => {
            if (!disabled) onPress();
          }}
          className={cn(
            'brick-btn flex flex-col items-center bg-transparent p-0',
            disabled ? 'cursor-default' : 'cursor-pointer',
          )}
        >
          <BrickBody brick={piece.brick} state={state} sockets={mode === 'row' && !wired ? piece.sockets : undefined} />
        </button>
      </span>
      {halves && fx.parts && <FuseHalves parts={fx.parts} from={fx.from} onDone={() => setHalvesDone(fx.n)} />}
    </span>
  );
});
