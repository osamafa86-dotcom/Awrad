import type { TypedClient } from '@awrad/supabase-client';
import { describe, expect, it } from 'vitest';

import { resolveStudentMonth } from '@/lib/month';
import { LOGS_PAGE, parseLogsParam, studentHref } from '@/lib/students';
import { PAGE_SIZE } from '@/lib/supabase/postgrest';
import { loadLogs } from '@/lib/supabase/students';

// Ruling FIN-1 (F-61 «سجلّه كاملًا»): the student page reaches the whole record — any month of the calendar and every
// log, older ones a page at a time — read on the server through the viewer's own client (RLS keeps a supervisor's
// scope).

describe('resolveStudentMonth', () => {
  it('defaults to the current month; there is no next month and the previous one is reachable', () => {
    expect(resolveStudentMonth(undefined, '2026-11-27', '2025-09-01')).toEqual({
      month: '2026-11',
      prev: '2026-10',
      next: null,
    });
  });

  it('accepts a past month and links both ways, across a year boundary', () => {
    expect(resolveStudentMonth('2026-01', '2026-11-27', '2025-09-01')).toEqual({
      month: '2026-01',
      prev: '2025-12',
      next: '2026-02',
    });
  });

  it('stops at the joined month and at the current month; a malformed value falls back to today', () => {
    expect(resolveStudentMonth('2025-09', '2026-11-27', '2025-09-14')).toMatchObject({ month: '2025-09', prev: null });
    expect(resolveStudentMonth('2024-02', '2026-11-27', '2025-09-14').month).toBe('2025-09');
    expect(resolveStudentMonth('2027-03', '2026-11-27', '2025-09-14')).toMatchObject({ month: '2026-11', next: null });
    for (const bad of ['2026-13', '2026-1', 'x', ['2026-10', '2026-09']]) {
      expect(resolveStudentMonth(bad, '2026-11-27', '2025-09-14').month).toBe('2026-11');
    }
  });
});

describe('parseLogsParam / studentHref', () => {
  it('shows one page by default and whole pages otherwise', () => {
    expect(parseLogsParam(undefined)).toBe(LOGS_PAGE);
    expect(parseLogsParam('60')).toBe(60);
    expect(parseLogsParam('61')).toBe(90);
    expect(parseLogsParam('0')).toBe(LOGS_PAGE);
    expect(parseLogsParam('-30')).toBe(LOGS_PAGE);
    expect(parseLogsParam('abc')).toBe(LOGS_PAGE);
  });

  it('keeps the other parameter and leaves defaults out of the URL', () => {
    expect(studentHref('s1', {})).toBe('/students/s1');
    expect(studentHref('s1', { month: '2026-10', logs: LOGS_PAGE })).toBe('/students/s1?month=2026-10');
    expect(studentHref('s1', { month: '2026-10', logs: 60 })).toBe('/students/s1?month=2026-10&logs=60');
  });
});

type Row = Record<string, unknown>;

/** logs + v_day_status behind a minimal PostgREST builder that honours eq/in/range and records ranges. */
function fakeClient(logs: Row[], states: Row[]) {
  const ranges: Array<[number, number]> = [];
  const inSizes: number[] = [];
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let window: [number, number] | null = null;
      const builder = {
        select: () => builder,
        order: () => builder,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          inSizes.push(values.length);
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        range(from: number, to: number) {
          ranges.push([from, to]);
          window = [from, to];
          return builder;
        },
        then(resolve: (r: { data: Row[]; error: null }) => unknown) {
          const rows = (table === 'logs' ? logs : states).filter((row) => filters.every((f) => f(row)));
          const data = window ? rows.slice(window[0], window[1] + 1) : rows;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  // why: only the calls loadLogs makes are faked; the cast stands in for the full typed client.
  return { client: client as unknown as TypedClient, ranges, inSizes };
}

const day = (i: number) => new Date(Date.UTC(2026, 10, 27) - i * 86_400_000).toISOString().slice(0, 10);
const dailyLogs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    user_id: 's1',
    period: 'daily',
    period_start: day(i),
    note: `ملاحظة ${i}`,
    review_text: null,
    support_status: 'none',
  }));

describe('loadLogs (server-side pages)', () => {
  it('returns the first page and says whether older logs exist', async () => {
    const { client, ranges } = fakeClient(dailyLogs(45), [{ user_id: 's1', log_date: day(0), state: 'achieved', completion_pct: 100 }]);
    const result = await loadLogs(client, 's1');
    if (!result.ok) throw new Error('expected rows');
    expect(result.data.rows).toHaveLength(LOGS_PAGE);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.rows[0]).toMatchObject({ periodStart: day(0), state: 'achieved', text: 'ملاحظة 0' });
    expect(ranges).toEqual([[0, LOGS_PAGE]]);
  });

  it('a larger limit reaches the oldest log and then reports no more', async () => {
    const { client } = fakeClient(dailyLogs(45), []);
    const result = await loadLogs(client, 's1', 60);
    if (!result.ok) throw new Error('expected rows');
    expect(result.data.rows).toHaveLength(45);
    expect(result.data.rows.at(-1)?.text).toBe('ملاحظة 44');
    expect(result.data.hasMore).toBe(false);
  });

  it('past PostgREST max_rows it pages, and asks for day states in short id lists', async () => {
    const { client, ranges, inSizes } = fakeClient(dailyLogs(1205), []);
    const result = await loadLogs(client, 's1', 1200);
    if (!result.ok) throw new Error('expected rows');
    expect(result.data.rows).toHaveLength(1200);
    expect(result.data.hasMore).toBe(true);
    expect(ranges).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 1200],
    ]);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(200);
  });
});
