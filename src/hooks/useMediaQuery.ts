/** Whether a CSS media query currently matches, updating live. Known at first render, so layout never flashes. */
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    () => window.matchMedia(query).matches,
  );
}

/** The app's breakpoints (DESIGN.md): phone below md, tablet from md, desktop from lg. */
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

export function useBreakpoint(): Breakpoint {
  const md = useMediaQuery('(min-width: 768px)');
  const lg = useMediaQuery('(min-width: 1024px)');
  return lg ? 'desktop' : md ? 'tablet' : 'phone';
}
