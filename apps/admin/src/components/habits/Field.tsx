import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export interface FieldAria {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export interface FieldProps {
  id: string;
  label: string;
  /** The field's error text, or null when valid. */
  error: string | null;
  /** A line under the field (e.g. the date the old habit ends). */
  hint?: ReactNode;
  /** Renders the control with its id and, when invalid, aria-invalid + aria-describedby. */
  children(aria: FieldAria): ReactNode;
}

/** A labelled form control of the habits dialogs with its error line (DESIGN.md §6 TextField). */
export function Field({ id, label, error, hint, children }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-8">
      <Label htmlFor={id}>{label}</Label>
      {children(error ? { id, 'aria-invalid': true, 'aria-describedby': errorId } : { id })}
      {hint ? <p className="t-body-sm text-fg-secondary">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="t-body-sm text-status-notdone">
          {error}
        </p>
      ) : null}
    </div>
  );
}
