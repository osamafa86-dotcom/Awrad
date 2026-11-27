import umalqura from '@umalqura/core';
import { addDays } from './dates';

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
  // The library reads local date components; build the Date from the same local components.
  const { hy, hm, hd } = umalqura.$.gregorianToHijri(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1));
  const monthName = HIJRI_MONTH_NAMES[hm - 1] ?? '';
  return { year: hy, month: hm, day: hd, monthName, formatted: `${hd} ${monthName} ${hy}هـ` };
}
