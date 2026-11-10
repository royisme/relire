/**
 * The motion of the sentence workshop, as Web Animations on one element at a
 * time. Every effect is short and returns to rest. A caller passes `motion`
 * (the effects switch and `prefers-reduced-motion`, combined); when it is
 * false nothing moves at all. CSS motion is stopped separately by the stage.
 */

export type Fx = 'snap' | 'fuse' | 'bounce' | 'shake' | 'settle' | 'reappear' | 'pulse' | 'pop';

export interface FxOptions {
  /** Where the brick was before it moved, so it can fly from there to where it now sits. */
  from?: DOMRect;
  delay?: number;
}

/** Overshoot for a "pop", ease-out for a settle (DESIGN.md, game surface). */
export const POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** The flight from the old place to the new one: a short arc, arriving at `at` (0 to 1) of the animation. */
function flight(dx: number, dy: number, at: number): Keyframe[] {
  return [
    { transform: `translate(${dx}px, ${dy}px)`, offset: 0, easing: 'ease-out' },
    { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px)`, offset: at * 0.5, easing: 'ease-in' },
    { transform: 'translate(0, 0)', offset: at },
  ];
}

/** Pressed onto the baseplate: lands, is squashed flat for a beat, then springs back past rest. */
function snap(dx: number, dy: number, flying: boolean): { frames: Keyframe[]; duration: number } {
  const at = flying ? 0.4 : 0;
  const o = (x: number) => at + (1 - at) * x;
  const tail: Keyframe[] = [
    { transform: 'scale(1.16, 0.8)', offset: o(0.03), easing: 'ease-out' },
    { transform: 'scale(1.1, 0.87)', offset: o(0.3), easing: POP },
    { transform: 'scale(0.96, 1.07)', offset: o(0.65), easing: POP },
    { transform: 'none', offset: 1 },
  ];
  return { frames: flying ? [...flight(dx, dy, at), ...tail] : tail, duration: flying ? 420 : 260 };
}

/** A wrong brick lands, then is thrown back up and sideways, falls, and rattles to rest. */
function bounce(dx: number, dy: number, flying: boolean): { frames: Keyframe[]; duration: number } {
  const at = flying ? 0.3 : 0;
  const o = (x: number) => at + (1 - at) * x;
  const tail: Keyframe[] = [
    { transform: 'scale(1.1, 0.88)', offset: o(0.02), easing: 'ease-out' },
    { transform: 'translate(12px, -30px) rotate(9deg)', offset: o(0.25), easing: 'ease-in' },
    { transform: 'translate(-3px, 0) rotate(-4deg) scale(1.08, 0.9)', offset: o(0.45), easing: 'ease-out' },
    { transform: 'translate(0, -9px) rotate(2deg)', offset: o(0.6), easing: 'ease-in' },
    { transform: 'translateX(-5px)', offset: o(0.72) },
    { transform: 'translateX(4px)', offset: o(0.84) },
    { transform: 'translateX(-2px)', offset: o(0.94) },
    { transform: 'none', offset: 1 },
  ];
  return { frames: flying ? [...flight(dx, dy, at), ...tail] : tail, duration: 640 };
}

const EFFECTS: Record<
  'fuse' | 'shake' | 'settle' | 'reappear' | 'pulse' | 'pop',
  { frames: Keyframe[]; options: KeyframeAnimationOptions }
> = {
  // The welded brick is not there until the two halves meet, then it arrives wide and flat and springs to size.
  fuse: {
    frames: [
      { opacity: 0, transform: 'scale(0.7, 0.7)', offset: 0 },
      { opacity: 0, transform: 'scale(0.7, 0.7)', offset: 0.42 },
      { opacity: 1, transform: 'scale(1.3, 0.78)', offset: 0.5, easing: 'ease-out' },
      { transform: 'scale(0.92, 1.12)', offset: 0.72, easing: POP },
      { opacity: 1, transform: 'none', offset: 1 },
    ],
    options: { duration: 600 },
  },
  // The spare pair returns to the bin after the weld, hidden until the halves have met.
  reappear: {
    frames: [
      { opacity: 0, transform: 'scale(0.8)', offset: 0 },
      { opacity: 0, transform: 'scale(0.8)', offset: 0.6 },
      { opacity: 1, transform: 'scale(1.1, 0.9)', offset: 0.75, easing: 'ease-out' },
      { opacity: 1, transform: 'none', offset: 1 },
    ],
    options: { duration: 600 },
  },
  shake: {
    frames: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)', offset: 0.2 },
      { transform: 'translateX(6px)', offset: 0.45 },
      { transform: 'translateX(-4px)', offset: 0.68 },
      { transform: 'translateX(2px)', offset: 0.85 },
      { transform: 'none' },
    ],
    options: { duration: 280, easing: SETTLE },
  },
  // A brick an arriving or leaving line touches: a small hop.
  pulse: {
    frames: [
      { transform: 'none' },
      { transform: 'translateY(-4px) scale(1.06)', offset: 0.35, easing: POP },
      { transform: 'none' },
    ],
    options: { duration: 300, easing: SETTLE },
  },
  // A label chip arriving on its line: held out of sight until its turn, then pops past full size.
  pop: {
    frames: [
      { opacity: 0, transform: 'scale(0.5)', offset: 0 },
      { opacity: 1, transform: 'scale(1.14)', offset: 0.55, easing: POP },
      { opacity: 1, transform: 'none', offset: 1 },
    ],
    options: { duration: 280, fill: 'backwards' },
  },
  // The finished row, one brick after another, lifts a little and sets down.
  settle: {
    frames: [{ transform: 'none' }, { transform: 'translateY(-6px)', offset: 0.4 }, { transform: 'none' }],
    options: { duration: 260, easing: SETTLE },
  },
};

export function play(element: Element | null, fx: Fx, motion: boolean, { from, delay = 0 }: FxOptions = {}): void {
  if (!motion || !element || typeof element.animate !== 'function') return;
  if (fx === 'snap' || fx === 'bounce') {
    const to = element.getBoundingClientRect();
    const dx = from ? from.left - to.left : 0;
    const dy = from ? from.top - to.top : 0;
    const { frames, duration } = (fx === 'snap' ? snap : bounce)(dx, dy, from !== undefined);
    element.animate(frames, { duration, delay });
    return;
  }
  element.animate(EFFECTS[fx].frames, { ...EFFECTS[fx].options, delay });
}

/** Draws a stroke: its dash offset runs `from` to `to` (a path with `pathLength="1"`), held out of sight until its turn; `keep: false` hides it again at the end (a spark). */
export function sweep(
  path: Element | null,
  {
    from,
    to,
    delay,
    duration,
    easing = 'ease-in-out',
    keep = true,
  }: { from: number; to: number; delay: number; duration: number; easing?: string; keep?: boolean },
): void {
  if (!path || typeof path.animate !== 'function') return;
  path.animate(
    [
      { strokeDashoffset: from, opacity: 1 },
      { strokeDashoffset: to, opacity: keep ? 1 : 0 },
    ],
    { delay, duration, easing, fill: 'both' },
  );
}

/** A terminal landing: it appears small and grows past its size, held out of sight until its turn. */
export function land(element: Element | null, delay: number): void {
  if (!element || typeof element.animate !== 'function') return;
  element.animate(
    [
      { opacity: 0, transform: 'scale(0.2)', offset: 0 },
      { opacity: 1, transform: 'scale(1.5)', offset: 0.5, easing: POP },
      { opacity: 1, transform: 'none', offset: 1 },
    ],
    { delay, duration: 220, fill: 'both' },
  );
}
