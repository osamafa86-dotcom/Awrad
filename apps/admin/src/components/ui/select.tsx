'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// shadcn-style Select on Radix (DESIGN.md §6 FilterSelect). With `name`, Radix renders a hidden native
// <select> so the value is submitted with its form.
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex min-h-44 w-full items-center justify-between gap-8 rounded-md border border-line-input bg-surface px-12',
        't-body-md text-fg-primary outline-none focus-visible:border-2 focus-visible:border-line-focus',
        'aria-invalid:border-2 aria-invalid:border-status-notdone data-[placeholder]:text-fg-tertiary',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" className="size-16 shrink-0 text-fg-secondary" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)]',
          'overflow-hidden rounded-md border border-line-subtle bg-raised p-4',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex min-h-44 cursor-default items-center gap-8 rounded-sm ps-32 pe-12 t-body-md text-fg-primary',
        'outline-none select-none data-[highlighted]:bg-action-tint data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute start-8 flex size-16 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-16" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
