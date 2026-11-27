'use client';

import { useState, useTransition } from 'react';

import { archiveHabit, deleteHabit, reorderHabits, upsertHabit } from '@/actions/habits';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatGregorian, formatHijri } from '@/lib/format';
import {
  habitErrorText,
  splitArchived,
  type HabitFrequency,
  type HabitPatch,
  type HabitResult,
  type HabitView,
} from '@/lib/habits';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

import { HabitForm } from './HabitForm';
import { InlineEdit } from './InlineEdit';
import { ItemsEditor } from './ItemsEditor';
import { DragHandle, Reorder, useSortableRow } from './Reorder';
import { ReplaceHabitDialog } from './ReplaceHabitDialog';
import { RowMenu } from './RowMenu';

const t = ar.habits;
/** Handle, name, target, kind, period, actions. */
const COLUMNS = 6;

export interface HabitTableProps {
  frequency: HabitFrequency;
  /** Every habit of this frequency, active and archived. */
  habits: HabitView[];
  /** `YYYY-MM-DD` in the admin's zone. */
  today: string;
  hijriAdjustment?: number;
}

function KindLabel({ habit }: { habit: HabitView }) {
  if (habit.kind === 'tristate') return <>{t.kind.tristate}</>;
  return <>{t.checklistCount(habit.items.filter((item) => item.activeTo === null).length)}</>;
}

function DateLines({ date, hijriAdjustment, label }: { date: string; hijriAdjustment: number; label?: string }) {
  return (
    <span className="flex flex-col">
      <span className="t-body-md text-fg-primary">{label ?? formatGregorian(date)}</span>
      <span className="t-caption text-fg-secondary">{formatHijri(date, hijriAdjustment)}</span>
    </span>
  );
}

interface RowProps {
  habit: HabitView;
  today: string;
  hijriAdjustment: number;
  onPatch(id: string, patch: HabitPatch): Promise<boolean>;
  onDone(result: HabitResult): HabitResult;
}

