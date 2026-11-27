'use client';

import { useState, useTransition } from 'react';

import { deleteSession } from '@/actions/attendance';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { attendanceErrorText, type AttendanceResult } from '@/lib/attendance';
import { ar } from '@/messages/ar';

const t = ar.attendance;

/** Admins only: «حذف المجلس» after a confirmation; the action returns to /attendance. */
export function DeleteSessionDialog({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      // On success the action redirects to /attendance and this never returns.
      setResult(await deleteSession(sessionId));
    });
  }

  return (
    <Dialog onOpenChange={() => setResult(null)}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          {t.deleteSession}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t.confirmTitle}</DialogTitle>
        <DialogDescription>{t.confirmBody}</DialogDescription>
        {result && !result.ok ? (
          <p role="alert" className="t-body-md text-status-notdone">
            {attendanceErrorText(result)}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="md" disabled={pending}>
              {t.cancel}
            </Button>
          </DialogClose>
          <Button variant="danger" size="md" disabled={pending} aria-busy={pending} onClick={remove}>
            {pending ? t.deleting : t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
