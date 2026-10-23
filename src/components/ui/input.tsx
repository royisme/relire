import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-ink-300 bg-surface px-3 py-1 text-base text-ink-900 transition-colors outline-none',
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-900',
        'placeholder:text-ink-400 focus-visible:border-accent-600 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-bad-600 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