/** One active habit: a sortable <tbody> holding its row and, for a checklist, the items row under it. */
function SortableHabit({ habit, today, hijriAdjustment, onPatch, onDone }: RowProps) {
  const { setNodeRef, style, isDragging, handle } = useSortableRow(habit.id);
  const starts = habit.activeFrom > today;
  return (
    <tbody
      ref={setNodeRef}
      style={style}
      className={cn('border-b border-line-subtle last:border-b-0', isDragging && 'bg-raised')}
    >
      <TableRow className="border-b-0 align-middle">
        <TableCell className="w-44 px-8">
          <DragHandle handle={handle} name={habit.name} />
        </TableCell>
        <TableCell className="min-w-160 px-8 t-body-strong">
          <InlineEdit value={habit.name} label={t.inline.name} onSave={(name) => onPatch(habit.id, { name: name ?? '' })} />
        </TableCell>
        <TableCell className="w-full min-w-192 px-8 text-fg-secondary">
          <InlineEdit
            value={habit.targetText}
            label={t.inline.target}
            placeholder={t.noTarget}
            allowEmpty
            onSave={(target) => onPatch(habit.id, { target_text: target })}
          />
        </TableCell>
        <TableCell className="whitespace-nowrap text-fg-secondary">
          <KindLabel habit={habit} />
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <DateLines
            date={habit.activeFrom}
            hijriAdjustment={hijriAdjustment}
            label={starts ? t.startsOn(formatGregorian(habit.activeFrom)) : undefined}
          />
        </TableCell>
        <TableCell className="px-8">
          <div className="flex items-center justify-end gap-4 whitespace-nowrap">
            <HabitForm mode="edit" habit={habit} />
            <ReplaceHabitDialog habit={habit} today={today} hijriAdjustment={hijriAdjustment} />
            <RowMenu
              name={habit.name}
              archive={{
                title: t.archive.title(habit.name),
                minDate: starts ? habit.activeFrom : today,
                run: async (date) => onDone(await archiveHabit(habit.id, date)),
              }}
              remove={
                habit.hasLogs
                  ? undefined
                  : {
                      title: t.remove.title(habit.name),
                      body: t.remove.body,
                      run: async () => onDone(await deleteHabit(habit.id)),
                    }
              }
            />
          </div>
        </TableCell>
      </TableRow>
      {habit.kind === 'checklist' ? (
        <tr>
          <td />
          <td colSpan={COLUMNS - 1} className="px-8 pb-16">
            <ItemsEditor habitId={habit.id} habitName={habit.name} items={habit.items} today={today} />
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}

function ArchivedHabits({
  habits,
  hijriAdjustment,
  onDone,
}: {
  habits: HabitView[];
  hijriAdjustment: number;
  onDone(result: HabitResult): HabitResult;
}) {
  return (
    <details className="flex flex-col gap-12">
      <summary className="min-h-44 cursor-pointer content-center t-label-md text-link">{t.archived(habits.length)}</summary>
      <Table aria-label={t.archived(habits.length)}>
        <TableHeader>
          <TableRow>
            <TableHead>{t.archivedColumns.name}</TableHead>
            <TableHead>{t.archivedColumns.target}</TableHead>
            <TableHead>{t.archivedColumns.kind}</TableHead>
            <TableHead>{t.archivedColumns.period}</TableHead>
            <TableHead>
              <span className="sr-only">{t.archivedColumns.actions}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {habits.map((habit) => (
            <TableRow key={habit.id} className="align-middle">
              <TableCell className="min-w-160 t-body-strong">{habit.name}</TableCell>
              <TableCell className="w-full min-w-192 text-fg-secondary">{habit.targetText ?? t.noTarget}</TableCell>
              <TableCell className="whitespace-nowrap text-fg-secondary">
                <KindLabel habit={habit} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="flex flex-col">
                  <span className="t-body-md text-fg-primary">
                    {t.period(formatGregorian(habit.activeFrom), formatGregorian(habit.activeTo!))}
                  </span>
                  <span className="t-caption text-fg-secondary">
                    {t.period(formatHijri(habit.activeFrom, hijriAdjustment), formatHijri(habit.activeTo!, hijriAdjustment))}
                  </span>
                </span>
              </TableCell>
              <TableCell className="px-8">
                <RowMenu
                  name={habit.name}
                  remove={
                    habit.hasLogs
                      ? undefined
                      : {
                          title: t.remove.title(habit.name),
                          body: t.remove.body,
                          run: async () => onDone(await deleteHabit(habit.id)),
                        }
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  );
}

/**
 * a06 — F-63: the habits of one frequency. Active ones by sort order with a drag handle (reorder is
 * optimistic and goes back on failure), the name and target edited in place (BR-07), «تعديل»,
 * «أرشفة واستبدال» and «⋯» (أرشفة · حذف when no log refers to it); archived ones in a collapsed section.
 */
export function HabitTable({ frequency, habits, today, hijriAdjustment = 0 }: HabitTableProps) {
  const { active, archived } = splitArchived(habits);
  const ids = active.map((habit) => habit.id);
  const [order, setOrder] = useState(ids);
  const [serverIds, setServerIds] = useState(ids.join());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  if (ids.join() !== serverIds) {
    // The server's order changed (a save, a new or archived habit): it replaces the optimistic one.
    setServerIds(ids.join());
    setOrder(ids);
  }
  const byId = new Map(active.map((habit) => [habit.id, habit]));
  const rows = order.flatMap((id) => byId.get(id) ?? []);

  function done(result: HabitResult): HabitResult {
    setError(habitErrorText(result));
    return result;
  }

  async function patch(id: string, values: HabitPatch): Promise<boolean> {
    setError(null);
    return done(await upsertHabit({ id, patch: values })).ok;
  }

  function reorder(next: string[]) {
    const previous = order;
    setOrder(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await reorderHabits(frequency, next);
      if (result.ok) setSaved(true);
      else {
        setOrder(previous);
        done(result);
      }
    });
  }

  return (
    <div className="flex flex-col gap-16">
      {error ? (
        <p role="alert" className="t-body-md text-status-notdone">
          {error}
        </p>
      ) : null}
      <p role="status" className="t-body-sm text-fg-secondary empty:hidden">
        {saved ? t.reorder.saved : null}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-8 rounded-xl border border-line-subtle bg-surface px-24 py-48 text-center">
          <p className="t-title-md text-fg-primary">{t.empty.title}</p>
          <p className="t-body-md text-fg-secondary">{t.empty.body}</p>
        </div>
      ) : (
        <Reorder id={`habits-${frequency}`} ids={order} nameOf={(id) => byId.get(id)?.name ?? ''} onReorder={reorder}>
          <Table aria-label={t.tableLabel[frequency]}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44 px-8">
                  <span className="sr-only">{t.columns.reorder}</span>
                </TableHead>
                <TableHead className="px-16">{t.columns.name}</TableHead>
                <TableHead className="px-16">{t.columns.target}</TableHead>
                <TableHead>{t.columns.kind}</TableHead>
                <TableHead>{t.columns.period}</TableHead>
                <TableHead>
                  <span className="sr-only">{t.columns.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            {rows.map((habit) => (
              <SortableHabit
                key={habit.id}
                habit={habit}
                today={today}
                hijriAdjustment={hijriAdjustment}
                onPatch={patch}
                onDone={done}
              />
            ))}
          </Table>
        </Reorder>
      )}

      {archived.length > 0 ? <ArchivedHabits habits={archived} hijriAdjustment={hijriAdjustment} onDone={done} /> : null}
    </div>
  );
}
