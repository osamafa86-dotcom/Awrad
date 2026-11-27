'use client';

import { useState, useTransition } from 'react';

import { deleteStudent, updateStudent } from '@/actions/students';
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
import { Switch } from '@/components/ui/switch';
import { studentErrorText, type GroupOption, type StudentField, type StudentResult } from '@/lib/students';
import type { StudentProfile } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

const t = ar.students.edit;
const NO_GROUP = 'none';

export interface StudentEditPanelProps {
  student: StudentProfile;
  groups: GroupOption[];
  /** `YYYY-MM-DD`, the latest joined_at allowed. */
  today: string;
}

/** a02, admins only: edit the profile, activate/deactivate, and delete the account after a confirmation. */
export function StudentEditPanel({ student, groups, today }: StudentEditPanelProps) {
  const [fullName, setFullName] = useState(student.fullName);
  const [groupId, setGroupId] = useState(student.groupId ?? NO_GROUP);
  const [joinedAt, setJoinedAt] = useState(student.joinedAt);
  const [tracked, setTracked] = useState(student.isTracked);
  const [result, setResult] = useState<StudentResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleteResult, setDeleteResult] = useState<StudentResult | null>(null);
  const [deleting, startDelete] = useTransition();

  const invalid = new Set<StudentField>(result && !result.ok ? (result.fields ?? []) : []);
  const error = studentErrorText(result);

  function save(isActive: boolean) {
    startTransition(async () => {
      setResult(
        await updateStudent(student.id, {
          full_name: fullName,
          group_id: groupId === NO_GROUP ? null : groupId,
          is_active: isActive,
          is_tracked: tracked,
          joined_at: joinedAt,
        }),
      );
    });
  }

  function remove() {
    startDelete(async () => {
      // On success the action redirects to /students and this never returns.
      setDeleteResult(await deleteStudent(student.id));
    });
  }

  return (
    <section className="flex flex-col gap-12">
      <h2 className="t-display-section text-fg-primary">{t.title}</h2>
      <form
        className="flex flex-col gap-16 rounded-xl border border-line-subtle bg-surface p-16"
        onSubmit={(event) => {
          event.preventDefault();
          save(student.isActive);
        }}
        noValidate
      >
        <div className="flex flex-col gap-8">
          <Label htmlFor="edit-full-name">{t.fullName}</Label>
          <Input
            id="edit-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-invalid={invalid.has('full_name') ? true : undefined}
          />
        </div>
        <div className="flex flex-col gap-8">
          <Label htmlFor="edit-group">{t.group}</Label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger id="edit-group" className="min-h-52">
              <SelectValue>
                {groups.find((group) => group.id === groupId)?.name ?? ar.students.noGroup}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>{ar.students.noGroup}</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-8">
          <Label htmlFor="edit-joined-at">{t.joinedAt}</Label>
          <Input
            id="edit-joined-at"
            type="date"
            max={today}
            value={joinedAt}
            onChange={(event) => setJoinedAt(event.target.value)}
            aria-invalid={invalid.has('joined_at') ? true : undefined}
          />
        </div>
        <div className="flex items-center gap-12">
          <Switch id="edit-tracked" checked={tracked} onCheckedChange={setTracked} />
          <Label htmlFor="edit-tracked">{t.tracked}</Label>
        </div>

        <div aria-live="polite">
          {error ? (
            <p role="alert" className="t-body-md text-status-notdone">
              {error}
            </p>
          ) : result?.ok ? (
            <p className="t-body-md text-status-done">{t.saved}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-8">
          <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => save(!student.isActive)}>
            {student.isActive ? t.deactivate : t.activate}
          </Button>
          <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
            {pending ? t.saving : t.save}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-12 rounded-xl border border-status-notdone bg-surface p-16">
        <h3 className="t-title-md text-fg-primary">{t.dangerTitle}</h3>
        <p className="t-body-md text-fg-secondary">{t.dangerBody}</p>
        <Dialog onOpenChange={() => setDeleteResult(null)}>
          <DialogTrigger asChild>
            <Button variant="danger" size="md" className="w-fit">
              {t.delete}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>{t.confirmTitle}</DialogTitle>
            <DialogDescription>{t.confirmBody(student.fullName)}</DialogDescription>
            {deleteResult && !deleteResult.ok ? (
              <p role="alert" className="t-body-md text-status-notdone">
                {studentErrorText(deleteResult)}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" size="md" disabled={deleting}>
                  {t.cancel}
                </Button>
              </DialogClose>
              <Button variant="danger" size="md" disabled={deleting} aria-busy={deleting} onClick={remove}>
                {deleting ? t.deleting : t.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
