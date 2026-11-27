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
