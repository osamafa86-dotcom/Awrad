'use client';

import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

export interface InlineEditProps {
  value: string | null;
  /** The field's accessible name while editing («اسم العادة»). */
  label: string;
  /** Saves the trimmed text (null when emptied and `allowEmpty`); resolves false on failure. */
  onSave(next: string | null): Promise<boolean>;
  /** Shown instead of an empty value. */
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
}

/**
 * Click-to-edit text (a06, BR-07 rename in place): a button showing the value turns into a field.
 * Enter or leaving the field saves, Esc cancels. The new text shows at once and goes back if the save fails.
 */
export function InlineEdit({ value, label, onSave, placeholder, allowEmpty = false, className }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [optimistic, setOptimistic] = useState<{ text: string | null } | null>(null);
  const [prevValue, setPrevValue] = useState(value);
  // Set when the edit already ended (Enter or Esc), so the blur that follows does not save again.
  const ended = useRef(false);

  if (value !== prevValue) {
    // The server sent the saved value: it replaces the optimistic one.
    setPrevValue(value);
    setOptimistic(null);
  }
  const shown = optimistic ? optimistic.text : value;

  function start() {
    ended.current = false;
    setDraft(shown ?? '');
    setEditing(true);
  }

  async function commit() {
    if (ended.current) return;
    ended.current = true;
    setEditing(false);
    const next = draft.trim() || null;
    if (next === (shown ?? null) || (next === null && !allowEmpty)) return;
    setOptimistic({ text: next });
    if (!(await onSave(next))) setOptimistic(null);
  }

  function cancel() {
    ended.current = true;
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        aria-label={label}
        autoFocus
        className={cn(
          'min-h-44 w-full rounded-md border-2 border-line-focus bg-surface px-8 t-body-md text-fg-primary outline-none',
          className,
        )}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            // Esc ends the edit, not the dialog or drag around it.
            event.stopPropagation();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      title={ar.habits.inline.editHint}
      onClick={start}
      className={cn(
        'min-h-44 w-full rounded-md px-8 text-start break-words outline-none hover:bg-action-tint',
        'focus-visible:ring-2 focus-visible:ring-line-focus',
        shown ? 'text-fg-primary' : 'text-fg-tertiary',
        className,
      )}
    >
      {shown ?? placeholder}
    </button>
  );
}
