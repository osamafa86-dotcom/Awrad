// In-memory stand-in for the subset of the Supabase client the app uses: the jest suites drive it
// directly, and preview mode (PREVIEW-2, EXPO_PUBLIC_PREVIEW=1) serves it instead of the real client so
// every screen can be rendered and screenshotted with fixture data. Dev-only: Metro blocks this folder
// unless preview mode is on (metro.config.js).
import {
  addDays,
  computeDayStatus,
  computeStreaks,
  isActiveOn,
  type DayState,
  type EntryInput,
  type EntryStatus,
  type HabitDef,
} from '@awrad/domain';
import type { TypedClient } from '@awrad/supabase-client';

import { localToday, setNowOverride } from '../lib/clock';
import { PREVIEW_NOW, seedPreviewDb } from './fixtures';

export interface FakeLogRow {
  id: string;
  user_id: string;
  period: 'daily' | 'weekly';
  period_start: string;
  note: string | null;
  review_text?: string | null;
  support_request_text?: string | null;
  updated_at?: string;
  log_entries: Array<{
    id: string;
    habit_id: string;
    status: EntryStatus;
    log_entry_items: Array<{ entry_id: string; habit_item_id: string }>;
  }>;
}

export interface FakeSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: { id: string; aud: string; role: string; email: string; app_metadata: object; user_metadata: object; created_at: string };
}

interface FakeCall {
  table: string;
  filters: Record<string, unknown>;
  select?: string;
  order?: [string, unknown];
  range?: [number, number];
}

export interface FakeDb {
  settings: Array<{ key: string; value: unknown }>;
  group: { timezone: string; week_starts_on: number; id?: string; name?: string } | null;
  /** Keyed freely (tests use the date; the preview uses `period:date`); rows carry period + period_start. */
  logs: Record<string, FakeLogRow>;
  /** Every `from(table)` read, for assertions. */
  calls: FakeCall[];
  /** `true` fails every list read of `logs`; a number fails only the page whose range starts there. */
  failLogList: boolean | number;
  /** Habit definitions served by `from('habits')` (fetchActiveHabits). */
  habits: HabitDef[];
  profile: Record<string, unknown> | null;
  pushTokens: Array<Record<string, unknown>>;
  deletionRequests: Array<{ id: string; user_id: string; handled_at: string | null }>;
  attendance: Array<{ session_date: string; status: 'present' | 'absent' | 'excused' }>;
  /** The signed-in session served by `auth` (null = signed out). */
  session: FakeSession | null;
}

/** In-memory tables read by the fake client. */
export const fakeDb: FakeDb = {
  settings: [],
  group: null,
  logs: {},
  calls: [],
  failLogList: false,
  habits: [],
  profile: null,
  pushTokens: [],
  deletionRequests: [],
  attendance: [],
  session: null,
};

export function resetFakeDb(): void {
  fakeDb.settings = [
    { key: 'backfill_days', value: 2 },
    { key: 'streak_threshold_pct', value: 100 },
    { key: 'hijri_adjustment_days', value: 0 },
    { key: 'weekly_grace_days', value: 3 },
  ];
  fakeDb.group = { timezone: 'Asia/Riyadh', week_starts_on: 0 };
  fakeDb.logs = {};
  fakeDb.calls = [];
  fakeDb.failLogList = false;
  fakeDb.habits = [];
  fakeDb.profile = null;
  fakeDb.pushTokens = [];
  fakeDb.deletionRequests = [];
  fakeDb.attendance = [];
  fakeDb.session = null;
}

type Result = { data: unknown; error: unknown };
const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });

function findLog(period: unknown, periodStart: unknown): FakeLogRow | undefined {
  return Object.values(fakeDb.logs).find(
    (l) => l.period_start === periodStart && (period === undefined || l.period === period),
  );
}

