'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** DESIGN.md §6 `Toggle` on Radix Switch; pair it with a Label so the whole line toggles it. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-24 w-44 shrink-0 items-center rounded-full border border-line-input bg-sunken p-2',
        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2',
        'focus-visible:ring-offset-canvas data-[state=checked]:border-action data-[state=checked]:bg-action',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-16 rounded-full bg-surface transition-transform',
          // why: translate is physical; the thumb travels toward the end edge, which is the left under RTL.
          'rtl:data-[state=checked]:-translate-x-20 ltr:data-[state=checked]:translate-x-20',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
