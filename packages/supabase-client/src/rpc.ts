import {
  RPC_ERROR_CODES,
  isActiveOn,
  type DayState,
  type Frequency,
  type HabitDef,
  type HabitItemDef,
  type RpcErrorCode,
  type SaveLogInput,
} from "@awrad/domain";
import type { Database, TypedClient } from "./client";

type Fns = Database["public"]["Functions"];

// why: the generated Args mark optional parameters as `string` (never null), but PostgREST drops
// `undefined` keys and a SQL `default` is applied only when the key is absent or null — we send explicit
// nulls, so the arg objects are cast at the single rpc boundary.
function args<K extends keyof Fns>(
  _fn: K,
  value: Record<string, unknown>,
): Fns[K]["Args"] {
  return value as unknown as Fns[K]["Args"];
}

export async function saveLog(
  client: TypedClient,
  input: SaveLogInput,
  userId?: string,
): Promise<string> {
  const { data, error } = await client.rpc(
    "save_log",
    args("save_log", {
      p_period: input.period,
      p_period_start: input.periodStart,
      p_entries: input.entries.map((e) => ({
        habit_id: e.habitId,
        status: e.status,
        ...(e.checkedItemIds ? { checked_item_ids: e.checkedItemIds } : {}),
      })),
      p_note: input.note ?? null,
      p_review_text: input.reviewText ?? null,
      p_support_request_text: input.supportRequestText ?? null,
      p_user_id: userId ?? null,
    }),
  );
  if (error) throw error;
  return data;
}

export interface StudentSummary {
  daysLogged: number;
  completionPct: number | null;
  attendancePct: number | null;
  longestStreak: number;
  currentStreak: number;
  perHabit: Array<{
    habitId: string;
    slug: string;
    name: string;
    completionPct: number | null;
  }>;
  weekly: { weeksLogged: number; completionPct: number | null } | null;
}

interface SummaryJson {
  days_logged: number;
  completion_pct: number | null;
  attendance_pct: number | null;
  longest_streak: number;
  current_streak: number;
  per_habit: Array<{
    habit_id: string;
    slug: string;
    name: string;
    completion_pct: number | null;
  }>;
  weekly: { weeks_logged: number; completion_pct: number | null } | null;
}

export async function getStudentSummary(
  client: TypedClient,
  opts: { userId?: string; from?: string; to?: string } = {},
): Promise<StudentSummary> {
  const { data, error } = await client.rpc(
    "get_student_summary",
    args("get_student_summary", {
      p_user_id: opts.userId ?? null,
      p_from: opts.from ?? null,
      p_to: opts.to ?? null,
    }),
  );
  if (error) throw error;
  // why: the RPC returns untyped jsonb; its shape is fixed by migration 0007.
  const j = data as unknown as SummaryJson;
  return {
    daysLogged: j.days_logged,
    completionPct: j.completion_pct,
    attendancePct: j.attendance_pct,
    longestStreak: j.longest_streak,
    currentStreak: j.current_streak,
    perHabit: j.per_habit.map((h) => ({
      habitId: h.habit_id,
      slug: h.slug,
      name: h.name,
      completionPct: h.completion_pct,
    })),
    weekly: j.weekly
      ? {
          weeksLogged: j.weekly.weeks_logged,
          completionPct: j.weekly.completion_pct,
        }
      : null,
  };
}

export async function getCalendar(
  client: TypedClient,
  userId: string,
  from: string,
  to: string,
): Promise<
  Array<{ date: string; state: DayState; completionPct: number | null }>
> {
  const { data, error } = await client.rpc("get_calendar", {
    p_user_id: userId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.log_date,
    state: r.state as DayState,
    // why: generated type says number; the column is nullable at runtime (missing days).
    completionPct: (r.completion_pct as number | null) ?? null,
  }));
}

export async function getGroupOverview(
  client: TypedClient,
  groupId: string,
  from: string,
  to: string,
): Promise<
  Array<{ userId: string; fullName: string; date: string; state: DayState }>
> {
  const { data, error } = await client.rpc("get_group_overview", {
    p_group_id: groupId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    date: r.log_date,
    state: r.state as DayState,
  }));
}

export async function setAttendance(
  client: TypedClient,
  sessionId: string,
  rows: Array<{ userId: string; status: "present" | "absent" | "excused" }>,
): Promise<number> {
  const { data, error } = await client.rpc("set_attendance", {
    p_session_id: sessionId,
    p_rows: rows.map((r) => ({ user_id: r.userId, status: r.status })),
  });
  if (error) throw error;
  return data;
}

export async function requestAccountDeletion(
  client: TypedClient,
): Promise<string> {
  const { data, error } = await client.rpc("request_account_deletion");
  if (error) throw error;
  return data;
}

type HabitRow = Database["public"]["Tables"]["habits"]["Row"];
type ItemRow = Database["public"]["Tables"]["habit_items"]["Row"];

export async function fetchActiveHabits(
  client: TypedClient,
  date: string,
  frequency: Frequency,
): Promise<HabitDef[]> {
  const { data, error } = await client
    .from("habits")
    .select("*, habit_items(*)")
    .eq("frequency", frequency)
    .lte("active_from", date)
    .or(`active_to.is.null,active_to.gte.${date}`)
    .order("sort_order");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<
    HabitRow & { habit_items: ItemRow[] | null }
  >;
  // habit rows are already filtered/ordered server-side; only embedded items need the date filter.
  const defs: HabitDef[] = rows.map((h) => ({
    id: h.id,
    slug: h.slug,
    name: h.name,
    targetText: h.target_text,
    frequency: h.frequency,
    kind: h.kind,
    sortOrder: h.sort_order,
    activeFrom: h.active_from,
    activeTo: h.active_to,
    items: (h.habit_items ?? [])
      .map((i): HabitItemDef => ({
        id: i.id,
        name: i.name,
        sortOrder: i.sort_order,
        activeFrom: i.active_from,
        activeTo: i.active_to,
      }))
      .filter((i) => isActiveOn(i, date))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
  return defs;
}

/** Extracts one of our RPC error codes (raised as the exception message) from a PostgREST error. */
export function parseRpcError(e: unknown): RpcErrorCode | "UNKNOWN" {
  if (e === null || typeof e !== "object") return "UNKNOWN";
  const o = e as { message?: unknown; details?: unknown; hint?: unknown };
  for (const field of [o.message, o.details, o.hint]) {
    if (typeof field !== "string") continue;
    for (const code of RPC_ERROR_CODES) {
      if (new RegExp(`(?<![A-Za-z0-9_])${code}(?![A-Za-z0-9_])`).test(field))
        return code;
    }
  }
  return "UNKNOWN";
}