function habitRow(h: HabitDef) {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    target_text: h.targetText,
    frequency: h.frequency,
    kind: h.kind,
    sort_order: h.sortOrder,
    active_from: h.activeFrom,
    active_to: h.activeTo,
    habit_items: h.items.map((i) => ({
      id: i.id,
      habit_id: h.id,
      name: i.name,
      sort_order: i.sortOrder,
      active_from: i.activeFrom,
      active_to: i.activeTo,
    })),
  };
}

/** Minimal chainable stand-in for the PostgREST query builder. */
function builder(table: string) {
  const call: FakeCall = { table, filters: {} };
  fakeDb.calls.push(call);
  let op: 'select' | 'update' | 'delete' | 'upsert' = 'select';
  let payload: Record<string, unknown> = {};
  let onDate: string | null = null;

  const result = (): Result => {
    switch (table) {
      case 'app_settings':
        return ok(fakeDb.settings);
      case 'groups':
        return ok(fakeDb.group);
      case 'habits':
        return ok(
          fakeDb.habits
            .filter((h) => h.frequency === call.filters.frequency && (onDate === null || isActiveOn(h, onDate)))
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(habitRow),
        );
      case 'logs': {
        if (call.range) {
          const [from, to] = call.range;
          if (fakeDb.failLogList === true || fakeDb.failLogList === from) return fail('boom');
          const rows = Object.values(fakeDb.logs)
            .filter((l) => l.period === call.filters.period)
            .sort((a, b) => b.period_start.localeCompare(a.period_start))
            .slice(from, to + 1);
          return ok(rows);
        }
        return ok(findLog(call.filters.period, call.filters.period_start) ?? null);
      }
      case 'profiles':
        if (op === 'update') {
          if (fakeDb.profile) fakeDb.profile = { ...fakeDb.profile, ...payload };
          return ok(null);
        }
        return fakeDb.profile ? ok(fakeDb.profile) : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
      case 'push_tokens':
        if (op === 'upsert') {
          fakeDb.pushTokens = [...fakeDb.pushTokens.filter((t) => t.token !== payload.token), payload];
          return ok(null);
        }
        if (op === 'delete') {
          fakeDb.pushTokens = fakeDb.pushTokens.filter((t) => t.user_id !== call.filters.user_id);
          return ok(null);
        }
        return ok(fakeDb.pushTokens.filter((t) => t.user_id === call.filters.user_id));
      case 'deletion_requests':
        return ok(fakeDb.deletionRequests.filter((d) => d.user_id === call.filters.user_id && d.handled_at === null));
      default:
        return fail(`unexpected table ${table}`);
    }
  };

  const b = {
    select(columns?: string) {
      call.select = columns;
      return b;
    },
    update(patch: Record<string, unknown>) {
      op = 'update';
      payload = patch;
      return b;
    },
    upsert(row: Record<string, unknown>) {
      op = 'upsert';
      payload = row;
      return b;
    },
    delete() {
      op = 'delete';
      return b;
    },
    eq(column: string, value: unknown) {
      call.filters[column] = value;
      return b;
    },
    in(column: string, values: unknown) {
      call.filters[column] = values;
      return b;
    },
    is(column: string, value: unknown) {
      call.filters[column] = value;
      return b;
    },
    lte(column: string, value: unknown) {
      call.filters[column] = value;
      if (column === 'active_from' && typeof value === 'string') onDate = value;
      return b;
    },
    or(filter: string) {
      call.filters.or = filter;
      return b;
    },
    order(column: string, options?: unknown) {
      call.order = [column, options];
      return b;
    },
    range(from: number, to: number) {
      call.range = [from, to];
      return b;
    },
    limit() {
      return b;
    },
    maybeSingle: async () => result(),
    single: async () => result(),
    then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
      return Promise.resolve(result()).then(resolve, reject);
    },
  };
  return b;
}

// ───────────────────────────── RPCs (emulating migrations 0006/0007) ─────────────────────────────

function thresholdPct(): number {
  const v = fakeDb.settings.find((s) => s.key === 'streak_threshold_pct')?.value;
  return typeof v === 'number' ? v : 100;
}

