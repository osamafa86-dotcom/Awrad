import { addDays, dayOfWeek } from '@awrad/domain';

/** `YYYY-MM` of a `YYYY-MM-DD` date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 0, m ?? 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * The month as calendar weeks of seven cells starting on `weekStartsOn` (0 = Sunday); cells outside the
 * month are null.
 */
export function monthWeeks(month: string, weekStartsOn: number): Array<Array<string | null>> {
  const { from, to } = monthBounds(month);
  const cells: Array<string | null> = Array<null>((dayOfWeek(from) - weekStartsOn + 7) % 7).fill(null);
  for (let date = from; date <= to; date = addDays(date, 1)) cells.push(date);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The month `delta` months after a `YYYY-MM` month (negative: before). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The student page's calendar month (F-61, Ruling FIN-1) from its `?month=YYYY-MM` parameter: anything malformed
 * is the current month, and the month is kept between the joined month and the current one. `prev`/`next` are
 * the neighbouring months inside that range, or null at either end.
 */
export function resolveStudentMonth(
  param: unknown,
  today: string,
  joinedAt: string,
): { month: string; prev: string | null; next: string | null } {
  const current = monthOf(today);
  const first = monthOf(joinedAt) < current ? monthOf(joinedAt) : current;
  const asked = typeof param === 'string' && MONTH.test(param) ? param : current;
  const month = asked > current ? current : asked < first ? first : asked;
  return {
    month,
    prev: month > first ? shiftMonth(month, -1) : null,
    next: month < current ? shiftMonth(month, 1) : null,
  };
}
