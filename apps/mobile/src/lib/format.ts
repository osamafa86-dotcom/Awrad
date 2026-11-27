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
