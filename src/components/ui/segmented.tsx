import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A row of mutually exclusive options (filters, modes). The selected one sits on the surface colour;
 * labels never wrap, and the row scrolls sideways on a narrow screen instead of squeezing them.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('max-w-full overflow-x-auto', className)}>
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-ink-100 p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'h-8 px-3 rounded-md text-sm whitespace-nowrap cursor-pointer transition-colors',
                active ? 'bg-surface text-ink-950 font-medium shadow-xs' : 'text-ink-600 hover:text-ink-900'
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
