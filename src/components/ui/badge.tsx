import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap select-none',
  {
    variants: {
      variant: {
        default: 'bg-ink-900 text-white',
        secondary: 'bg-ink-100 text-ink-700',
        outline: 'border border-ink-300 text-ink-700',
        accent: 'bg-accent-100 text-accent-900',
        ok: 'bg-ok-100 text-ok-900',
        bad: 'bg-bad-100 text-bad-900',
      },
    },
    defaultVariants: { variant: 'secondary' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
