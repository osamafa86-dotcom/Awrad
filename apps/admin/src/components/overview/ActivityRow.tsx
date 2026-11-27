import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { Avatar } from '@/components/Avatar';
import { DayStateCell } from '@/components/DayStateCell';
import { formatDayMonth } from '@/lib/format';
import type { OverviewRow } from '@/lib/overview';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

const t = ar.overview;
const cellLabel = ar.students.detail;

/**
 * The name column: sticky at the inline start so it stays in view while the days scroll (a20). On a phone
 * it is a fixed 192 wide (names wrap inside it); from md it takes the free width of the row.
 */
export const NAME_COLUMN = 'sticky start-0 z-10 w-192 min-w-192 md:w-full md:min-w-240 bg-surface';

/**
 * DESIGN.md §6 `ActivityRow`: one person × 14 day cells (the four states by shape), then the current
 * streak (⚠ beside it when the person has not logged for three days) and the completion. The name wraps,
 * never clips, and opens the student page.
 */
export function ActivityRow({ row }: { row: OverviewRow }) {
  // The row's own today: its group's (rows of other zones may end a day apart).
  const today = row.cells.at(-1)?.date;
  return (
    <tr data-inactive={row.inactive ? 'true' : 'false'} className="border-b border-line-subtle align-middle">
      <th scope="row" className={cn(NAME_COLUMN, 'px-16 py-12 text-start font-normal')}>
        <span className="flex items-center gap-12">
          <Avatar name={row.fullName} />
          <span className="flex min-w-0 flex-col">
            <Link
              href={`/students/${row.userId}`}
              className="block rounded-sm break-words t-body-strong text-fg-primary outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-line-focus"
            >
              {row.fullName}
            </Link>
            <span className="t-caption text-fg-secondary">{row.groupName}</span>
          </span>
        </span>
      </th>
      {row.cells.map((cell) => {
        const label = cellLabel.state[cell.state];
        const isToday = cell.date === today;
        return (
          <td key={cell.date} className="px-2 py-12">
            <DayStateCell
              size="sm"
              state={cell.state}
              date={cell.date}
              isToday={isToday}
              label={cellLabel.cellLabel(formatDayMonth(cell.date), isToday ? cellLabel.todaySuffix(label) : label)}
              title={label}
            />
          </td>
        );
      })}
      <td className="px-16 py-12 text-center">
        <span className="inline-flex items-center gap-4 t-number-md text-fg-primary">
          {row.currentStreak ?? t.none}
          {row.inactive ? (
            <TriangleAlert role="img" aria-label={t.inactiveMark} className="size-16 shrink-0 text-status-notdone" />
          ) : null}
        </span>
      </td>
      <td className="px-16 py-12 text-center t-number-md text-fg-primary">
        {row.completionPct === null ? t.none : t.pct(row.completionPct)}
      </td>
    </tr>
  );
}
