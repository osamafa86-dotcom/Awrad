import { toHijri } from '@awrad/domain';
import { useId } from 'react';

import { DayStateCell } from '@/components/DayStateCell';
import { formatGregorian, formatHijri } from '@/lib/format';
import type { OverviewRow } from '@/lib/overview';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

import { ActivityRow, NAME_COLUMN } from './ActivityRow';

const t = ar.overview;
const LEGEND = ['achieved', 'failed', 'neutral', 'missing'] as const;

export interface ActivityGridProps {
  rows: OverviewRow[];
  /** The header's 14 dates, oldest first; the last one is today. */
  dates: string[];
  hijriAdjustment: number;
}

/**
 * a01 / a20: the students × last-14-days grid. Each date column has a two-line header (the Hijri day in
 * the display font over the Gregorian day/month); today's column is marked. On a phone the table scrolls
 * sideways inside its box while the name column stays put.
 */
export function ActivityGrid({ rows, dates, hijriAdjustment }: ActivityGridProps) {
  const titleId = useId();
  const today = dates.at(-1);
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line-subtle bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-12 p-24">
        <h2 id={titleId} className="t-title-lg text-fg-primary">
          {t.gridTitle}
        </h2>
        <ul className="flex flex-wrap items-center gap-16" aria-hidden="true">
          {LEGEND.map((state) => (
            <li key={state} className="flex items-center gap-4 t-caption text-fg-secondary">
              <DayStateCell size="sm" state={state} label={ar.dayState[state]} />
              {ar.dayState[state]}
            </li>
          ))}
        </ul>
      </div>
      <div data-overview-scroll className="overflow-x-auto">
        <table aria-labelledby={titleId} className="w-full border-collapse t-body-md text-fg-primary">
          <thead className="bg-sunken">
            <tr className="border-b border-line-subtle">
              <th scope="col" className={cn(NAME_COLUMN, 'bg-sunken px-16 py-12 text-start t-label-sm text-fg-secondary')}>
                {t.columns.student}
              </th>
              {dates.map((date) => {
                const isToday = date === today;
                const [, month, day] = date.split('-').map(Number);
                return (
                  <th
                    key={date}
                    scope="col"
                    data-date={date}
                    data-today={isToday ? 'true' : undefined}
                    abbr={`${formatHijri(date, hijriAdjustment)} — ${formatGregorian(date)}`}
                    title={`${formatHijri(date, hijriAdjustment)} — ${formatGregorian(date)}`}
                    className={cn(
                      // relative: the sr-only «اليوم» is positioned against this cell, so it scrolls (and clips) with the grid.
                      'relative px-2 py-8 text-center align-bottom',
                      isToday ? 'text-link' : 'text-fg-secondary',
                    )}
                  >
                    <span className={cn('flex flex-col items-center rounded-md px-2', isToday && 'bg-action-tint')}>
                      <span data-calendar="hijri" className="t-display-section">
                        {toHijri(date, hijriAdjustment).day}
                      </span>
                      <span data-calendar="gregorian" className="t-number-sm whitespace-nowrap">
                        {`${day}/${month}`}
                      </span>
                      {isToday ? <span className="sr-only">{t.today}</span> : null}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="px-16 py-12 text-center t-label-sm whitespace-nowrap text-fg-secondary">
                {t.columns.streak}
              </th>
              <th scope="col" className="px-16 py-12 text-center t-label-sm whitespace-nowrap text-fg-secondary">
                {t.columns.completion}
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-b-0">
            {rows.map((row) => (
              <ActivityRow key={row.userId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
