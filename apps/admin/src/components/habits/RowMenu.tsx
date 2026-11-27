'use client';

import { Archive, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { HabitResult } from '@/lib/habits';
import { ar } from '@/messages/ar';

import { ArchiveDialog } from './ArchiveDialog';
import { DeleteDialog } from './DeleteDialog';

const t = ar.habits.actions;

export interface RowMenuProps {
  /** What the menu acts on, for its accessible name. */
  name: string;
  /** «أرشفة», for a row still active. */
  archive?: { title: string; minDate: string; run(date: string): Promise<HabitResult> };
  /** «حذف», only for a row no log refers to. */
  remove?: { title: string; body: string; run(): Promise<HabitResult> };
}

/** A row's secondary actions behind «⋯»: «أرشفة» and, without logs, «حذف», each confirmed in a dialog. */
export function RowMenu({ name, archive, remove }: RowMenuProps) {
  const [dialog, setDialog] = useState<'archive' | 'remove' | null>(null);
  if (!archive && !remove) return null;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <>
      {/* why: non-modal, so the dialog opened from an item is not fighting the menu's focus trap on close. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="quiet" size="md" className="w-44 px-0" aria-label={t.more(name)}>
            <MoreHorizontal aria-hidden="true" className="size-20" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {archive ? (
            <DropdownMenuItem onSelect={() => setDialog('archive')}>
              <Archive aria-hidden="true" className="size-16" />
              {t.archive}
            </DropdownMenuItem>
          ) : null}
          {remove ? (
            <DropdownMenuItem variant="danger" onSelect={() => setDialog('remove')}>
              <Trash2 aria-hidden="true" className="size-16" />
              {t.delete}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {archive ? (
        <ArchiveDialog
          open={dialog === 'archive'}
          onOpenChange={close}
          title={archive.title}
          minDate={archive.minDate}
          onConfirm={archive.run}
        />
      ) : null}
      {remove ? (
        <DeleteDialog
          open={dialog === 'remove'}
          onOpenChange={close}
          title={remove.title}
          body={remove.body}
          onConfirm={remove.run}
        />
      ) : null}
    </>
  );
}
