/**
 * The reader's one fixed bottom area: practice card above the article player.
 * Publishes its measured height as `--dock-height` so the reader can keep the
 * practised or read sentence clear of it. An overlay: never part of page flow.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function BottomDock({ children }: { children: ReactNode }) {
  const dock = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = dock.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--dock-height', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--dock-height');
    };
  }, []);
  return (
    <div
      ref={dock}
      className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none flex flex-col items-center gap-2 [&>*]:w-full [&>*]:max-w-md"
    >
      {children}
    </div>
  );
}

/** Current dock height in px (0 when nothing is docked). */
export const dockHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-height')) || 0;
