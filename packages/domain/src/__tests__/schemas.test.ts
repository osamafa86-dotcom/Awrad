import { describe, expect, test } from 'vitest';
import { RPC_ERROR_CODES, saveLogSchema } from '../index';

const habitId = '00000000-0000-4000-8000-0000000000a1';
const valid = {
  period: 'daily',
  periodStart: '2026-11-26',
  entries: [{ habitId, status: 'done' }],
};

describe('saveLogSchema', () => {
  test('accepts a valid payload', () => {
    expect(saveLogSchema.safeParse(valid).success).toBe(true);
    expect(
      saveLogSchema.safeParse({
        ...valid,
        note: 'x',
        entries: [{ habitId, status: 'not_done', checkedItemIds: [habitId] }],
      }).success,
    ).toBe(true);
  });
  test.each(['2026-13-01', '2026-1-1', '2026-02-30', '2026-11-26T00:00'])('rejects periodStart %s', (periodStart) => {
    expect(saveLogSchema.safeParse({ ...valid, periodStart }).success).toBe(false);
  });
  test('rejects empty entries', () => {
    expect(saveLogSchema.safeParse({ ...valid, entries: [] }).success).toBe(false);
  });
  test('rejects a non-uuid habitId', () => {
    expect(saveLogSchema.safeParse({ ...valid, entries: [{ habitId: 'nope', status: 'done' }] }).success).toBe(false);
  });
  test('rejects a bad period, status, or over-long text', () => {
    expect(saveLogSchema.safeParse({ ...valid, period: 'monthly' }).success).toBe(false);
    expect(saveLogSchema.safeParse({ ...valid, entries: [{ habitId, status: 'skipped' }] }).success).toBe(false);
    expect(saveLogSchema.safeParse({ ...valid, note: 'x'.repeat(2001) }).success).toBe(false);
  });
});

describe('RPC_ERROR_CODES', () => {
  test('lists the nine codes', () => {
    expect(RPC_ERROR_CODES).toHaveLength(9);
    expect(RPC_ERROR_CODES).toContain('MISSING_ENTRY');
  });
});
