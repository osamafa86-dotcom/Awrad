import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// shadcn-style table parts. Cells grow with their content (no fixed row height, no truncation:
// DESIGN.md §7 rule 9); headers use the same padding as the cells so they line up with the rows.

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-line-subtle bg-surface">
      <table className={cn('w-full border-collapse text-start t-body-md text-fg-primary', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-sunken', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-b-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-line-subtle align-top', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('px-16 py-12 text-start t-label-sm whitespace-nowrap text-fg-secondary', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-16 py-12 text-start', className)} {...props} />;
}
