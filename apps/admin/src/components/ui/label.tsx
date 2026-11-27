'use client';

import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** Field label (DESIGN.md §6 TextField): label-md on the primary text colour. */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('t-label-md text-fg-primary', className)} {...props} />;
}
