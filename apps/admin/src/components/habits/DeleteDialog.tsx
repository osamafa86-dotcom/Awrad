'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { habitErrorText, type HabitResult } from '@/lib/habits';
import { ar } from '@/messages/ar';

const t = ar.habits.remove;

export interface DeleteDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  body: string;
  onConfirm(): Promise<HabitResult>;
}

/** «حذف» of a habit or an item that no log refers to, after a confirmation. */
export function DeleteDialog({ open, onOpenChange, title, body, onConfirm }: DeleteDialogProps) {
  const [result, setResult] = useState<HabitResult | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    if (!next) setResult(null);
    onOpenChange(next);
  }

  function confirm() {
    startTransition(async () => {
      const outcome = await onConfirm();
      if (outcome.ok) change(false);
      else setResult(outcome);
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        {result && !result.ok ? (
          <p role="alert" className="t-body-md text-status-notdone">
            {habitErrorText(result)}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="md" disabled={pending}>
              {t.cancel}
            </Button>
          </DialogClose>
          <Button type="button" variant="danger" size="md" disabled={pending} aria-busy={pending} onClick={confirm}>
            {pending ? t.submitting : t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
