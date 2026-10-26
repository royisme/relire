import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/** The one in-flow surface of a page: `rounded-lg`, a 1px `ink-200` border, no shadow or ring (DESIGN.md, Shapes). */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-lg border border-ink-200 bg-surface', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn('flex items-baseline justify-between gap-3 border-b border-ink-200 px-4 py-3', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-4', className)} {...props} />;
}
