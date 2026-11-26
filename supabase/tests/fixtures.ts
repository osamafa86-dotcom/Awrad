// Loader for the shared JSON fixtures in packages/domain/fixtures (schema: that folder's README.md).
// The same files drive the @awrad/domain TypeScript tests, so the SQL and the TS rules cannot drift.
// Everything is written through save_log as the admin (p_user_id), with app.test_now pinned to the
// case's "today"; attendance goes straight into the tables via the superuser connection.
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { clientAs, createTestGroup, createTestUser, type UserClient } from './helpers';

export type DayState = 'achieved' | 'failed' | 'neutral';
export type EntryStatus = 'done' | 'not_done' | 'not_required';
export type AttendanceStatus = 'present' | 'absent' | 'excused';

/** A tristate entry gives `status`; a checklist entry gives `checkedCount` or `status: not_required`. */
export interface FixtureEntry {
  slug: string;
  status?: EntryStatus;
  checkedCount?: number;
}

export interface StreakCase {
  name: string;
  today: string;
  joinedAt: string;
  days: { date: string; state: DayState }[];
  expect: { longest: number; current: number };
}

export interface DayStatusCase {
  name: string;
  date: string;
  thresholdPct: number;
  entries: FixtureEntry[];
  expect: { state: DayState; completionPct: number | null };
}

export interface SummaryCase {
  name: string;
  today: string;
  joinedAt: string;
  thresholdPct?: number;
  days: { date: string; entries: FixtureEntry[] }[];
  attendance: AttendanceStatus[];
  expect: {
    daysLogged: number;
    completionPct: number | null;
    attendancePct: number | null;
    longestStreak?: number;
    currentStreak?: number;
  };
}

/** The jsonb returned by get_student_summary. */
export interface StudentSummary {
  days_logged: number;
  completion_pct: number | null;
  attendance_pct: number | null;
  longest_streak: number;
  current_streak: number;
  per_habit: {
    habit_id: string;
    slug: string;
    name: string;
    completion_pct: number | null;
  }[];
  weekly: { weeks_logged: number; completion_pct: number | null } | null;
}

