/** One row of the sidebar and the phone drawer: a link (or button) with an icon and label, or just the icon in the rail. */
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Route } from '../../utils/routes';
import { Link } from './Link';

interface NavItemProps {
  label: string;
  /** Top-level rows have an icon; sub-pages are indented text. */
  icon?: LucideIcon;
  /** `page` is the page being shown; `area` is the parent of the page being shown. */
  current?: 'page' | 'area';
  /** Icon only, with the label as tooltip and accessible name. */
  rail?: boolean;
  /** A count shown at the end of the row (a corner badge in the rail), read as `badgeLabel`. */
  /** The first row of the tree: larger and set in the serif. */
  lead?: boolean;
  badge?: number;
  badgeLabel?: string;
  to?: Route;
  onClick?: () => void;
  /** Called after a link is followed (the drawer closes itself). */
  onNavigate?: () => void;
}

export function NavItem({
  label,
  icon: Icon,
  current,
  lead,
  rail,
  badge,
  badgeLabel,
  to,
  onClick,
  onNavigate,
}: NavItemProps) {
  const className = cn(
    'relative flex items-center rounded-md whitespace-nowrap select-none cursor-pointer',
    lead ? 'h-11 font-serif text-base' : 'h-10 text-sm',
    rail ? 'w-10 mx-auto justify-center' : cn('gap-3 pr-3', Icon ? 'pl-3' : 'pl-10'),
    current ? 'text-ink-950 font-semibold' : 'text-ink-700 hover:text-ink-950',
    current && rail && 'bg-ink-50',
    (!current || !rail) && 'hover:bg-ink-200',
  );
  const content = (
    <>
      {Icon && <Icon className={cn('w-4 h-4 shrink-0', current && 'text-accent-700')} aria-hidden="true" />}
      {!rail && <span className="truncate">{label}</span>}
      {!!badge && badge > 0 && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'tnum text-center text-xs font-semibold text-accent-800',
              rail
                ? 'absolute top-0 right-0 min-w-4 h-4 px-1 leading-[14px] rounded-full border border-accent-700 bg-ink-100'
                : 'ml-auto',
            )}
          >
            {badge}
          </span>
          <span className="sr-only">{badgeLabel}</span>
        </>
      )}
    </>
  );
  const common = {
    className,
    title: rail ? label : undefined,
    'aria-label': rail ? (badge && badgeLabel ? `${label}, ${badgeLabel}` : label) : undefined,
    'aria-current': current === 'page' ? ('page' as const) : current ? ('true' as const) : undefined,
  };

  if (to) {
    return (
      <Link to={to} onClick={onNavigate} {...common}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} {...common}>
      {content}
    </button>
  );
}