function studentToday(): string {
  const tz = (fakeDb.profile?.timezone as string | null | undefined) ?? fakeDb.group?.timezone ?? 'Asia/Riyadh';
  return localToday(tz);
}

const entriesOf = (log: FakeLogRow): EntryInput[] =>
  log.log_entries.map((e) => ({
    habitId: e.habit_id,
    status: e.status,
    checkedItemIds: e.log_entry_items.map((i) => i.habit_item_id),
  }));

/** Weights of one log's entries (achieved/required per habit), as v_entry_weights. */
function weights(log: FakeLogRow): Array<{ habitId: string; achieved: number; required: number }> {
  const out: Array<{ habitId: string; achieved: number; required: number }> = [];
  for (const e of log.log_entries) {
    if (e.status === 'not_required') continue;
    const habit = fakeDb.habits.find((h) => h.id === e.habit_id);
    let achieved = e.status === 'done' ? 1 : 0;
    if (habit?.kind === 'checklist') {
      const active = habit.items.filter((i) => isActiveOn(i, log.period_start));
      const checked = new Set(e.log_entry_items.map((i) => i.habit_item_id));
      achieved = active.length === 0 ? 1 : active.filter((i) => checked.has(i.id)).length / active.length;
    }
    out.push({ habitId: e.habit_id, achieved, required: 1 });
  }
  return out;
}

const pct = (achieved: number, required: number): number | null =>
  required === 0 ? null : Math.round((achieved * 100) / required);

function dayStates(): Map<string, { state: DayState; completionPct: number | null }> {
  const out = new Map<string, { state: DayState; completionPct: number | null }>();
  for (const log of Object.values(fakeDb.logs)) {
    if (log.period !== 'daily') continue;
    out.set(log.period_start, computeDayStatus(fakeDb.habits, entriesOf(log), log.period_start, thresholdPct()));
  }
  return out;
}

function studentSummary(args: Record<string, unknown>) {
  const from = (args.p_from as string | null) ?? null;
  const to = (args.p_to as string | null) ?? null;
  const inRange = (d: string) => (from === null || d >= from) && (to === null || d <= to);
  const today = studentToday();
  const joined = (fakeDb.profile?.joined_at as string | undefined) ?? today;
  const states = dayStates();
  const streaks = computeStreaks(
    [...states].map(([date, s]) => ({ date, state: s.state })),
    today,
    joined,
  );
  const logs = Object.values(fakeDb.logs).filter((l) => inRange(l.period_start));
  const daily = logs.filter((l) => l.period === 'daily');
  const weekly = logs.filter((l) => l.period === 'weekly');
  const sum = (rows: FakeLogRow[], habitId?: string) => {
    let a = 0;
    let r = 0;
    for (const l of rows)
      for (const w of weights(l))
        if (!habitId || w.habitId === habitId) {
          a += w.achieved;
          r += w.required;
        }
    return pct(a, r);
  };
  const perHabit = fakeDb.habits
    .filter((h) => h.frequency === 'daily' && daily.some((l) => l.log_entries.some((e) => e.habit_id === h.id && e.status !== 'not_required')))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((h) => ({ habit_id: h.id, slug: h.slug, name: h.name, completion_pct: sum(daily, h.id) }));
  const att = fakeDb.attendance.filter((a) => a.session_date >= joined && inRange(a.session_date));
  const present = att.filter((a) => a.status === 'present').length;
  const counted = att.filter((a) => a.status !== 'excused').length;
  return {
    days_logged: daily.length,
    completion_pct: sum(daily),
    attendance_pct: pct(present, counted),
    longest_streak: streaks.longest,
    current_streak: streaks.current,
    per_habit: perHabit,
    weekly: weekly.length === 0 ? null : { weeks_logged: weekly.length, completion_pct: sum(weekly) },
  };
}

