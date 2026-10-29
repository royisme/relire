/**
 * The motion of the sentence workshop, as Web Animations on one element at a
 * time. Every effect is short and returns to rest. A caller passes `motion`
 * (the effects switch and `prefers-reduced-motion`, combined); when it is
 * false nothing moves at all.
 */

export type Fx = 'snap' | 'fuse' | 'shake' | 'settle';

/** Overshoot for a "pop", ease-out for a settle (DESIGN.md, game surface). */
const POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const EFFECTS: Record<Fx, { frames: Keyframe[]; options: KeyframeAnimationOptions }> = {
  // A brick pressed into the row: squashed on arrival, springs back past rest.
  snap: {
    frames: [
      { transform: 'scale(1.14, 0.84)' },
      { transform: 'scale(0.97, 1.05)', offset: 0.55 },
      { transform: 'none' },
    ],
    options: { duration: 200, easing: POP },
  },
  // Two bricks becoming one: the new brick starts as wide as both and squeezes to its size.
  fuse: {
    frames: [{ transform: 'scale(1.7, 0.78)' }, { transform: 'scale(0.9, 1.12)', offset: 0.5 }, { transform: 'none' }],
    options: { duration: 380, easing: POP },
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
  // The finished row, one brick after another, lifts a little and sets down.
  settle: {
    frames: [{ transform: 'none' }, { transform: 'translateY(-5px)', offset: 0.4 }, { transform: 'none' }],
    options: { duration: 240, easing: SETTLE },
  },
};

export function play(element: Element | null, fx: Fx, motion: boolean, delay = 0): void {
  if (!motion || !element || typeof element.animate !== 'function') return;
  element.animate(EFFECTS[fx].frames, { ...EFFECTS[fx].options, delay });
}
