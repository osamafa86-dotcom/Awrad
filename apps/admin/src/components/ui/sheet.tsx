'use client';

import { Dialog } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// A drawer on Radix Dialog (shadcn "Sheet"), cut down to what the dashboard needs: one side.
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;
export const SheetTitle = Dialog.Title;

export interface SheetContentProps extends ComponentProps<typeof Dialog.Content> {
  /**
   * The physical screen edge the drawer opens from. Only `left` exists: the sidebar sits on the right
   * under RTL, so its drawer opens from the opposite edge (DESIGN.md §7 rule 3).
   */
  side: 'left';
}

export function SheetContent({ side, className, children, ...props }: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay data-sheet className="fixed inset-0 z-40 bg-scrim [animation:fade-in_150ms_ease-out]" />
      <Dialog.Content
        data-sheet
        data-side={side}
        // why: `end-0` is the left edge because the document is RTL; the drawer must hug the left edge.
        className={cn(
          'fixed inset-y-0 end-0 z-50 flex w-320 max-w-[85vw] flex-col outline-none',
          '[animation:sheet-in_200ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
