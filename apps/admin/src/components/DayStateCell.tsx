import type { DayState } from '@awrad/domain';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type CellState = DayState | 'future';

export interface DayStateCellProps {
  state: CellState;
  /** The accessible name: the day and its state («26 نوفمبر: مُنجَز»). */
  label: string;
  /** Hover text; defaults to nothing. */
  title?: string;
  /** `YYYY-MM-DD`, exposed as data-date. */
  date?: string;
  isToday?: boolean;
  /** md: the month calendar (a02); sm: the overview grid (a01). */
  size?: 'md' | 'sm';
  /** Shown inside the glyph (the calendar's day number). */
  children?: ReactNode;
}

/**
 * One day's state glyph, the same everywhere in the dashboard. The four day states differ by shape
 * (DESIGN.md §7 rule 2): achieved = filled square, failed = hatched outline, neutral = grey outline,
 * missing = a dot (under the number when there is one); future days are dimmed and today has a ring.
 * No gold here: gold is for completion marks only.
 */
export function DayStateCell({ state, label, title, date, isToday = false, size = 'md', children }: DayStateCellProps) {
  return (
    <span
      role="img"
      data-state={state}
      data-date={date}
      aria-label={label}
      title={title}
      className={cn(
        'mx-auto flex items-center justify-center rounded-md border-2',
        size === 'md' ? 'size-40' : 'size-32',
        isToday ? 'border-line-focus' : 'border-transparent',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex flex-col items-center justify-center rounded-sm t-label-md',
          size === 'md' ? 'size-32' : 'size-24',
          state === 'achieved' && 'bg-status-done-fill text-on-primary',
          state === 'failed' && 'cal-hatch border border-status-done-hatch text-fg-primary',
          state === 'neutral' && 'border-2 border-status-neutral text-fg-secondary',
          state === 'missing' && 'text-fg-primary',
          state === 'future' && 'text-fg-tertiary',
        )}
      >
        {children}
        {state === 'missing' ? <span className="size-4 rounded-full bg-status-missing" /> : null}
      </span>
    </span>
  );
}
