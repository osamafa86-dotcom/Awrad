'use client';

import { useId, useState, useTransition, type ReactElement } from 'react';

import { deleteStudent } from '@/actions/students';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { studentErrorText, type StudentResult } from '@/lib/students';
import { ar } from '@/messages/ar';

const t = ar.deleteAccount;

export interface ConfirmDeleteDialogProps {
  studentId: string;
  /**
   * The name the admin must type, exactly (ignoring spaces around it), before «حذف نهائي» enables. With no
   * name on record (null), the phrase «حذف نهائي» is typed instead.
   */
  studentName: string | null;
  /** Where it opens: from the student page the action redirects to /students; from a deletion request it returns. */
  from: 'student' | 'support';
  /** The button that opens the dialog. */
  trigger: ReactElement;
}

/**
 * The double confirmation before a permanent deletion (§13, F-52): the dialog names the student and what goes
 * with the account, and «حذف نهائي» stays disabled until their full name is typed. Esc and «إلغاء» cancel;
 * a refused deletion shows its mapped message here and the dialog stays open.
 */
export function ConfirmDeleteDialog({ studentId, studentName, from, trigger }: ConfirmDeleteDialogProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<StudentResult | null>(null);
  const [deleting, startDelete] = useTransition();

  const expected = studentName?.trim() || null;
  const phrase = expected ?? t.confirmPhrase;
  const matches = typed.trim() === phrase;
  const error = studentErrorText(result);

  function setOpenFresh(next: boolean) {
    setOpen(next);
    setTyped('');
    setResult(null);
  }

  function onOpenChange(next: boolean) {
    // While the delete runs, Esc and an outside click do nothing: the outcome must land in this dialog.
    if (!next && deleting) return;
    setOpenFresh(next);
  }

  function remove() {
    if (!matches) return;
    startDelete(async () => {
      // From the student page a success redirects to /students and this never returns.
      const outcome = await deleteStudent(studentId, from);
      if (outcome.ok) setOpenFresh(false);
      else setResult(outcome);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="break-words">{expected ? t.title(expected) : t.titleUnnamed}</DialogTitle>
        <DialogDescription>{t.body}</DialogDescription>
        <ul className="flex list-disc flex-col gap-4 ps-24 t-body-md text-fg-primary">
          {t.removed.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-16"
          onSubmit={(event) => {
            event.preventDefault();
            remove();
          }}
          noValidate
        >
          <div className="flex flex-col gap-8">
            <Label htmlFor={fieldId} className="break-words">
              {expected ? t.typeName(expected) : t.typePhrase(t.confirmPhrase)}
            </Label>
            <Input
              id={fieldId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={deleting}
            />
          </div>
          {error ? (
            <p role="alert" className="t-body-md text-status-notdone">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={deleting}>
                {t.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" size="md" disabled={!matches || deleting} aria-busy={deleting}>
              {deleting ? t.deleting : t.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
