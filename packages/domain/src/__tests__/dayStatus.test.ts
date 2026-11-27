import { describe, expect, test } from 'vitest';
import { activeHabitsOn, computeDayStatus, isActiveOn } from '../dayStatus';
import { catalogue, loadFixture, toEntries, type FixtureEntry } from './helpers';

interface DayCase {
  name: string;
  date: string;
  thresholdPct: number;
  entries: FixtureEntry[];
  expect: { state: 'achieved' | 'failed' | 'neutral'; completionPct: number | null };
}

const cases = loadFixture<DayCase[]>('day-status.json');

describe('computeDayStatus matches the shared fixture', () => {
  test.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(computeDayStatus(catalogue, toEntries(c.entries), c.date, c.thresholdPct)).toEqual(c.expect);
  });
});

describe('active windows', () => {
  test('isActiveOn is inclusive on both ends', () => {
    const d = { activeFrom: '2026-11-01', activeTo: '2026-11-10' };
    expect(isActiveOn(d, '2026-10-31')).toBe(false);
    expect(isActiveOn(d, '2026-11-01')).toBe(true);
    expect(isActiveOn(d, '2026-11-10')).toBe(true);
    expect(isActiveOn(d, '2026-11-11')).toBe(false);
    expect(isActiveOn({ activeFrom: '2026-11-01', activeTo: null }, '2030-01-01')).toBe(true);
  });
  test('activeHabitsOn filters by date and frequency', () => {
    const [first, ...rest] = catalogue;
    if (!first) throw new Error('empty catalogue');
    const habits = [{ ...first, activeTo: '2026-01-01' }, ...rest, { ...first, id: 'w', frequency: 'weekly' as const }];
    const ids = activeHabitsOn(habits, '2026-11-26', 'daily').map((h) => h.slug);
    expect(ids).toEqual(['adhkar', 'qiyam', 'tafsir_ibn_juzayy', 'sahihayn']);
  });
  test('entries of habits inactive on the date are ignored', () => {
    const [first, ...rest] = catalogue;
    if (!first) throw new Error('empty catalogue');
    const ended = { ...first, activeTo: '2026-01-01' };
    const entries = toEntries([{ slug: 'quran_wird', status: 'not_done' }, { slug: 'qiyam', status: 'done' }]);
    expect(computeDayStatus([ended, ...rest], entries, '2026-11-26', 100)).toEqual({
      state: 'achieved',
      completionPct: 100,
    });
  });
});
