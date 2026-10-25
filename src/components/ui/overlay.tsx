import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { cn } from '../../lib/utils';
import { Dialog, DialogContent } from './dialog';

interface OverlayProps {
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}

function useEscape(onClose: () => void, dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== dialog.current) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dialog]);
}

let scrollLocks = 0;
let pageOverflow = '';
let pageGutter = '';

function lockPageScroll() {
  if (scrollLocks === 0) {
    pageOverflow = document.body.style.overflow;
    pageGutter = document.documentElement.style.scrollbarGutter;
    if (window.innerWidth > document.documentElement.clientWidth)
      document.documentElement.style.scrollbarGutter = 'stable';
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) {
      document.body.style.overflow = pageOverflow;
      document.documentElement.style.scrollbarGutter = pageGutter;
    }
  };
}

function usePanelFocus(dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = dialog.current!;
    const opener = document.activeElement;
    const unlock = lockPageScroll();
    panel.focus({ preventScroll: true });
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
      ).filter(
        (element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;
      if (!focusable.some((element) => element === active) || (e.shiftKey ? active === first : active === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus({ preventScroll: true });
        if (!first) panel.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      unlock();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [dialog]);
}

/**
 * Sheet: contextual lookups (word, sentence). Side panel on md+, bottom sheet on phones.
 * The scrim is light so the article stays legible behind it.
 */
export function Sheet({ onClose, label, className, children }: OverlayProps) {
  const dialog = useRef<HTMLElement>(null);
  useEscape(onClose, dialog);
  usePanelFocus(dialog);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-scrim/25 anim-fade"
      onClick={onClose}
    >
      <aside
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'anim-sheet flex flex-col bg-surface border-ink-200 shadow-lg w-full max-h-[88vh] rounded-t-lg border-t',
          'md:max-h-none md:h-full md:max-w-lg md:rounded-none md:border-t-0 md:border-l',
          className,
        )}
      >
        {children}
      </aside>
    </div>
  );
}

/** Drawer: navigation on small screens. Slides in from the left. */
export function Drawer({ onClose, label, className, children }: OverlayProps) {
  const dialog = useRef<HTMLElement>(null);
  useEscape(onClose, dialog);
  usePanelFocus(dialog);
  return (
    <div className="fixed inset-0 z-50 bg-scrim/30 anim-fade" onClick={onClose}>
      <aside
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn('h-full w-72 max-w-[85vw] bg-surface border-r border-ink-200 shadow-lg flex flex-col', className)}
      >
        {children}
      </aside>
    </div>
  );
}

/** Dialog: tasks that need focus (settings, import, install). */
function OverlayDialog({ onClose, label, className, children }: OverlayProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={cn('anim-fade m-auto max-h-none overflow-hidden p-0', className)}
      >
        {children}
      </DialogContent>
    </Dialog.Root>
  );
}

export { OverlayDialog as Dialog };

/** Shared header for Sheet and Dialog. */
export function OverlayHeader({
  title,
  subtitle,
  onClose,
  closeLabel,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-200 shrink-0">
      <div className="min-w-0">
        <h3 className="font-serif text-lg font-semibold text-ink-900 leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {children}
        <button
          onClick={onClose}
          aria-label={closeLabel}
          className="h-10 w-10 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
