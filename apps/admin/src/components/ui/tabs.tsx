'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// shadcn-style Tabs on Radix: an underlined row of tabs (a04, a06). Right-to-left from RtlProvider.
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex flex-wrap gap-x-24 border-b border-line-subtle', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px flex min-h-44 items-center gap-8 border-b-2 border-transparent px-4 t-label-md text-fg-secondary outline-none',
        'focus-visible:ring-2 focus-visible:ring-line-focus data-[state=active]:border-action data-[state=active]:text-link',
        className,
      )}
      {...props}
    />
  );
}

/** The count beside a tab's name. */
export function TabsCount({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span className={cn('rounded-full bg-sunken px-8 t-label-sm text-fg-secondary tabular-nums', className)} {...props} />
  );
}
