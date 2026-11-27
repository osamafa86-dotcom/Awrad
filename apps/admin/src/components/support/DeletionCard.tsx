'use client';

import { todayIn } from '@awrad/domain';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';

import { deleteStudent } from '@/actions/students';
import { dismissDeletionRequest } from '@/actions/support';
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
import { formatGregorian, formatHijri } from '@/lib/format';
import { studentErrorText, type StudentResult } from '@/lib/students';
import { deletionDeadline, supportErrorText, type DeletionRequest, type SupportResult } from '@/lib/support';
import { ar } from '@/messages/ar';

const t = ar.support;

export interface DeletionCardProps {
  request: DeletionRequest;
  /** `YYYY-MM-DD` in the viewer's zone. */
  today: string;
  timezone: string;
  hijriAdjustment: number;
}

/**
 * §13 — one open account-deletion request (admins only): the student, the group, when it was asked, the
 * 30-day deadline («متأخّر» once passed). «حذف نهائي» deletes the account after a confirmation naming the
 * student (the request goes with it; admin_delete_user writes the audit row); «رفض الطلب» closes it.
 */
export function DeletionCard({ request, today, timezone, hijriAdjustment }: DeletionCardProps) {
  const nameId = useId();
  const name = request.studentName ?? t.unknownStudent;
  const requestedOn = todayIn(timezone, new Date(request.requestedAt));
  const deadline = deletionDeadline(request.requestedAt, timezone, today);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteResult, setDeleteResult] = useState<StudentResult | null>(null);
  const [dismissResult, setDismissResult] = useState<SupportResult | null>(null);
  const [deleting, startDelete] = useTransition();
  const [dismissing, startDismiss] = useTransition();

  function remove() {
    startDelete(async () => {
      const outcome = await deleteStudent(request.userId, 'support');
      if (outcome.ok) setConfirmOpen(false);
      else setDeleteResult(outcome);
    });
  }

  function dismiss() {
    startDismiss(async () => {
      const outcome = await dismissDeletionRequest(request.id);
      setDismissResult(outcome.ok ? null : outcome);
    });
  }

  return (
    <article aria-labelledby={nameId} className="flex flex-col gap-12 rounded-xl border border-line-subtle bg-surface p-16 md:p-24">
      <div className="flex flex-wrap items-start justify-between gap-12">
        <div className="flex min-w-0 flex-col gap-4">
          <Link
            id={nameId}
            href={`/students/${request.userId}`}
            className="w-fit break-words t-title-md text-fg-primary hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-line-focus"
          >
            {name}
          </Link>
          <span className="t-body-sm text-fg-secondary">{request.groupName ?? t.noGroup}</span>
          <span className="t-body-sm text-fg-secondary">
            {t.deletion.requestedOn(`${formatHijri(requestedOn, hijriAdjustment)} · ${formatGregorian(requestedOn)}`)}
          </span>
          <span className="flex flex-wrap items-center gap-8">
            <span className={deadline.overdue ? 't-body-strong text-status-notdone' : 't-body-sm text-fg-primary'}>
              {t.deletion.deadline(formatGregorian(deadline.date))}
            </span>
            {deadline.overdue ? (
              <span className="inline-flex items-center gap-4 rounded-sm bg-status-notdone-tint px-8 py-2 t-label-sm whitespace-nowrap text-status-notdone">
                <span aria-hidden="true" className="size-8 rounded-full bg-status-notdone" />
                {t.deletion.overdue}
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex flex-wrap gap-8">
          <Button variant="secondary" size="md" disabled={dismissing || deleting} aria-busy={dismissing} onClick={dismiss}>
            {dismissing ? t.deletion.dismissing : t.deletion.dismiss}
          </Button>
          <Dialog
            open={confirmOpen}
            onOpenChange={(next) => {
              setConfirmOpen(next);
              setDeleteResult(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="danger" size="md" disabled={dismissing}>
                {t.deletion.delete}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{t.deletion.confirmTitle(name)}</DialogTitle>
              <DialogDescription>{t.deletion.confirmBody}</DialogDescription>
              {deleteResult && !deleteResult.ok ? (
                <p role="alert" className="t-body-md text-status-notdone">
                  {studentErrorText(deleteResult)}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary" size="md" disabled={deleting}>
                    {t.deletion.cancel}
                  </Button>
                </DialogClose>
                <Button variant="danger" size="md" disabled={deleting} aria-busy={deleting} onClick={remove}>
                  {deleting ? t.deletion.deleting : t.deletion.confirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {dismissResult && !dismissResult.ok ? (
        <p role="alert" className="t-body-md text-status-notdone">
          {supportErrorText(dismissResult)}
        </p>
      ) : null}
    </article>
  );
}

