// Overview (F-60): the students × last-14-days grid and its three KPIs. Pure, so the rules are unit-tested
// without Next or Supabase; src/lib/supabase/overview.ts feeds it from get_group_overview.
import { addDays, weekStartFor, type DayState } from '@awrad/domain';

/** The grid's span: the last 14 local days, today included (spec §11.2). */
export const OVERVIEW_DAYS = 14;

export interface OverviewGroup {
  id: string;
  name: string;
  timezone: string;
  /** 0 = Sunday (groups.week_starts_on). */
  weekStartsOn: number;
}

export interface DayCell {
  /** `YYYY-MM-DD` */
  date: string;
  state: DayState;
}

/** One group's get_group_overview rows over its own last `days` days. */
export interface GroupDays {
  group: OverviewGroup;
  /** The group's today (`YYYY-MM-DD`, in its timezone). */
  today: string;
  entries: Array<{ userId: string; fullName: string; date: string; state: DayState }>;
}

export interface OverviewRow {
  userId: string;
  fullName: string;
  groupName: string;
  /** Oldest first; the last cell is the group's today. */
  cells: DayCell[];
  /** From get_student_summary; null when it could not be read. */
  currentStreak: number | null;
  completionPct: number | null;
  /** «منقطع ≥3 أيام» (isInactive): ⚠ on the row. */
  inactive: boolean;
}

/** A row before its summary numbers are added, with the first day of its group's current week. */
export interface AssembledRow extends Omit<OverviewRow, 'currentStreak' | 'completionPct'> {
  weekStart: string;
}

export interface OverviewKpis {
  /** «سجّلوا هذا الأسبوع»: 0–100, rounded; null when nobody is shown. */
  loggedThisWeekPct: number | null;
  /** «منقطعون ≥3 أيام» */
  inactive3DaysCount: number;
  /** «طلبات دعم مفتوحة» */
  openSupportCount: number;
}

/** The `days` dates ending on `today`, oldest first. */
export function periodDates(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
}

/**
 * «منقطع ≥3 أيام» (Ruling INACTIVE-1): the three completed days before today are all unlogged and today
 * is still unlogged. Days before `joinedAt` are not silence: with fewer than three completed days since
 * joining, nobody is inactive. Without a known `joinedAt` the person is taken as joined long ago.
 */
export function isInactive(cells: DayCell[], today: string, joinedAt?: string | null): boolean {
  if (joinedAt && joinedAt > addDays(today, -3)) return false;
  const state = new Map(cells.map((cell) => [cell.date, cell.state]));
  return [0, 1, 2, 3].every((back) => (state.get(addDays(today, -back)) ?? 'missing') === 'missing');
}

/** At least one logged day (any state but `missing`) from `from` on. */
export function loggedSince(cells: DayCell[], from: string): boolean {
  return cells.some((cell) => cell.date >= from && cell.state !== 'missing');
}

function byGroupThenName(a: AssembledRow, b: AssembledRow): number {
  return a.groupName.localeCompare(b.groupName, 'ar') || a.fullName.localeCompare(b.fullName, 'ar') || a.userId.localeCompare(b.userId);
}

/**
 * One row per person, each with exactly `days` cells on their group's own dates (a day the RPC did not
 * return is `missing`), sorted by group name, then by name. `joinedAt` maps user ids to profiles.joined_at.
 */
export function assembleRows(
  groups: GroupDays[],
  days: number,
  joinedAt: ReadonlyMap<string, string> = new Map(),
): AssembledRow[] {
  const rows: AssembledRow[] = [];
  for (const { group, today, entries } of groups) {
    const dates = periodDates(today, days);
    const weekStart = weekStartFor(today, group.weekStartsOn as Parameters<typeof weekStartFor>[1]);
    const people = new Map<string, { fullName: string; states: Map<string, DayState> }>();
    for (const entry of entries) {
      const person = people.get(entry.userId) ?? { fullName: entry.fullName, states: new Map() };
      person.states.set(entry.date, entry.state);
      people.set(entry.userId, person);
    }
    for (const [userId, person] of people) {
      const cells = dates.map((date) => ({ date, state: person.states.get(date) ?? ('missing' as const) }));
      rows.push({
        userId,
        fullName: person.fullName,
        groupName: group.name,
        cells,
        inactive: isInactive(cells, today, joinedAt.get(userId)),
        weekStart,
      });
    }
  }
  return rows.sort(byGroupThenName);
}

export function computeKpis(rows: AssembledRow[], openSupportCount: number): OverviewKpis {
  const logged = rows.filter((row) => loggedSince(row.cells, row.weekStart)).length;
  return {
    loggedThisWeekPct: rows.length === 0 ? null : Math.round((logged / rows.length) * 100),
    inactive3DaysCount: rows.filter((row) => row.inactive).length,
    openSupportCount,
  };
}

/** `fn` over `items` with at most `limit` calls in flight; results keep the input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** `items` in slices of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}
