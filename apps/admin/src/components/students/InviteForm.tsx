'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { inviteStudent } from '@/actions/students';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { studentErrorText, type GroupOption, type StudentField } from '@/lib/students';
import { ar } from '@/messages/ar';

const t = ar.students.inviteForm;

export interface InviteFormProps {
  groups: GroupOption[];
  /** `YYYY-MM-DD`: joined_at's default and its latest allowed value. */
  today: string;
}

/** a09: name, email (LTR), group, joined_at (default today) and tracking; «أرسل الدعوة» last in the line. */
export function InviteForm({ groups, today }: InviteFormProps) {
  const [state, action, pending] = useActionState(inviteStudent, null);
  const error = studentErrorText(state);
  const invalid = new Set<StudentField>(state && !state.ok ? (state.fields ?? []) : []);
  // Controlled so the values survive React's form reset after a failed attempt.
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [groupId, setGroupId] = useState('');
  const [joinedAt, setJoinedAt] = useState(today);
  const [tracked, setTracked] = useState(true);

  const fieldError = (field: StudentField) =>
    invalid.has(field) ? (
      <p id={`${field}-error`} className="t-body-sm text-status-notdone">
        {ar.students.fieldErrors[field]}
      </p>
    ) : null;
  const aria = (field: StudentField) =>
    invalid.has(field) ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` } : {};

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-20 rounded-xl border border-line-subtle bg-surface p-24"
    >
      <div className="flex flex-col gap-8">
        <Label htmlFor="full_name">{t.fullName}</Label>
        <Input
          id="full_name"
          name="full_name"
          autoComplete="off"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          {...aria('full_name')}
        />
        {fieldError('full_name')}
      </div>

      <div className="flex flex-col gap-8">
        <Label htmlFor="email">{t.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="off"
          inputMode="email"
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...aria('email')}
        />
        {fieldError('email')}
      </div>

      <div className="flex flex-col gap-8">
        <Label htmlFor="group_id">{t.group}</Label>
        <Select name="group_id" value={groupId} onValueChange={setGroupId} disabled={groups.length === 0}>
          <SelectTrigger id="group_id" className="min-h-52" {...aria('group_id')}>
            <SelectValue placeholder={t.groupPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {groups.length === 0 ? <p className="t-body-sm text-fg-secondary">{t.noGroups}</p> : null}
        {fieldError('group_id')}
      </div>

      <div className="flex flex-col gap-8">
        <Label htmlFor="joined_at">{t.joinedAt}</Label>
        <Input
          id="joined_at"
          name="joined_at"
          type="date"
          max={today}
          value={joinedAt}
          onChange={(event) => setJoinedAt(event.target.value)}
          aria-describedby={invalid.has('joined_at') ? 'joined_at-error' : 'joined_at-hint'}
          aria-invalid={invalid.has('joined_at') ? true : undefined}
        />
        <p id="joined_at-hint" className="t-body-sm text-fg-secondary">
          {t.joinedAtHint}
        </p>
        {fieldError('joined_at')}
      </div>

      <div className="flex items-center gap-12">
        <Switch id="is_tracked" checked={tracked} onCheckedChange={setTracked} />
        <input type="hidden" name="is_tracked" value={tracked ? 'true' : 'false'} />
        <Label htmlFor="is_tracked">{t.tracked}</Label>
      </div>

      {error ? (
        <p role="alert" className="t-body-md text-status-notdone">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-8">
        <Button asChild variant="secondary" size="md">
          <Link href="/students">{t.cancel}</Link>
        </Button>
        <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}
