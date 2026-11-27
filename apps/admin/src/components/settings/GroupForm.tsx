'use client';

import { Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { upsertGroup } from '@/actions/settings';
import { Field } from '@/components/habits/Field';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DEFAULT_GROUP_TIMEZONE,
  GROUP_NAME_MAX,
  parseGroup,
  settingsErrorText,
  type GroupField,
  type GroupResult,
  type GroupRow,
  type SupervisorOption,
} from '@/lib/settings';
import { ar } from '@/messages/ar';

import { TimezonePicker } from './TimezonePicker';

const t = ar.settings.groupForm;
const errors = ar.settings.groupFieldErrors;

export type GroupFormProps = (
  | { mode: 'create' }
  | { mode: 'edit'; group: GroupRow }
) & {
  /** The picker's zones, computed on the server (timezoneOptions). */
  timezones: readonly string[];
  /** Active supervisor and admin profiles. */
  candidates: readonly SupervisorOption[];
  /** The other groups' names: a name must be free (upsert_group checks again). */
  takenNames: readonly string[];
};

/** «مجموعة جديدة» or a row's «تعديل» (a11): name, zone, week start and the supervisors (multi-select). */
export function GroupForm(props: GroupFormProps) {
  const editing = props.mode === 'edit' ? props.group : null;
  const initial = {
    name: editing?.name ?? '',
    timezone: editing?.timezone ?? DEFAULT_GROUP_TIMEZONE,
    weekStartsOn: editing?.weekStartsOn ?? 0,
    supervisorIds: editing?.supervisors.map((s) => s.id) ?? [],
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [invalid, setInvalid] = useState<Set<GroupField>>(new Set());
  const [result, setResult] = useState<GroupResult | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    if (next) setValues(initial);
    else {
      setInvalid(new Set());
      setResult(null);
    }
    setOpen(next);
  }

  function toggleSupervisor(id: string, checked: boolean) {
    setValues((v) => ({
      ...v,
      supervisorIds: checked ? [...v.supervisorIds, id] : v.supervisorIds.filter((other) => other !== id),
    }));
  }

  /** Validates as the action will, so field errors show without a round trip; the action checks again. */
  function submit() {
    setResult(null);
    const parsed = parseGroup(
      { id: editing?.id ?? null, ...values },
      {
        timezones: props.timezones,
        candidates: props.candidates.map((c) => c.id),
        takenNames: props.takenNames,
      },
    );
    if (!parsed.ok) return setInvalid(new Set(parsed.fields));
    setInvalid(new Set());
    startTransition(async () => {
      const outcome = await upsertGroup(parsed.value);
      if (outcome.ok) change(false);
      else {
        setResult(outcome);
        if (outcome.fields) setInvalid(new Set(outcome.fields));
      }
    });
  }

  const nameError = invalid.has('name') ? errors.name : invalid.has('name_taken') ? errors.name_taken : null;
  const error = (field: GroupField) => (invalid.has(field) ? errors[field] : null);
  const supervisorsError = error('supervisor_ids');
  const message = result && !result.ok && result.code !== 'INVALID_INPUT' ? settingsErrorText(result, 'group') : null;

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="quiet" size="md" className="px-8" aria-label={ar.settings.groups.edit(editing.name)}>
            <Pencil aria-hidden="true" className="size-16" />
            {ar.settings.groups.editText}
          </Button>
        ) : (
          <Button size="md">
            <Plus aria-hidden="true" className="size-20" />
            {ar.settings.groups.newGroup}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-var(--space-32))] overflow-y-auto">
        <DialogTitle>{editing ? t.editTitle : t.title}</DialogTitle>
        <DialogDescription>{t.subtitle}</DialogDescription>
        <form
          className="flex flex-col gap-16"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field id="group-name" label={t.name} error={nameError}>
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                maxLength={GROUP_NAME_MAX}
                value={values.name}
                onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
              />
            )}
          </Field>

          <Field id="group-timezone" label={t.timezone} error={error('timezone')} hint={t.timezoneHint}>
            {(aria) => (
              <TimezonePicker
                aria={aria}
                value={values.timezone}
                options={props.timezones}
                onChange={(timezone) => setValues((v) => ({ ...v, timezone }))}
              />
            )}
          </Field>

          <Field id="group-week-start" label={t.weekStart} error={error('week_starts_on')}>
            {(aria) => (
              <Select
                value={String(values.weekStartsOn)}
                onValueChange={(day) => setValues((v) => ({ ...v, weekStartsOn: Number(day) }))}
              >
                <SelectTrigger {...aria}>
                  <SelectValue>{ar.dates.weekdays[values.weekStartsOn]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ar.dates.weekdays.map((day, index) => (
                    <SelectItem key={day} value={String(index)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <fieldset
            className="flex flex-col gap-8"
            aria-describedby={supervisorsError ? 'group-supervisors-hint group-supervisors-error' : 'group-supervisors-hint'}
          >
            <legend className="mb-8 t-label-md text-fg-primary">{t.supervisors}</legend>
            <p id="group-supervisors-hint" className="t-body-sm text-fg-secondary">
              {props.candidates.length > 0 ? t.supervisorsHint : t.noCandidates}
            </p>
            <div className="flex flex-col gap-4">
              {props.candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex min-h-44 cursor-pointer items-center gap-12 rounded-md px-8 t-body-md text-fg-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-line-focus"
                >
                  <input
                    type="checkbox"
                    checked={values.supervisorIds.includes(candidate.id)}
                    onChange={(event) => toggleSupervisor(candidate.id, event.target.checked)}
                    className="size-20 shrink-0 accent-action"
                  />
                  {candidate.name}
                </label>
              ))}
            </div>
            {supervisorsError ? (
              <p id="group-supervisors-error" className="t-body-sm text-status-notdone">
                {supervisorsError}
              </p>
            ) : null}
          </fieldset>

          {message ? (
            <p role="alert" className="t-body-md text-status-notdone">
              {message}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
              {pending ? t.submitting : editing ? t.save : t.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
