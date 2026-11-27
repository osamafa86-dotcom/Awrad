'use client';

import { Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { createSession } from '@/actions/attendance';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { attendanceErrorText, TITLE_MAX, type AttendanceResult, type SessionField } from '@/lib/attendance';
import type { GroupOption } from '@/lib/students';
import { ar } from '@/messages/ar';

const t = ar.attendance;
/** The group select's value for a shared session (group_id null). */
const SHARED = 'shared';

export interface NewSessionDialogProps {
  /** The groups the viewer may create a session for (admin: all; supervisor: the supervised ones). */
  groups: GroupOption[];
  /** Admins: «كل المجموعات» (a shared session). */
  allowShared: boolean;
  /** `YYYY-MM-DD` in the viewer's zone: the date's default. */
  today: string;
}

/** F-62 «مجلس جديد»: date (default today), optional title and the group; «إنشاء المجلس» opens the session. */
export function NewSessionDialog({ groups, allowShared, today }: NewSessionDialogProps) {
  const initialGroup = !allowShared && groups.length === 1 ? groups[0]!.id : '';
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState(initialGroup);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [pending, startTransition] = useTransition();

  const invalid = new Set<SessionField>(result && !result.ok ? (result.fields ?? []) : []);
  const error = attendanceErrorText(result);
  const options = [
    ...(allowShared ? [{ value: SHARED, label: t.allGroups }] : []),
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  function reset(open: boolean) {
    if (open) return;
    setDate(today);
    setTitle('');
    setGroup(initialGroup);
    setResult(null);
  }

  function submit() {
    startTransition(async () => {
      // On success the action redirects to the new session and this never returns.
      setResult(
        await createSession({ group_id: group === SHARED ? null : group, session_date: date, title: title || null }),
      );
    });
  }

  const fieldError = (field: SessionField) =>
    invalid.has(field) ? (
      <p id={`session-${field}-error`} className="t-body-sm text-status-notdone">
        {t.fieldErrors[field]}
      </p>
    ) : null;
  const aria = (field: SessionField) =>
    invalid.has(field) ? { 'aria-invalid': true, 'aria-describedby': `session-${field}-error` } : {};

  return (
    <Dialog onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button size="md">
          <Plus aria-hidden="true" className="size-20" />
          {t.newSession}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t.form.title}</DialogTitle>
        <DialogDescription>{t.form.subtitle}</DialogDescription>
        <form
          className="flex flex-col gap-16"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-8">
            <Label htmlFor="session-date">{t.form.date}</Label>
            <Input
              id="session-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              {...aria('session_date')}
            />
            {fieldError('session_date')}
          </div>
          <div className="flex flex-col gap-8">
            <Label htmlFor="session-title">{t.form.sessionTitle}</Label>
            <Input
              id="session-title"
              autoComplete="off"
              maxLength={TITLE_MAX}
              placeholder={t.form.titlePlaceholder}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              {...aria('title')}
            />
            {fieldError('title')}
          </div>
          <div className="flex flex-col gap-8">
            <Label htmlFor="session-group">{t.form.group}</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id="session-group" className="min-h-52" {...aria('group_id')}>
                <SelectValue placeholder={t.form.groupPlaceholder}>
                  {options.find((option) => option.value === group)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError('group_id')}
          </div>

          {error ? (
            <p role="alert" className="t-body-md text-status-notdone">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t.form.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
              {pending ? t.form.submitting : t.form.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
