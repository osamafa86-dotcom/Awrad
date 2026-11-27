import { describe, expect, test } from 'vitest';
import { addDays, isWithinBackfill, todayIn, weekStartFor } from '../dates';

describe('weekStartFor', () => {
  test.each([
    ['2026-11-26', 0, '2026-11-22'],
    ['2026-11-26', 6, '2026-11-21'],
    ['2026-11-22', 0, '2026-11-22'],
    ['2026-11-22', 1, '2026-11-16'],
  ] as const)('weekStartFor(%s, %i) = %s', (date, weekStartsOn, expected) => {
    expect(weekStartFor(date, weekStartsOn)).toBe(expected);
  });
});

describe('todayIn', () => {
  const now = new Date('2026-11-26T22:30:00Z');
  test('Asia/Riyadh is already the next day', () => {
    expect(todayIn('Asia/Riyadh', now)).toBe('2026-11-27');
  });
  test('Europe/London is still the same day', () => {
    expect(todayIn('Europe/London', now)).toBe('2026-11-26');
  });
});

describe('isWithinBackfill', () => {
  test('accepts today and the backfill days before it', () => {
    expect(isWithinBackfill('2026-11-24', '2026-11-26', 2)).toBe(true);
    expect(isWithinBackfill('2026-11-26', '2026-11-26', 2)).toBe(true);
  });
  test('rejects older and future dates', () => {
    expect(isWithinBackfill('2026-11-23', '2026-11-26', 2)).toBe(false);
    expect(isWithinBackfill('2026-11-27', '2026-11-26', 2)).toBe(false);
  });
});

describe('addDays', () => {
  test('crosses month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
