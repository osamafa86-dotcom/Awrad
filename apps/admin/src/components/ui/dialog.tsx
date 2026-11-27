'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// shadcn-style Dialog on Radix: a centred card over the scrim (a05, a07, the delete confirmation).
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-dialog className="fixed inset-0 z-40 bg-scrim [animation:fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        data-dialog
        className={cn(
          // Centred by inset-0 + m-auto + h-fit: no translate, so nothing depends on the text direction.
          'fixed inset-0 z-50 m-auto flex h-fit w-[calc(100vw-32px)] max-w-480 flex-col gap-16',
          'rounded-xl border border-line-subtle bg-surface p-24 outline-none',
          '[animation:fade-in_150ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('t-title-lg text-fg-primary', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('t-body-md text-fg-secondary', className)} {...props} />;
}

/** The action row: cancel first, the primary action last in the line (DESIGN.md §7 rule 3). */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap justify-end gap-8', className)} {...props} />;
}
