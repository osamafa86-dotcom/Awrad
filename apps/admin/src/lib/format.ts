// Dates as the dashboard shows them: Gregorian with Arabic month names and Western digits, and Hijri
// (Umm al-Qura, BR-09) from @awrad/domain, the same pairing as the student app.
import { toHijri } from '@awrad/domain';

import { ar } from '@/messages/ar';

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

/** «26 نوفمبر 2026» for `YYYY-MM-DD`. */
export function formatGregorian(date: string): string {
  return ar.dates.gregorian(...parts(date));
}

/** «26 نوفمبر» for `YYYY-MM-DD`. */
export function formatDayMonth(date: string): string {
  const [, m, d] = parts(date);
  return `${d} ${ar.dates.gregorianMonths[m - 1] ?? ''}`;
}

/** «16 جمادى الآخرة 1448هـ» for `YYYY-MM-DD`, shifted by the hijri_adjustment_days setting. */
export function formatHijri(date: string, adjustmentDays = 0): string {
  return toHijri(date, adjustmentDays).formatted;
}

/** «نوفمبر 2026» for `YYYY-MM`. */
export function formatMonthYear(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return ar.dates.monthYear(y ?? 0, m ?? 1);
}

/** The Hijri month(s) a span covers: «جمادى الأولى – جمادى الآخرة 1448» (as the mobile calendar). */
export function formatHijriSpan(start: string, end: string, adjustmentDays = 0): string {
  const a = toHijri(start, adjustmentDays);
  const b = toHijri(end, adjustmentDays);
  if (a.year !== b.year) return `${a.monthName} ${a.year} – ${b.monthName} ${b.year}`;
  return `${a.month === b.month ? a.monthName : `${a.monthName} – ${b.monthName}`} ${b.year}`;
}
