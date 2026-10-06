import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from './button';

/** An icon button that opens a short single-choice menu (language, theme). Closes on choice, outside click or Esc. */

export interface MenuItem<T extends string> {
  value: T;
  label: string;
  /** Drawn before the label, e.g. a colour swatch. */
  leading?: React.ReactNode;
}

interface MenuButtonProps<T extends string> {
  icon: React.ReactNode;
  label: string;
  items: MenuItem<T>[];
  value: T;
  onSelect: (value: T) => void;
}

export function MenuButton<T extends string>({ icon, label, items, value, onSelect }: MenuButtonProps<T>) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {icon}
      </Button>
      {open && (
        <ul role="menu" aria-label={label} className="absolute right-0 top-full mt-1 z-40 min-w-44 rounded-lg border border-ink-200 bg-surface py-1 shadow-lg anim-fade">
          {items.map((item) => (
            <li key={item.value} role="none">
              <button
                role="menuitemradio"
                aria-checked={value === item.value}
                onClick={() => {
                  onSelect(item.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 h-10 text-sm text-ink-800 hover:bg-ink-100 cursor-pointer"
              >
                {item.leading}
                <span className="flex-1 text-left">{item.label}</span>
                {value === item.value && <Check className="w-4 h-4 text-accent-900" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