function load<T>(file: string): T {
  const url = new URL(`../../packages/domain/fixtures/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export const streakCases = load<StreakCase[]>('streaks.json');
export const dayStatusCases = load<DayStatusCase[]>('day-status.json');
export const summaryCases = load<SummaryCase[]>('summary.json');

/** Noon UTC on `date` = 15:00 in Asia/Riyadh: unambiguously that local day. */
export function noonOf(date: string): string {
  return `${date}T12:00:00Z`;
}

export function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

interface DailyHabit {
  id: string;
  slug: string;
  kind: 'tristate' | 'checklist';
}

/**
 * Writes fixture cases into the database for dedicated students of one group ("FX", Asia/Riyadh)
 * and reads the results back. Needs the shared seedFixture() admin (`admin@test`) to exist.
 */
export class FixtureLoader {
  private seq = 0;

  private constructor(
    private readonly db: pg.Client,
    private readonly admin: UserClient,
    readonly groupId: string,
  ) {}

  static async open(db: pg.Client): Promise<FixtureLoader> {
    const group = await createTestGroup('FX', { timezone: 'Asia/Riyadh' });
    return new FixtureLoader(db, await clientAs('admin@test'), group.id);
  }

  end(): Promise<void> {
    return this.admin.end();
  }

  /** A fresh tracked student of the FX group with the given joined_at. */
  async createStudent(joinedAt: string): Promise<string> {
    this.seq += 1;
    const { id } = await createTestUser({
      email: `fx-student-${this.seq}@test`,
      fullName: `FX Student ${String(this.seq).padStart(3, '0')}`,
      role: 'student',
      groupId: this.groupId,
    });
    await this.db.query('update profiles set joined_at = $2 where id = $1', [id, joinedAt]);
    return id;
  }

  private async dailyHabits(date: string): Promise<DailyHabit[]> {
    const result = await this.db.query<DailyHabit>(
      `select id, slug, kind::text as kind from active_habits_on($1, 'daily')
        order by sort_order, slug`,
      [date],
    );
    return result.rows;
  }

  private async activeItemIds(habitId: string, date: string): Promise<string[]> {
    const result = await this.db.query<{ id: string }>('select id from active_items_on($1, $2)', [
      habitId,
      date,
    ]);
    return result.rows.map((row) => row.id);
  }

  /** Saves one daily log through save_log as the admin, with "today" pinned to `today`. */
  async saveDay(
    userId: string,
    date: string,
    entries: FixtureEntry[],
    today: string,
  ): Promise<void> {
    const habits = await this.dailyHabits(date);
    const payload = [];
    for (const entry of entries) {
      const habit = habits.find((h) => h.slug === entry.slug);
      if (!habit) throw new Error(`fixture: no daily habit ${entry.slug} active on ${date}`);
      if (habit.kind === 'checklist' && entry.status !== 'not_required') {
        const items = await this.activeItemIds(habit.id, date);
        const count = entry.checkedCount ?? 0;
        if (count > items.length)
          throw new Error(`fixture: ${entry.slug} has ${items.length} items`);
        // save_log derives the checklist status from the checked items; 'done' is just a placeholder.
        payload.push({
          habit_id: habit.id,
          status: 'done',
          checked_item_ids: items.slice(0, count),
        });
      } else {
        if (!entry.status) throw new Error(`fixture: ${entry.slug} needs a status`);
        payload.push({ habit_id: habit.id, status: entry.status });
      }
    }
    await this.admin.rpc(
      'save_log',
      {
        p_period: 'daily',
        p_period_start: date,
        p_entries: JSON.stringify(payload),
        p_user_id: userId,
      },
      { settings: { 'app.test_now': noonOf(today) } },
    );
  }

  /**
   * Materializes a day state (README): achieved = every active daily habit done (checklists fully
   * checked); failed = the same but the first tristate habit by sort_order (quran_wird) not_done;
   * neutral = every habit not_required. `overrides` sets a tristate habit's status by slug.
   */
  async saveState(
    userId: string,
    date: string,
    state: DayState,
    today: string,
    overrides: Record<string, EntryStatus> = {},
  ): Promise<void> {
    // dailyHabits() is ordered by sort_order, so this is the first tristate habit (quran_wird)
    const habits = await this.dailyHabits(date);
    const failing = habits.find((h) => h.kind === 'tristate');
    const entries: FixtureEntry[] = [];
    for (const habit of habits) {
      if (state === 'neutral') {
        entries.push({ slug: habit.slug, status: 'not_required' });
      } else if (habit.kind === 'checklist') {
        const items = await this.activeItemIds(habit.id, date);
        entries.push({ slug: habit.slug, checkedCount: items.length });
      } else {
        const status = state === 'failed' && habit === failing ? 'not_done' : 'done';
        entries.push({
          slug: habit.slug,
          status: overrides[habit.slug] ?? status,
        });
      }
    }
    await this.saveDay(userId, date, entries, today);
  }

  /** One attendance row per status, at a shared session dated `today - i` (README). */
  async addAttendance(userId: string, statuses: AttendanceStatus[], today: string): Promise<void> {
    for (const [i, status] of statuses.entries()) {
      const session = await this.db.query<{ id: string }>(
        'insert into sessions (group_id, session_date, title) values (null, $1, $2) returning id',
        [minusDays(today, i), 'fixture session'],
      );
      await this.db.query(
        'insert into attendance (session_id, user_id, status) values ($1, $2, $3)',
        [session.rows[0]!.id, userId, status],
      );
    }
  }

  /** Runs `fn` with app setting streak_threshold_pct = pct, restoring the old value afterwards. */
  async withThreshold<T>(pct: number | undefined, fn: () => Promise<T>): Promise<T> {
    if (pct === undefined) return fn();
    const old = await this.db.query<{ value: unknown }>(
      `select value from app_settings where key = 'streak_threshold_pct'`,
    );
    await this.db.query(`update app_settings set value = $1 where key = 'streak_threshold_pct'`, [
      JSON.stringify(pct),
    ]);
    try {
      return await fn();
    } finally {
      await this.db.query(`update app_settings set value = $1 where key = 'streak_threshold_pct'`, [
        JSON.stringify(old.rows[0]!.value),
      ]);
    }
  }

  summary(
    userId: string,
    today: string,
    range: { from?: string; to?: string } = {},
  ): Promise<StudentSummary> {
    return this.admin.rpc<StudentSummary>(
      'get_student_summary',
      { p_user_id: userId, p_from: range.from ?? null, p_to: range.to ?? null },
      { settings: { 'app.test_now': noonOf(today) } },
    );
  }

  /** The v_day_status row of one day (null = no row, i.e. missing), read as the admin. */
  async dayStatus(
    userId: string,
    date: string,
  ): Promise<{ state: string; completion_pct: number | null } | null> {
    const result = await this.admin.query<{
      state: string;
      completion_pct: string | null;
    }>('select state, completion_pct from v_day_status where user_id = $1 and log_date = $2', [
      userId,
      date,
    ]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      state: row.state,
      completion_pct: row.completion_pct === null ? null : Number(row.completion_pct),
    };
  }
}
