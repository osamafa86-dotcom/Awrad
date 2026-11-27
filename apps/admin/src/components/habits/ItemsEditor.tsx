'use client';

import { rectSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { archiveItem, deleteItem, reorderItems, upsertItem } from '@/actions/habits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatGregorian } from '@/lib/format';
import { habitErrorText, NAME_MAX, splitArchived, type HabitItemView, type HabitResult } from '@/lib/habits';
import { ar } from '@/messages/ar';

import { InlineEdit } from './InlineEdit';
import { DragHandle, Reorder, useSortableRow } from './Reorder';
import { RowMenu } from './RowMenu';

const t = ar.habits;

export interface ItemsEditorProps {
  habitId: string;
  habitName: string;
  items: HabitItemView[];
  /** `YYYY-MM-DD` in the admin's zone: the earliest archive day. */
  today: string;
}

function ItemChip({
  item,
  today,
  onRename,
  onDone,
}: {
  item: HabitItemView;
  today: string;
  onRename(item: HabitItemView, name: string | null): Promise<boolean>;
  onDone(result: HabitResult): HabitResult;
}) {
  const { setNodeRef, style, handle } = useSortableRow(item.id);
  return (
    <li
      ref={setNodeRef}
      style={style}
      aria-label={t.items.label(item.name)}
      className="flex items-center gap-4 rounded-md border border-line-subtle bg-surface pe-4"
    >
      <DragHandle handle={handle} name={item.name} />
      <InlineEdit value={item.name} label={t.inline.itemName} onSave={(name) => onRename(item, name)} className="min-w-96" />
      <RowMenu
        name={item.name}
        archive={{
          title: t.archive.itemTitle(item.name),
          minDate: item.activeFrom > today ? item.activeFrom : today,
          run: async (date) => onDone(await archiveItem(item.id, date)),
        }}
        remove={
          item.hasLogs
            ? undefined
            : {
                title: t.remove.title(item.name),
                body: t.remove.itemBody,
                run: async () => onDone(await deleteItem(item.id)),
              }
        }
      />
    </li>
  );
}

/**
 * A checklist's items (a06, BR-07: items have the habit's lifecycle): reorder by dragging, rename in place,
 * «إضافة بند», «أرشفة», and «حذف» for an item nobody checked. Archived items sit in a collapsed list.
 */
export function ItemsEditor({ habitId, habitName, items, today }: ItemsEditorProps) {
  const { active, archived } = splitArchived(items);
  const ids = active.map((item) => item.id);
  const [order, setOrder] = useState(ids);
  const [serverIds, setServerIds] = useState(ids.join());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  if (ids.join() !== serverIds) {
    // The server's order changed (a save, an add, an archive): it replaces the optimistic one.
    setServerIds(ids.join());
    setOrder(ids);
  }
  const byId = new Map(active.map((item) => [item.id, item]));
  const shown = order.flatMap((id) => byId.get(id) ?? []);

  function done(result: HabitResult): HabitResult {
    setError(habitErrorText(result));
    return result;
  }

  async function rename(item: HabitItemView, name: string | null): Promise<boolean> {
    return done(await upsertItem({ id: item.id, name: name ?? '' })).ok;
  }

  function reorder(next: string[]) {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderItems(habitId, next);
      if (!result.ok) {
        setOrder(previous);
        done(result);
      }
    });
  }

  function add() {
    startTransition(async () => {
      const result = done(await upsertItem({ habitId, name: draft }));
      if (result.ok) {
        setDraft('');
        setAdding(false);
      }
    });
  }

  return (
    <section aria-label={`${t.items.title}: ${habitName}`} className="flex flex-col gap-12">
      <p className="t-label-sm text-fg-secondary">{t.items.title}</p>
      <Reorder
        id={`items-${habitId}`}
        ids={order}
        nameOf={(id) => byId.get(id)?.name ?? ''}
        onReorder={reorder}
        strategy={rectSortingStrategy}
      >
        <ul className="flex flex-wrap gap-8">
          {shown.map((item) => (
            <ItemChip key={item.id} item={item} today={today} onRename={rename} onDone={done} />
          ))}
        </ul>
      </Reorder>

      {adding ? (
        <form
          className="flex flex-wrap items-center gap-8"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            aria-label={t.items.addLabel}
            autoFocus
            autoComplete="off"
            maxLength={NAME_MAX}
            className="min-h-44 max-w-320"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAdding(false);
            }}
          />
          <Button type="button" variant="secondary" size="md" onClick={() => setAdding(false)} disabled={pending}>
            {t.items.cancel}
          </Button>
          <Button type="submit" size="md" disabled={pending || !draft.trim()} aria-busy={pending}>
            {t.items.addSubmit}
          </Button>
        </form>
      ) : (
        <Button variant="quiet" size="md" className="self-start px-8" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="size-16" />
          {t.items.add}
        </Button>
      )}

      {error ? (
        <p role="alert" className="t-body-md text-status-notdone">
          {error}
        </p>
      ) : null}

      {archived.length > 0 ? (
        <details className="group">
          <summary className="min-h-44 cursor-pointer content-center t-label-md text-link">
            {t.items.archived(archived.length)}
          </summary>
          <ul className="flex flex-col gap-8 pt-8">
            {archived.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-8 t-body-md text-fg-secondary">
                <span className="text-fg-primary">{item.name}</span>
                <span className="t-body-sm">{t.items.until(formatGregorian(item.activeTo!))}</span>
                <RowMenu
                  name={item.name}
                  remove={
                    item.hasLogs
                      ? undefined
                      : {
                          title: t.remove.title(item.name),
                          body: t.remove.itemBody,
                          run: async () => done(await deleteItem(item.id)),
                        }
                  }
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
