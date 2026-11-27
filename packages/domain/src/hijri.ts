import * as umalquraModule from '@umalqura/core';
import { addDays } from './dates';

// why: @umalqura/core ships ESM (`module`: a real default export) and CJS (`main`: `exports.default = fn`
// without `__esModule`). Bundlers, vitest and Metro take the ESM build, where the namespace's `default`
// is the API. A Node/CJS loader (Playwright's TS transform) wraps the CJS exports once more, so the API
// sits one or two `default`s down. Unwrap `default` until the object carries the API's `$`.
type Umalqura = typeof umalquraModule.default;
function unwrapDefault(mod: unknown): Umalqura {
  let current = mod as { $?: unknown; default?: unknown } | undefined;
  for (let depth = 0; depth < 3 && current && current.$ === undefined; depth += 1) {
    current = current.default as typeof current;
  }
  return current as unknown as Umalqura;
}
const umalqura = unwrapDefault(umalquraModule);

export const HIJRI_MONTH_NAMES = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
] as const;

export interface HijriDate {
  year: number;
  month: number;
  day: number;
  monthName: string;
  formatted: string;
}

/** BR-09: Umm al-Qura date; `adjustmentDays` shifts the Gregorian date first. */
export function toHijri(date: string, adjustmentDays = 0): HijriDate {
  const [y, m, d] = addDays(date, adjustmentDays).split('-').map(Number);
  // The library reads local date components; build the Date from the same local components, at noon to stay clear of DST shifts at midnight.
  const { hy, hm, hd } = umalqura.$.gregorianToHijri(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12));
  const monthName = HIJRI_MONTH_NAMES[hm - 1] ?? '';
  return { year: hy, month: hm, day: hd, monthName, formatted: `${hd} ${monthName} ${hy}هـ` };
}
