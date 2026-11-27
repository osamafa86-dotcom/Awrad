import type { DayState } from '@awrad/domain';

import { DayStateCell, type CellState } from '@/components/DayStateCell';
import { formatDayMonth, formatHijriSpan, formatMonthYear } from '@/lib/format';
import { monthBounds, monthWeeks } from '@/lib/month';
import { ar } from '@/messages/ar';

const t = ar.students.detail;

export interface CalendarDay {
  state: DayState;
  completionPct: number | null;
}

export interface MonthCalendarProps {
  /** `YYYY-MM` */
  month: string;
  /** Day states by `YYYY-MM-DD`; a day up to today that is absent is «غير مسجَّل». */
  days: Map<string, CalendarDay>;
  /** The student's today (`YYYY-MM-DD`); later days are «لم يأتِ بعد». */
  today: string;
  weekStartsOn: number;
  hijriAdjustment: number;
}

/**
 * One month of the student's record (a02; the page's ?month=), the same semantics as the mobile MonthCalendar; each day is a
 * DayStateCell (the four states by shape, DESIGN.md §7 rule 2) with its number.
 */
export function MonthCalendar({ month, days, today, weekStartsOn, hijriAdjustment }: MonthCalendarProps) {
  const { from, to } = monthBounds(month);
  return (
    <div className="flex flex-col gap-12 rounded-xl border border-line-subtle bg-surface p-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="t-title-md text-fg-primary">{formatMonthYear(month)}</p>
        <p className="t-body-sm text-fg-secondary">{formatHijriSpan(from, to, hijriAdjustment)}</p>
      </div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{formatMonthYear(month)}</caption>
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, i) => {
              const dow = (weekStartsOn + i) % 7;
              return (
                <th key={i} scope="col" abbr={ar.dates.weekdays[dow]} className="pb-4 t-label-sm text-fg-secondary">
                  {ar.dates.weekdayShort[dow]}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month, weekStartsOn).map((week, row) => (
            <tr key={row}>
              {week.map((date, col) => (
                <td key={date ?? `blank-${col}`} className="p-2 text-center">
                  {date ? <Cell date={date} day={days.get(date)} today={today} /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ date, day, today }: { date: string; day: CalendarDay | undefined; today: string }) {
  const shown: CellState = date > today ? 'future' : (day?.state ?? 'missing');
  const label = t.state[shown];
  const isToday = date === today;
  const pct = day?.completionPct;
  return (
    <DayStateCell
      state={shown}
      date={date}
      isToday={isToday}
      label={t.cellLabel(formatDayMonth(date), isToday ? t.todaySuffix(label) : label)}
      title={pct === null || pct === undefined ? label : `${label} · ${pct}%`}
    >
      {Number(date.slice(8, 10))}
    </DayStateCell>
  );
}
