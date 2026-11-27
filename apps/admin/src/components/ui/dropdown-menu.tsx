'use client';

import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// shadcn-style DropdownMenu on Radix: a row's secondary actions (a06 «أرشفة», «حذف»).
/** Right-to-left by default: Radix does not read <html dir> and would lay the menu and its arrow keys out LTR. */
export function DropdownMenu({ dir = 'rtl', ...props }: ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root dir={dir} {...props} />;
}
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={4}
        align="end"
        className={cn('z-50 min-w-160 rounded-md border border-line-subtle bg-raised p-4', className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { variant?: 'default' | 'danger' }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex min-h-44 cursor-default items-center gap-8 rounded-sm px-12 t-body-md outline-none select-none',
        'data-[highlighted]:bg-action-tint data-[disabled]:opacity-50',
        variant === 'danger' ? 'text-status-notdone' : 'text-fg-primary',
        className,
      )}
      {...props}
    />
  );
}
