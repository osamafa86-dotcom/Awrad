import { toHijri } from '@awrad/domain';

import { ar } from '../messages/ar';

/** «22 نوفمبر» for a `YYYY-MM-DD` date: Gregorian, Arabic month name, Western digits. */
export function formatDayMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  try {
    const out = new Intl.DateTimeFormat('ar-u-nu-latn', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)));
    // An engine without the locale silently answers in another language/digits.
    if (/[؀-ۿ]/.test(out) && /^\d/.test(out.trim())) return out;
  } catch {
    // fall through to the table
  }
  return `${d ?? 1} ${ar.today.gregorianMonths[(m ?? 1) - 1] ?? ''}`;
}

/** «نوفمبر 2026» for a `YYYY-MM` month: Gregorian, Arabic month name, Western digits. */
export function formatMonthYear(month: string): string {
  return ar.summary.monthYear(month);
}

/**
 * The Hijri month(s) a date span covers (BR-09): «جمادى الأولى 1448», «جمادى الأولى – جمادى الآخرة 1448»,
 * or both years when the span crosses a Hijri New Year.
 */
export function formatHijriSpan(start: string, end: string, adjustmentDays = 0): string {
  const a = toHijri(start, adjustmentDays);
  const b = toHijri(end, adjustmentDays);
  if (a.year !== b.year) return `${a.monthName} ${a.year} – ${b.monthName} ${b.year}`;
  return `${a.month === b.month ? a.monthName : `${a.monthName} – ${b.monthName}`} ${b.year}`;
}
