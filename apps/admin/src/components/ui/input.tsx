import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** DESIGN.md §6 TextField input: default · focused · error (aria-invalid). */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-h-52 w-full rounded-md border border-line-input bg-surface px-16 py-12 t-body-md text-fg-primary',
        'placeholder:text-fg-tertiary outline-none focus:border-2 focus:border-line-focus',
        'aria-invalid:border-2 aria-invalid:border-status-notdone disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
