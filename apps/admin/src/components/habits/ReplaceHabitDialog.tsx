'use client';

import { addDays } from '@awrad/domain';
import { ArrowLeftRight } from 'lucide-react';
import { useState, useTransition } from 'react';

import { replaceHabit } from '@/actions/habits';
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
import { Textarea } from '@/components/ui/textarea';
import { formatGregorian, formatHijri } from '@/lib/format';
import {
  defaultSwitchDate,
  habitErrorText,
  NAME_MAX,
  parseReplacement,
  TEXT_MAX,
  type HabitField,
  type HabitResult,
  type HabitView,
} from '@/lib/habits';
import { ar } from '@/messages/ar';

import { Field } from './Field';

const t = ar.habits.replace;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReplaceHabitDialogProps {
  habit: HabitView;
  /** `YYYY-MM-DD` in the admin's zone; the start date defaults to the day after. */
  today: string;
  hijriAdjustment?: number;
}

/**
 * a07 «أرشفة واستبدال» (BR-07): the old habit ends the day before the start date and keeps its logs; the
 * new one (name, target, description and, for a checklist, its items) starts on it. archive_and_replace_habit
 * is the authority on the date (DATE_OUT_OF_WINDOW when a log is on or after it).
 */
export function ReplaceHabitDialog({ habit, today, hijriAdjustment = 0 }: ReplaceHabitDialogProps) {
  const activeItems = habit.items.filter((item) => item.activeTo === null).map((item) => item.name);
  const initial = {
    name: '',
    target: habit.targetText ?? '',
    description: habit.description ?? '',
    items: activeItems.join('\n'),
    date: defaultSwitchDate(today),
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [invalid, setInvalid] = useState<Set<HabitField>>(new Set());
  const [result, setResult] = useState<HabitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const isChecklist = habit.kind === 'checklist';

  function change(next: boolean) {
    if (!next) {
      setValues(initial);
      setInvalid(new Set());
      setResult(null);
    }
    setOpen(next);
  }

  const set = (key: keyof typeof initial) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  function submit() {
    const parsed = parseReplacement(
      {
        name: values.name,
        description: values.description,
        target_text: values.target,
        items: values.items.split('\n'),
        switch_date: values.date,
      },
      habit.kind,
    );
    setResult(null);
    if (!parsed.ok) {
      setInvalid(new Set(parsed.fields));
      return;
    }
    setInvalid(new Set());
    const { switch_date: switchDate, ...replacement } = parsed.value;
    startTransition(async () => {
      const outcome = await replaceHabit(habit.id, replacement, switchDate);
      if (outcome.ok) change(false);
      else {
        setResult(outcome);
        if (!outcome.ok && outcome.fields) setInvalid(new Set(outcome.fields));
      }
    });
  }

  const error = (field: HabitField) => (invalid.has(field) ? ar.habits.fieldErrors[field] : null);
  const endsOn = ISO_DATE.test(values.date) ? addDays(values.date, -1) : null;

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="quiet" size="md" className="px-8">
          <ArrowLeftRight aria-hidden="true" className="size-16" />
          {ar.habits.actions.replace}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-var(--space-32))] overflow-y-auto">
        <DialogTitle>{t.title(habit.name)}</DialogTitle>
        <DialogDescription>{t.body}</DialogDescription>
        <form
          className="flex flex-col gap-16"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field id="replace-name" label={t.name} error={error('name')}>
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                maxLength={NAME_MAX}
                placeholder={t.namePlaceholder}
                value={values.name}
                onChange={set('name')}
              />
            )}
          </Field>
          <Field id="replace-target" label={t.target} error={error('target_text')}>
            {(aria) => (
              <Input {...aria} autoComplete="off" maxLength={TEXT_MAX} value={values.target} onChange={set('target')} />
            )}
          </Field>
          <Field id="replace-description" label={t.description} error={error('description')}>
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                maxLength={TEXT_MAX}
                value={values.description}
                onChange={set('description')}
              />
            )}
          </Field>
          {isChecklist ? (
            <Field id="replace-items" label={t.items} error={error('items')}>
              {(aria) => <Textarea {...aria} value={values.items} onChange={set('items')} />}
            </Field>
          ) : null}
          <Field
            id="replace-date"
            label={t.startDate}
            error={error('date')}
            hint={
              endsOn ? (
                <>
                  <span className="block">{t.startsOn(formatGregorian(values.date), formatHijri(values.date, hijriAdjustment))}</span>
                  <span className="block">{t.endsOn(habit.name, formatGregorian(endsOn))}</span>
                </>
              ) : null
            }
          >
            {(aria) => (
              <Input
                {...aria}
                type="date"
                min={addDays(habit.activeFrom, 1)}
                value={values.date}
                onChange={set('date')}
              />
            )}
          </Field>

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
            <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
              <ArrowLeftRight aria-hidden="true" className="size-16" />
              {pending ? t.submitting : t.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
