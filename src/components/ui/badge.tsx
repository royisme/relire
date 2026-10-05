import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 whitespace-nowrap select-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-stone-900 text-stone-50',
        secondary: 'border-transparent bg-stone-100 text-stone-900',
        outline: 'border-stone-300 text-stone-700 bg-white/70',
        amber: 'border-amber-200 bg-amber-100 text-amber-900',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        blue: 'border-blue-200 bg-blue-50 text-blue-800',
        rose: 'border-rose-200 bg-rose-50 text-rose-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
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
