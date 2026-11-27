'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { habitErrorText, type HabitResult } from '@/lib/habits';
import { ar } from '@/messages/ar';

const t = ar.habits.archive;

export interface ArchiveDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  /** The earliest last day: today, or the row's start when that is later. */
  minDate: string;
  onConfirm(date: string): Promise<HabitResult>;
}

/** «أرشفة» of a habit or an item: picks its last active day (default the earliest allowed), then confirms. */
export function ArchiveDialog({ open, onOpenChange, title, minDate, onConfirm }: ArchiveDialogProps) {
  const [date, setDate] = useState(minDate);
  const [result, setResult] = useState<HabitResult | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    if (!next) {
      setDate(minDate);
      setResult(null);
    }
    onOpenChange(next);
  }

  function confirm() {
    startTransition(async () => {
      const outcome = await onConfirm(date);
      if (outcome.ok) change(false);
      else setResult(outcome);
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t.body}</DialogDescription>
        <div className="flex flex-col gap-8">
          <Label htmlFor="archive-date">{t.date}</Label>
          <Input id="archive-date" type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
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
          <Button type="button" size="md" disabled={pending || !date} aria-busy={pending} onClick={confirm}>
            {pending ? t.submitting : t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
