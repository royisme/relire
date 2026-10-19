/** Owns the shared sortable column heading; pages own columns, rows and sort state. */
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from './ui/table';

export function SortableHeader({
  direction,
  onToggle,
  className,
  children,
}: {
  direction: false | 'asc' | 'desc';
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TableHead
      scope="col"
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      className={className}
    >
      <button
        onClick={onToggle}
        className="inline-flex h-10 items-center gap-1 text-left text-ink-600 hover:text-ink-900 cursor-pointer"
      >
        {children}
        {direction === 'asc' ? (
          <ArrowUp aria-hidden="true" className="h-3 w-3 shrink-0" />
        ) : direction === 'desc' ? (
          <ArrowDown aria-hidden="true" className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowUpDown aria-hidden="true" className="h-3 w-3 shrink-0 text-ink-400" />
        )}
      </button>
    </TableHead>
  );
}
