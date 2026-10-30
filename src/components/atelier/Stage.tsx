/**
 * The workshop's full-bleed stage: a fixed layer over the whole app (header, sidebar and tabs included) that
 * holds the picker, the round and the summary. The page under it is made inert and cannot scroll, so the
 * stage is the only thing a learner or a screen reader reaches. Owns the layer, the one motion switch and
 * the game's palette wrapper; what is inside belongs to the screens.
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useGameSwitches } from '../../utils/gameCues';

/** Whether motion may play: the Effects switch combined with `prefers-reduced-motion`. */
export function useMotion(): boolean {
  const { effects } = useGameSwitches();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  return effects && !reduced;
}

export function Stage({ children }: { children: ReactNode }) {
  const motion = useMotion();
  useEffect(() => {
    const root = document.getElementById('root');
    const html = document.documentElement;
    const overflow = html.style.overflow;
    root?.setAttribute('inert', '');
    html.style.overflow = 'hidden';
    return () => {
      root?.removeAttribute('inert');
      html.style.overflow = overflow;
    };
  }, []);
  return createPortal(
    <div
      className="atelier-stage fixed inset-0 z-40 flex items-center justify-center overflow-hidden font-sans"
      data-motion={motion ? 'on' : 'off'}
    >
      <div className="flex h-full max-h-[58rem] w-full max-w-[40rem] flex-col pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>,
    document.body,
  );
}
