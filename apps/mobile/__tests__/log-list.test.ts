jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../src/hooks/SessionProvider', () => ({ useAppSession: () => ({ session: null }) }));

import { calendarChunks } from '../src/hooks/useLogList';

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY + 1;
const add = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

describe('calendarChunks', () => {
  test.each([
    [1, 1],
    [62, 1],
    [63, 2],
    [124, 2],
    [125, 3],
  ])('%i days → %i chunk(s), contiguous, inclusive, each <= 62 days', (span, count) => {
    const from = '2026-01-01';
    const to = add(from, span - 1);
    const chunks = calendarChunks(from, to);
    expect(chunks).toHaveLength(count);
    expect(chunks[0]![0]).toBe(from);
    expect(chunks.at(-1)![1]).toBe(to);
    chunks.forEach(([a, b], i) => {
      expect(days(a, b)).toBeLessThanOrEqual(62);
      if (i > 0) expect(a).toBe(add(chunks[i - 1]![1], 1));
    });
  });
});
