'use client';

import { Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { upsertHabit } from '@/actions/habits';
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
import {
  HABIT_FREQUENCIES,
  HABIT_KINDS,
  habitErrorText,
  NAME_MAX,
  parseHabitPatch,
  parseNewHabit,
  TEXT_MAX,
  type HabitField,
  type HabitFrequency,
  type HabitKind,
  type HabitResult,
  type HabitView,
} from '@/lib/habits';
import { ar } from '@/messages/ar';

import { Field } from './Field';

const t = ar.habits.form;

export type HabitFormProps =
  | {
      mode: 'create';
      /** `YYYY-MM-DD` in the admin's zone: the start's default and earliest value. */
      today: string;
      defaultFrequency: HabitFrequency;
      /** Called with the new habit's frequency, so its table can be shown. */
      onCreated?(frequency: HabitFrequency): void;
    }
  | { mode: 'edit'; habit: HabitView };

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange(value: T): void;
}) {
  return (
    <fieldset className="flex flex-col gap-8">
      <legend className="mb-8 t-label-md text-fg-primary">{legend}</legend>
      <div className="flex flex-wrap gap-8">
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-44 cursor-pointer items-center gap-8 rounded-md border border-line-input px-12 t-body-md text-fg-primary has-[:checked]:border-2 has-[:checked]:border-action has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-line-focus"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="size-16 accent-action"
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * «عادة جديدة» (name, description, target, frequency, kind, start date — today by default — and a checklist's
 * first items) or «تعديل» of an existing habit's name, description and target in place (BR-07).
 */
export function HabitForm(props: HabitFormProps) {
  const editing = props.mode === 'edit' ? props.habit : null;
  const initial = {
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    target: editing?.targetText ?? '',
    frequency: props.mode === 'create' ? props.defaultFrequency : (editing?.frequency ?? 'daily'),
    kind: 'tristate' as HabitKind,
    activeFrom: props.mode === 'create' ? props.today : '',
    items: '',
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [invalid, setInvalid] = useState<Set<HabitField>>(new Set());
  const [result, setResult] = useState<HabitResult | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    if (next) setValues(initial);
    else {
      setInvalid(new Set());
      setResult(null);
    }
    setOpen(next);
  }

  const set = (key: 'name' | 'description' | 'target' | 'activeFrom' | 'items') => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  /** Validates as the action will, so field errors show without a round trip; the action checks again. */
  function submit() {
    setResult(null);
    let send: () => Promise<HabitResult>;
    if (props.mode === 'create') {
      const parsed = parseNewHabit(
        {
          name: values.name,
          description: values.description,
          target_text: values.target,
          frequency: values.frequency,
          kind: values.kind,
          active_from: values.activeFrom,
          items: values.items.split('\n'),
        },
        props.today,
      );
      if (!parsed.ok) return setInvalid(new Set(parsed.fields));
      send = () => upsertHabit({ values: parsed.value });
    } else {
      const parsed = parseHabitPatch(props.habit.id, {
        name: values.name,
        description: values.description,
        target_text: values.target,
      });
      if (!parsed.ok) return setInvalid(new Set(parsed.fields));
      send = () => upsertHabit(parsed.value);
    }
    setInvalid(new Set());
    startTransition(async () => {
      const outcome = await send();
      if (outcome.ok) {
        change(false);
        if (props.mode === 'create') props.onCreated?.(values.frequency);
      } else {
        setResult(outcome);
        if (outcome.fields) setInvalid(new Set(outcome.fields));
      }
    });
  }

  const error = (field: HabitField) => (invalid.has(field) ? ar.habits.fieldErrors[field] : null);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        {props.mode === 'create' ? (
          <Button size="md">
            <Plus aria-hidden="true" className="size-20" />
            {ar.habits.newHabit}
          </Button>
        ) : (
          <Button variant="quiet" size="md" className="px-8">
            <Pencil aria-hidden="true" className="size-16" />
            {ar.habits.actions.edit}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-var(--space-32))] overflow-y-auto">
        <DialogTitle>{editing ? t.editTitle : t.title}</DialogTitle>
        <DialogDescription>{editing ? t.editSubtitle : t.subtitle}</DialogDescription>
        <form
          className="flex flex-col gap-16"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field id="habit-name" label={t.name} error={error('name')}>
            {(aria) => (
              <Input {...aria} autoComplete="off" maxLength={NAME_MAX} value={values.name} onChange={set('name')} />
            )}
          </Field>
          <Field id="habit-target" label={t.target} error={error('target_text')}>
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                maxLength={TEXT_MAX}
                placeholder={t.targetPlaceholder}
                value={values.target}
                onChange={set('target')}
              />
            )}
          </Field>
          <Field id="habit-description" label={t.description} error={error('description')}>
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
          {props.mode === 'create' ? (
            <>
              <RadioGroup
                legend={t.frequency}
                name="habit-frequency"
                options={HABIT_FREQUENCIES}
                labels={t.frequencies}
                value={values.frequency}
                onChange={(frequency) => setValues((v) => ({ ...v, frequency }))}
              />
              <RadioGroup
                legend={t.kind}
                name="habit-kind"
                options={HABIT_KINDS}
                labels={t.kinds}
                value={values.kind}
                onChange={(kind) => setValues((v) => ({ ...v, kind }))}
              />
              {values.kind === 'checklist' ? (
                <Field id="habit-items" label={t.items} error={error('items')}>
                  {(aria) => <Textarea {...aria} value={values.items} onChange={set('items')} />}
                </Field>
              ) : null}
              <Field id="habit-active-from" label={t.activeFrom} error={error('active_from')}>
                {(aria) => (
                  <Input {...aria} type="date" min={props.today} value={values.activeFrom} onChange={set('activeFrom')} />
                )}
              </Field>
            </>
          ) : null}

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
              {pending ? t.submitting : editing ? t.save : t.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