function calendar(args: Record<string, unknown>) {
  const from = String(args.p_from);
  const to = String(args.p_to);
  const today = studentToday();
  const states = dayStates();
  const rows: Array<{ log_date: string; state: DayState; completion_pct: number | null }> = [];
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    const s = states.get(d);
    rows.push({ log_date: d, state: s?.state ?? 'missing', completion_pct: s?.completionPct ?? null });
  }
  return rows;
}

function saveLog(args: Record<string, unknown>): string {
  const period = args.p_period as 'daily' | 'weekly';
  const periodStart = String(args.p_period_start);
  const existing = findLog(period, periodStart);
  const id = existing?.id ?? `log-${period}-${periodStart}`;
  const entries = (args.p_entries as Array<{ habit_id: string; status: EntryStatus; checked_item_ids?: string[] }>) ?? [];
  const userId = (fakeDb.session?.user.id ?? fakeDb.profile?.id ?? '') as string;
  const row: FakeLogRow = {
    id,
    user_id: userId,
    period,
    period_start: periodStart,
    note: (args.p_note as string | null) ?? null,
    review_text: (args.p_review_text as string | null) ?? null,
    support_request_text: (args.p_support_request_text as string | null) ?? null,
    updated_at: new Date().toISOString(),
    log_entries: entries.map((e) => ({
      id: `${id}-${e.habit_id}`,
      habit_id: e.habit_id,
      status: e.status,
      log_entry_items: (e.checked_item_ids ?? []).map((itemId) => ({ entry_id: `${id}-${e.habit_id}`, habit_item_id: itemId })),
    })),
  };
  const key = Object.keys(fakeDb.logs).find((k) => fakeDb.logs[k] === existing) ?? `${period}:${periodStart}`;
  fakeDb.logs[key] = row;
  return id;
}

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
  switch (fn) {
    case 'save_log':
      return ok(saveLog(args));
    case 'get_student_summary':
      return ok(studentSummary(args));
    case 'get_calendar':
      return ok(calendar(args));
    case 'request_account_deletion': {
      const id = `del-${fakeDb.deletionRequests.length + 1}`;
      fakeDb.deletionRequests.push({ id, user_id: fakeDb.session?.user.id ?? '', handled_at: null });
      return ok(id);
    }
    default:
      return fail(`unexpected rpc ${fn}`);
  }
}

// ───────────────────────────── auth ─────────────────────────────

type AuthListener = (event: string, session: FakeSession | null) => void;
const listeners = new Set<AuthListener>();

function emit(event: string): void {
  for (const l of listeners) l(event, fakeDb.session);
}

const auth = {
  getSession: async () => ({ data: { session: fakeDb.session }, error: null }),
  onAuthStateChange(listener: AuthListener) {
    listeners.add(listener);
    // supabase-js announces the current session to every new subscriber, asynchronously.
    setTimeout(() => {
      if (listeners.has(listener)) listener('INITIAL_SESSION', fakeDb.session);
    }, 0);
    return { data: { subscription: { unsubscribe: () => void listeners.delete(listener) } } };
  },
  signOut: async () => {
    fakeDb.session = null;
    emit('SIGNED_OUT');
    return { error: null };
  },
  signInWithOtp: async () => ({ data: {}, error: null }),
  verifyOtp: async () => ({ data: { session: fakeDb.session }, error: null }),
};

/** The fake client; `marker` lets a bundle check tell a preview export apart from production. */
export const fakeSupabase = {
  marker: 'fakeSupabase',
  from: (table: string) => builder(table),
  rpc,
  auth,
};

/**
 * Preview mode: seed the tables with the realistic data set, pin "today" to the fixture date and
 * hand out the fake as the app's typed client.
 */
export function createPreviewClient(): TypedClient {
  resetFakeDb();
  seedPreviewDb(fakeDb);
  setNowOverride(PREVIEW_NOW);
  // why: the fake implements only the query-builder/rpc/auth subset the app calls, not the full
  // SupabaseClient surface; every call site goes through those paths (covered by the jest suites).
  return fakeSupabase as unknown as TypedClient;
}
