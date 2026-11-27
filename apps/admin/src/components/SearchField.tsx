'use client';

import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export interface SearchFieldProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Accessible name; also the placeholder unless one is given. */
  label: string;
}

/** DESIGN.md §6 `SearchField`: a search box with a leading magnifier (at the start edge under RTL). */
export function SearchField({ label, className, placeholder, ...props }: SearchFieldProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute start-12 size-20 text-fg-tertiary" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        className={cn(
          'min-h-44 w-full rounded-md border border-line-input bg-surface ps-40 pe-12 t-body-md text-fg-primary',
          'placeholder:text-fg-tertiary outline-none focus:border-2 focus:border-line-focus',
        )}
        {...props}
      />
    </div>
  );
}
