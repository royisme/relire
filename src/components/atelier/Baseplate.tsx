/**
 * The baseplate: the board of studs the sentence is built on. Placed bricks snap onto it in order and the
 * slots still to fill sit after them as recessed pads. Its foot is a plaque of fixed height (the caller's
 * `children`) that says why a brick is wrong, what fused, or how far the build is, so a message never
 * covers a brick or moves anything. Also owns `Wired`, the row of bricks with its connections drawn over
 * it (the right answer here, the booklet's diagram there): the rows make room for the wiring, every link
 * becomes a rail with a label, and the lines draw one after another. Owns the layout and which motion
 * reaches which brick; the state itself belongs to the round, and the routing to `services/atelier/links`.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { LANE, LIGHT, lightingPlan, routeLinks, type Box, type Wire } from '../../services/atelier/links';
import type { RoundEvent, Turn } from '../../services/atelier/roundState';
import type { Link } from '../../types/atelier';
import { Brick, Slot, type BrickFx } from './Brick';
import { land, play, sweep } from './fx';

/** Where an element sits in `root`, from layout alone, so a brick caught mid-flight does not skew the lines. */
function offsetIn(element: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

const FACE = '.brick';

/** The lines draw from their heads, each with its label, the bricks hopping as a line leaves or lands. */
function lightUp(root: HTMLElement, count: number) {
  const plan = lightingPlan(count);
  const face = (index: number) => root.querySelector<HTMLElement>(`[data-wire-brick="${index}"] ${FACE}`);
  root.querySelectorAll<SVGGElement>('[data-wire]').forEach((group) => {
    const i = Number(group.dataset.wire);
    const leave = plan.leave(i);
    const arrive = plan.arrive(i);
    const part = (name: string) => group.querySelector(`[data-part="${name}"]`);
    sweep(part('main'), { from: 1, to: 0, delay: leave, duration: LIGHT.draw });
    sweep(part('drops'), { from: 1, to: 0, delay: leave + LIGHT.draw * 0.5, duration: LIGHT.draw * 0.5 });
    sweep(group.querySelector('.wire-pulse'), {
      from: 0.09,
      to: -1,
      delay: leave,
      duration: LIGHT.draw,
      easing: 'ease-in',
      keep: false,
    });
    group.querySelectorAll('[data-end]').forEach((end, n) => land(end, n === 0 ? leave : arrive - 60));
    play(root.querySelector(`[data-wire-chip="${i}"]`), 'pop', true, { delay: leave + LIGHT.draw * 0.45 });
    const bricks = group.dataset.bricks?.split(',').map(Number) ?? [];
    bricks.forEach((brick, n) => play(face(brick), 'pulse', true, { delay: n === 0 ? leave : arrive - 40 }));
  });
}

interface WiredProps {
  /** The connections to draw; undefined leaves the row bare, as during the build. */
  links: Link[] | undefined;
  /** A new value plays the lighting sequence once; undefined draws the finished wiring at once. */
  playKey?: string;
  className?: string;
  /** The bricks: each wrapper carries `data-wire-brick` with its index in the sentence. */
  children: ReactNode;
}

export function Wired({ links, playKey, className, children }: WiredProps) {
  const root = useRef<HTMLDivElement>(null);
  const played = useRef<string | undefined>(undefined);
  const uid = useId();
  const [wires, setWires] = useState<Wire[]>([]);

  useLayoutEffect(() => {
    const element = root.current!;
    const bricks = [...element.querySelectorAll<HTMLElement>('[data-wire-brick]')];
    const indexOf = (brick: HTMLElement) => Number(brick.dataset.wireBrick);
    const measure = (): Box[] => {
      const boxes: Box[] = [];
      for (const brick of bricks) {
        const face = brick.querySelector<HTMLElement>(FACE)!;
        boxes[indexOf(brick)] = { ...offsetIn(face, element), w: face.offsetWidth, h: face.offsetHeight };
      }
      return boxes;
    };
    // The rows make room above themselves for the lanes the links need, then the lines are routed over the result.
    const lay = (flip: boolean) => {
      for (const brick of bricks) brick.style.paddingTop = '';
      if (!links) return setWires([]);
      const before = measure();
      const { levels, rowOf } = routeLinks(before, links);
      for (const brick of bricks) {
        const lanes = levels[rowOf[indexOf(brick)]];
        brick.style.paddingTop = lanes ? `${lanes * LANE}px` : '';
      }
      const after = measure();
      // The bricks slide to their new places instead of jumping (the separate `translate` property leaves the effects alone).
      if (flip)
        for (const brick of bricks) {
          const dy = before[indexOf(brick)].y - after[indexOf(brick)].y;
          if (dy !== 0)
            brick.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], {
              duration: LIGHT.base - 40,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            });
        }
      const next = routeLinks(after, links).wires;
      setWires((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    lay(links !== undefined && playKey !== undefined && playKey !== played.current);
    if (!links) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      lay(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [links, playKey]);

  // The wires exist in the DOM now; play the lighting before the first paint so the finished lines never flash.
  useLayoutEffect(() => {
    if (!links || playKey === undefined || playKey === played.current || wires.length === 0) return;
    played.current = playKey;
    lightUp(root.current!, links.length);
  }, [wires, links, playKey]);

  return (
    <div ref={root} className={cn('relative', className)}>
      {children}
      {links && (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {wires.map((wire) => {
              const link = links[wire.index];
              const mask = `${uid}-${wire.index}`;
              return (
                <g key={wire.index} data-wire={wire.index} data-bricks={[link.head, ...link.dependents].join(',')}>
                  <mask id={mask} maskUnits="userSpaceOnUse" x="-200" y="-200" width="4000" height="4000">
                    <path d={wire.main} pathLength={1} className="wire-mask" data-part="main" />
                    {wire.drops && <path d={wire.drops} pathLength={1} className="wire-mask" data-part="drops" />}
                  </mask>
                  <g mask={`url(#${mask})`}>
                    <path d={`${wire.main} ${wire.drops}`} className="wire-line" data-relation={link.relation} />
                  </g>
                  <path d={wire.main} pathLength={1} className="wire-pulse" />
                  {wire.ends.map((end) => (
                    <circle
                      key={`${end.x}-${end.y}`}
                      cx={end.x}
                      cy={end.y}
                      r={end.head ? 4.5 : 3.5}
                      className="wire-end"
                      data-end={end.head ? 'head' : 'dependent'}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          {wires.map((wire) => (
            <span
              key={wire.index}
              data-wire-chip={wire.index}
              className="wire-chip"
              style={{ left: wire.chip.x, top: wire.chip.y }}
            >
              {links[wire.index].label}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

interface BaseplateProps {
  turn: Turn;
  /** How many bricks the sentence has: the slots left are this minus the bricks placed. */
  size: number;
  /** The sentence's connections, drawn once the row is right (or shown). */
  links: Link[];
  event: RoundEvent | null;
  motion: boolean;
  /** Where the brick that just moved was on screen, so it can fly to its place. */
  origin: DOMRect | undefined;
  onRemove: (pieceId: string) => void;
  children?: ReactNode;
}

export function Baseplate({ turn, size, links, event, motion, origin, onRemove, children }: BaseplateProps) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const placed = turn.placed.map((id) => turn.pieces.find((piece) => piece.id === id)!);
  const flagged = placed.some((piece) => piece.reason);
  const locked = turn.right || turn.pending;
  // A right answer lights up; a revealed one only shows its wiring, so nothing celebrates a miss.
  const lights = motion && turn.right && !turn.revealed;
  const settleAt = lights ? lightingPlan(links.length).total : 0;

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
    // The row sets down after its last line has landed.
    if (event.kind === 'right') return { n: event.n, kind: 'settle', delay: settleAt + index * 40 };
    if (event.kind === 'reveal') return { n: event.n, kind: 'settle', delay: index * 40 };
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
        <Wired
          links={turn.right ? links : undefined}
          playKey={lights ? `${turn.itemIndex}-${turn.retry}` : undefined}
          className="flex flex-wrap content-start items-start gap-x-1.5 gap-y-2"
        >
          {placed.map((piece, index) => (
            <Brick
              key={piece.id}
              piece={piece}
              mode="row"
              state={turn.right ? 'right' : piece.reason ? 'flagged' : 'rest'}
              fx={fxFor(piece.id, index)}
              wire={piece.origin ?? undefined}
              wired={turn.right}
              motion={motion}
              disabled={locked}
              onPress={() => onRemove(piece.id)}
            />
          ))}
          {Array.from({ length: Math.max(0, size - placed.length) }, (_, index) => (
            <Slot key={index} />
          ))}
        </Wired>
      </div>
      {children}
    </div>
  );
}
