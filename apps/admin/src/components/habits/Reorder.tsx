'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { moveId } from '@/lib/habits';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

const t = ar.habits.reorder;

export interface ReorderProps {
  /** Stable per list, so the server and client agree on the ARIA ids dnd-kit generates. */
  id: string;
  ids: string[];
  /** The name each id is announced by. */
  nameOf(id: string): string;
  /** The new order after a drop that moved something. */
  onReorder(ids: string[]): void;
  strategy?: SortingStrategy;
  children: ReactNode;
}

/**
 * Drag-to-reorder (a06) with a pointer or the keyboard (Space/Enter to pick up, arrows to move, Space/Enter
 * to drop, Esc to cancel), announced in Arabic. Only the handles start a drag.
 */
export function Reorder({ id, ids, nameOf, onReorder, strategy = verticalListSortingStrategy, children }: ReorderProps) {
  const sensors = useSensors(
    // A few pixels of movement before a drag, so a click on the handle is just a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const position = (itemId: string | number) => ids.indexOf(String(itemId)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t.picked(nameOf(String(active.id)), position(active.id), ids.length),
    onDragOver: ({ active, over }) =>
      over ? t.moved(nameOf(String(active.id)), position(over.id), ids.length) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t.dropped(nameOf(String(active.id)), position(over.id), ids.length) : undefined,
    onDragCancel: ({ active }) => t.cancelled(nameOf(String(active.id))),
  };

  function end({ active, over }: DragEndEvent) {
    if (!over) return;
    const next = moveId(ids, String(active.id), String(over.id));
    if (next !== ids) onReorder(next);
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.instructions } }}
      onDragEnd={end}
    >
      <SortableContext items={ids} strategy={strategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** useSortable for one row or chip: the node to move, its style while moving and the handle's props. */
export function useSortableRow(id: string) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    attributes: { roleDescription: t.roleDescription },
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 1 : undefined,
  };
  return { setNodeRef, style, isDragging, handle: { ref: setActivatorNodeRef, attributes, listeners } };
}

export type SortableHandle = ReturnType<typeof useSortableRow>['handle'];

/** The drag handle (⠿): a 44px button named after what it moves. */
export function DragHandle({ handle, name, className }: { handle: SortableHandle; name: string; className?: string }) {
  return (
    <button
      type="button"
      ref={handle.ref}
      {...handle.attributes}
      {...handle.listeners}
      aria-label={t.handle(name)}
      className={cn(
        'flex size-44 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-secondary',
        'outline-none hover:bg-action-tint focus-visible:ring-2 focus-visible:ring-line-focus active:cursor-grabbing',
        className,
      )}
    >
      <GripVertical aria-hidden="true" className="size-20" />
    </button>
  );
}
