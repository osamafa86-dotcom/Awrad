import { addDays, diffDays } from './dates';
import type { DayState } from './types';

/** BR-04 with ruling STREAK-1. Days outside `[joinedAt, today]` are ignored; unlisted days are missing. */
export function computeStreaks(
  days: Array<{ date: string; state: DayState }>,
  today: string,
  joinedAt: string,
): { current: number; longest: number } {
  const byDate = new Map(days.map((d) => [d.date, d.state]));
  const total = diffDays(joinedAt, today) + 1;
  if (total <= 0) return { current: 0, longest: 0 };

  const states: DayState[] = [];
  for (let i = 0; i < total; i += 1) states.push(byDate.get(addDays(joinedAt, i)) ?? 'missing');

  // runAt[i] = achieved-count of the run containing day i, or -1 when day i breaks runs.
  const runAt: number[] = new Array<number>(total).fill(-1);
  let longest = 0;
  let start = 0;
  while (start < total) {
    if (states[start] !== 'achieved' && states[start] !== 'neutral') {
      start += 1;
      continue;
    }
    let end = start;
    let count = 0;
    while (end < total && (states[end] === 'achieved' || states[end] === 'neutral')) {
      if (states[end] === 'achieved') count += 1;
      end += 1;
    }
    for (let i = start; i < end; i += 1) runAt[i] = count;
    longest = Math.max(longest, count);
    start = end;
  }

  const last = total - 1;
  const anchor = states[last] === 'missing' ? last - 1 : last;
  const current = anchor >= 0 ? Math.max(runAt[anchor] ?? 0, 0) : 0;
  return { current, longest };
}
