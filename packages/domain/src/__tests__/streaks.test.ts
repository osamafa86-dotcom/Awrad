import { describe, expect, test } from 'vitest';
import { computeDayStatus } from '../dayStatus';
import { computeStreaks } from '../streaks';
import type { DayState } from '../types';
import { catalogue, loadFixture, toEntries, type FixtureEntry } from './helpers';

interface StreakCase {
  name: string;
  today: string;
  joinedAt: string;
  days: Array<{ date: string; state: DayState }>;
  expect: { longest: number; current: number };
}

describe('computeStreaks matches the shared fixture', () => {
  const cases = loadFixture<StreakCase[]>('streaks.json');
  test.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(computeStreaks(c.days, c.today, c.joinedAt)).toEqual(c.expect);
  });
});

interface SummaryCase {
  name: string;
  today: string;
  joinedAt: string;
  thresholdPct?: number;
  days: Array<{ date: string; entries: FixtureEntry[] }>;
  expect: { daysLogged: number; completionPct: number | null; longestStreak?: number; currentStreak?: number };
}

describe('summary fixture (derived through computeDayStatus)', () => {
  const cases = loadFixture<SummaryCase[]>('summary.json');
  test.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const threshold = c.thresholdPct ?? 100;
    const states = c.days.map((d) => {
      const entries = toEntries(d.entries);
      const status = computeDayStatus(catalogue, entries, d.date, threshold);
      // Re-derive the day's weights independently for the aggregate completion check.
      let required = 0;
      let achieved = 0;
      for (const e of entries) {
        const habit = catalogue.find((h) => h.id === e.habitId);
        if (!habit || e.status === 'not_required') continue;
        required += 1;
        achieved +=
          habit.kind === 'checklist' ? (e.checkedItemIds?.length ?? 0) / habit.items.length : e.status === 'done' ? 1 : 0;
      }
      return { date: d.date, state: status.state, required, achieved };
    });
    expect(states.length).toBe(c.expect.daysLogged);
    const totalRequired = states.reduce((s, d) => s + d.required, 0);
    const totalAchieved = states.reduce((s, d) => s + d.achieved, 0);
    const pct = totalRequired === 0 ? null : Math.round((totalAchieved / totalRequired) * 100);
    expect(pct).toBe(c.expect.completionPct);
    const streaks = computeStreaks(states, c.today, c.joinedAt);
    if (c.expect.longestStreak !== undefined) expect(streaks.longest).toBe(c.expect.longestStreak);
    if (c.expect.currentStreak !== undefined) expect(streaks.current).toBe(c.expect.currentStreak);
  });
});
