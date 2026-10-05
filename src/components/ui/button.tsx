import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-stone-900 text-stone-50 hover:bg-stone-800 shadow-2xs',
        destructive: 'bg-rose-600 text-white hover:bg-rose-700 shadow-2xs',
        outline: 'border border-stone-200 bg-white hover:bg-stone-100 text-stone-800',
        secondary: 'bg-stone-100 text-stone-900 hover:bg-stone-200/80',
        ghost: 'hover:bg-stone-100 hover:text-stone-900 text-stone-600',
        amber: 'bg-amber-700 text-white hover:bg-amber-800 shadow-2xs',
        amberLight: 'bg-amber-100 text-amber-900 hover:bg-amber-200/80',
      },
      size: {
        default: 'h-8 px-3 py-1.5',
        sm: 'h-7 rounded-md px-2.5 text-[11px]',
        lg: 'h-9 rounded-lg px-4 text-sm',
        icon: 'h-8 w-8',
        iconSm: 'h-7 w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
