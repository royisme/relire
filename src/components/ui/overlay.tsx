import * as React from 'react';
import { cn } from '../../lib/utils';

interface OverlayProps {
  onClose: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}

function useEscape(onClose: () => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * Sheet: contextual lookups (word, sentence). Side panel on md+, bottom sheet on phones.
 * The scrim is light so the article stays legible behind it.
 */
export function Sheet({ onClose, label, className, children }: OverlayProps) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-ink-950/25 anim-fade" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'anim-sheet flex flex-col bg-white border-ink-200 shadow-lg w-full max-h-[88vh] rounded-t-lg border-t',
          'md:max-h-none md:h-full md:max-w-lg md:rounded-none md:border-t-0 md:border-l',
          className
        )}
      >
        {children}
      </aside>
    </div>
  );
}

/** Drawer: navigation on small screens. Slides in from the left. */
export function Drawer({ onClose, label, className, children }: OverlayProps) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 bg-ink-950/30 anim-fade" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn('h-full w-72 max-w-[85vw] bg-white border-r border-ink-200 shadow-lg flex flex-col', className)}
      >
        {children}
      </aside>
    </div>
  );
}

/** Dialog: tasks that need focus (settings, import, install). */
export function Dialog({ onClose, label, className, children }: OverlayProps) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/40 anim-fade" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn('w-full max-w-2xl rounded-lg border border-ink-200 bg-white shadow-lg overflow-hidden', className)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Shared header for Sheet and Dialog. */
export function OverlayHeader({
  title,
  subtitle,
  onClose,
  closeLabel,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  children?: React.ReactNode;
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
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
