'use client';

import { useId, useState, useTransition } from 'react';

import { handleSupportRequest } from '@/actions/support';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_MAX, supportErrorText, type SupportRequest, type SupportResult } from '@/lib/support';
import { ar } from '@/messages/ar';

import { QuotedText, RequestWhen } from './RequestWhen';

const t = ar.support;

export interface HandleDialogProps {
  request: SupportRequest;
  hijriAdjustment: number;
}

/**
 * a05 — F-64 «تمّت المعالجة»: the student, the week, the review and the request in full, and an optional
 * internal note. On success it closes and the server refresh moves the request to «المعالَجة».
 */
export function HandleDialog({ request, hijriAdjustment }: HandleDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<SupportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = useId();
  const hintId = useId();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setNote('');
    setResult(null);
  }

  function submit() {
    startTransition(async () => {
      const outcome = await handleSupportRequest(request.id, note);
      if (outcome.ok) onOpenChange(false);
      else setResult(outcome);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          {t.handle.open}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-var(--space-32))] max-w-640 overflow-y-auto">
        <DialogTitle>{t.handle.title}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-col gap-4">
            <span className="t-body-strong text-fg-primary">{request.studentName ?? t.unknownStudent}</span>
            <RequestWhen request={request} hijriAdjustment={hijriAdjustment} />
          </div>
        </DialogDescription>
        <QuotedText label={t.review} text={request.reviewText} empty={t.noReview} />
        <QuotedText label={t.request} text={request.requestText} />
        <div className="flex flex-col gap-8">
          <Label htmlFor={noteId}>{t.handle.note}</Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={NOTE_MAX}
            aria-describedby={hintId}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
          />
          <p id={hintId} className="t-caption text-fg-secondary">
            {t.handle.noteHint}
          </p>
        </div>
        {result && !result.ok ? (
          <p role="alert" className="t-body-md text-status-notdone">
            {supportErrorText(result)}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="md" disabled={pending}>
              {t.handle.cancel}
            </Button>
          </DialogClose>
          <Button variant="primary" size="md" disabled={pending} aria-busy={pending} onClick={submit}>
            {pending ? t.handle.submitting : t.handle.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
