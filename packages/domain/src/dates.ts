const DAY_MS = 86_400_000;

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Pure calendar arithmetic on `YYYY-MM-DD` strings, in UTC (never local time). */
export function addDays(date: string, n: number): string {
  return format(parse(date) + n * DAY_MS);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / DAY_MS);
}

/** Day of week of a date string, 0 = Sunday. */
export function dayOfWeek(date: string): number {
  return new Date(parse(date)).getUTCDay();
}

/** Start of the week containing `date`; mirrors SQL `week_start`. */
export function weekStartFor(date: string, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6): string {
  return addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
}

/** The calendar date of `now` in an IANA time zone, as `YYYY-MM-DD`. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** BR-06: a week stays editable until `graceDays` after its last day (`today <= weekEnd + graceDays`). */
export function isWithinWeeklyGrace(weekEnd: string, today: string, graceDays: number): boolean {
  return today <= addDays(weekEnd, graceDays);
}

/** BR-05: `today - backfillDays <= date <= today`. */
export function isWithinBackfill(date: string, today: string, backfillDays: number): boolean {
  return date <= today && date >= addDays(today, -backfillDays);
}
