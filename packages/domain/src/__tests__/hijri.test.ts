import { describe, expect, test } from 'vitest';
import { toHijri } from '../hijri';

describe('toHijri', () => {
  test('1 Ramadan 1446', () => {
    expect(toHijri('2025-03-01')).toEqual({
      year: 1446,
      month: 9,
      day: 1,
      monthName: 'رمضان',
      formatted: '1 رمضان 1446هـ',
    });
  });
  test('10 Dhu al-Hijjah 1446', () => {
    expect(toHijri('2025-06-06')).toMatchObject({ year: 1446, month: 12, day: 10, monthName: 'ذو الحجة' });
  });
  test('adjustment shifts the Gregorian date first', () => {
    expect(toHijri('2025-03-01', 1).day).toBe(2);
    expect(toHijri('2025-03-01', -1)).toMatchObject({ year: 1446, month: 8 });
  });
  test('a recent date', () => {
    expect(toHijri('2026-11-26').formatted).toBe('16 جمادى الآخرة 1448هـ');
  });
});
