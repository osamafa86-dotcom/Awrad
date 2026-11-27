import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaveLogInput } from "@awrad/domain";
import {
  type Database,
  type TypedClient,
  createBrowserClient,
  fetchActiveHabits,
  getCalendar,
  getGroupOverview,
  getStudentSummary,
  parseRpcError,
  requestAccountDeletion,
  saveLog,
  setAttendance,
} from "../index";

// why: the helpers only touch `rpc`/`from`; a full SupabaseClient mock is impractical, so the mock is
// typed loosely and cast to TypedClient at the call site.
interface MockClient {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
}
function mock(): { client: TypedClient; m: MockClient } {
  const m: MockClient = { rpc: vi.fn(), from: vi.fn() };
  return { client: m as unknown as TypedClient, m };
}

const H1 = "11111111-1111-4111-8111-111111111111";
const I1 = "22222222-2222-4222-8222-222222222222";
const U1 = "33333333-3333-4333-8333-333333333333";
const pgError = (message: string) => ({
  message,
  details: null,
  hint: null,
  code: "P0001",
});

describe("saveLog", () => {
  const input: SaveLogInput = {
    period: "daily",
    periodStart: "2026-03-02",
    entries: [
      { habitId: H1, status: "done", checkedItemIds: [I1] },
      { habitId: U1, status: "not_required" },
    ],
    note: "ملاحظة",
  };

  it("calls rpc save_log with snake_case args and returns the uuid", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({ data: "log-uuid", error: null });
    await expect(saveLog(client, input)).resolves.toBe("log-uuid");
    expect(m.rpc).toHaveBeenCalledWith("save_log", {
      p_period: "daily",
      p_period_start: "2026-03-02",
      p_entries: [
        { habit_id: H1, status: "done", checked_item_ids: [I1] },
        { habit_id: U1, status: "not_required" },
      ],
      p_note: "ملاحظة",
      p_review_text: null,
      p_support_request_text: null,
      p_user_id: null,
    });
  });

  it("passes userId and texts through", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({ data: "x", error: null });
    await saveLog(
      client,
      { ...input, reviewText: "r", supportRequestText: "s" },
      U1,
    );
    const args = m.rpc.mock.calls[0]![1];
    expect(args).toMatchObject({
      p_review_text: "r",
      p_support_request_text: "s",
      p_user_id: U1,
    });
  });

  it("rethrows the original error; parseRpcError reads the code", async () => {
    const { client, m } = mock();
    const err = pgError("DATE_OUT_OF_WINDOW");
    m.rpc.mockResolvedValue({ data: null, error: err });
    await expect(saveLog(client, input)).rejects.toBe(err);
    expect(parseRpcError(err)).toBe("DATE_OUT_OF_WINDOW");
  });
});

describe("parseRpcError", () => {
  it("returns UNKNOWN for unrelated or non-error values", () => {
    expect(parseRpcError(pgError("connection refused"))).toBe("UNKNOWN");
    expect(parseRpcError(null)).toBe("UNKNOWN");
    expect(parseRpcError("boom")).toBe("UNKNOWN");
  });
  it("finds a wrapped code as a whole word, also in details/hint", () => {
    expect(parseRpcError({ message: 'error: "MISSING_ENTRY" raised' })).toBe(
      "MISSING_ENTRY",
    );
    expect(parseRpcError({ message: "x", details: "FORBIDDEN" })).toBe(
      "FORBIDDEN",
    );
    expect(parseRpcError({ message: "x", hint: "FUTURE_DATE" })).toBe(
      "FUTURE_DATE",
    );
    expect(parseRpcError({ message: "NOT_FORBIDDEN_AT_ALL_X" })).toBe(
      "UNKNOWN",
    );
  });
  it("accepts an Error instance", () => {
    expect(parseRpcError(new Error("INACTIVE_USER"))).toBe("INACTIVE_USER");
  });
});

describe("getStudentSummary", () => {
  const json = {
    days_logged: 5,
    completion_pct: 80,
    attendance_pct: null,
    longest_streak: 4,
    current_streak: 2,
    per_habit: [
      { habit_id: H1, slug: "prayer", name: "الصلاة", completion_pct: 90 },
    ],
    weekly: null,
  };

  it("maps snake_case json to camelCase and sends nulls for absent opts", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({ data: json, error: null });
    const res = await getStudentSummary(client);
    expect(m.rpc).toHaveBeenCalledWith("get_student_summary", {
      p_user_id: null,
      p_from: null,
      p_to: null,
    });
    expect(res).toEqual({
      daysLogged: 5,
      completionPct: 80,
      attendancePct: null,
      longestStreak: 4,
      currentStreak: 2,
      perHabit: [
        { habitId: H1, slug: "prayer", name: "الصلاة", completionPct: 90 },
      ],
      weekly: null,
    });
  });

  it("maps weekly and forwards opts", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({
      data: { ...json, weekly: { weeks_logged: 2, completion_pct: 50 } },
      error: null,
    });
    const res = await getStudentSummary(client, {
      userId: U1,
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(m.rpc).toHaveBeenCalledWith("get_student_summary", {
      p_user_id: U1,
      p_from: "2026-03-01",
      p_to: "2026-03-31",
    });
    expect(res.weekly).toEqual({ weeksLogged: 2, completionPct: 50 });
  });

  it("throws the original error", async () => {
    const { client, m } = mock();
    const err = pgError("FORBIDDEN");
    m.rpc.mockResolvedValue({ data: null, error: err });
    await expect(getStudentSummary(client)).rejects.toBe(err);
  });
});

describe("getCalendar / getGroupOverview", () => {
  it("getCalendar passes p_user_id/p_from/p_to and maps rows", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({
      data: [
        { log_date: "2026-03-01", state: "achieved", completion_pct: 100 },
        { log_date: "2026-03-02", state: "missing", completion_pct: null },
      ],
      error: null,
    });
    const rows = await getCalendar(client, U1, "2026-03-01", "2026-03-02");
    expect(m.rpc).toHaveBeenCalledWith("get_calendar", {
      p_user_id: U1,
      p_from: "2026-03-01",
      p_to: "2026-03-02",
    });
    expect(rows).toEqual([
      { date: "2026-03-01", state: "achieved", completionPct: 100 },
      { date: "2026-03-02", state: "missing", completionPct: null },
    ]);
  });

  it("getGroupOverview passes p_group_id/p_from/p_to and maps rows", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({
      data: [
        {
          user_id: U1,
          full_name: "سارة",
          log_date: "2026-03-01",
          state: "failed",
        },
      ],
      error: null,
    });
    const rows = await getGroupOverview(client, H1, "2026-03-01", "2026-03-07");
    expect(m.rpc).toHaveBeenCalledWith("get_group_overview", {
      p_group_id: H1,
      p_from: "2026-03-01",
      p_to: "2026-03-07",
    });
    expect(rows).toEqual([
      { userId: U1, fullName: "سارة", date: "2026-03-01", state: "failed" },
    ]);
  });

  it("rethrow on error", async () => {
    const { client, m } = mock();
    const err = pgError("FORBIDDEN");
    m.rpc.mockResolvedValue({ data: null, error: err });
    await expect(getCalendar(client, U1, "a", "b")).rejects.toBe(err);
    await expect(getGroupOverview(client, H1, "a", "b")).rejects.toBe(err);
  });
});

describe("setAttendance / requestAccountDeletion", () => {
  it("sends p_rows as [{user_id,status}] and returns the count", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValue({ data: 2, error: null });
    const n = await setAttendance(client, H1, [
      { userId: U1, status: "present" },
      { userId: I1, status: "excused" },
    ]);
    expect(n).toBe(2);
    expect(m.rpc).toHaveBeenCalledWith("set_attendance", {
      p_session_id: H1,
      p_rows: [
        { user_id: U1, status: "present" },
        { user_id: I1, status: "excused" },
      ],
    });
  });

  it("requestAccountDeletion returns the id; rethrows on error", async () => {
    const { client, m } = mock();
    m.rpc.mockResolvedValueOnce({ data: "req-id", error: null });
    await expect(requestAccountDeletion(client)).resolves.toBe("req-id");
    expect(m.rpc).toHaveBeenCalledWith("request_account_deletion");
    const err = pgError("FORBIDDEN");
    m.rpc.mockResolvedValueOnce({ data: null, error: err });
    await expect(requestAccountDeletion(client)).rejects.toBe(err);
  });
});

describe("fetchActiveHabits", () => {
  it("builds one chained query and maps rows to HabitDef", async () => {
    const { client, m } = mock();
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: H1,
          slug: "prayer",
          name: "الصلاة",
          target_text: "5",
          frequency: "daily",
          kind: "checklist",
          sort_order: 1,
          active_from: "2026-01-01",
          active_to: null,
          description: null,
          created_at: "x",
          habit_items: [
            {
              id: "i3",
              habit_id: H1,
              name: "ج",
              sort_order: 3,
              active_from: "2026-01-01",
              active_to: null,
            },
            {
              id: "i1",
              habit_id: H1,
              name: "أ",
              sort_order: 1,
              active_from: "2026-01-01",
              active_to: null,
            },
            {
              id: "i2",
              habit_id: H1,
              name: "قديم",
              sort_order: 2,
              active_from: "2026-01-01",
              active_to: "2026-02-01",
            },
            {
              id: "i4",
              habit_id: H1,
              name: "مستقبل",
              sort_order: 4,
              active_from: "2026-04-01",
              active_to: null,
            },
          ],
        },
      ],
      error: null,
    });
    const or = vi.fn().mockReturnValue({ order });
    const lte = vi.fn().mockReturnValue({ or });
    const eq = vi.fn().mockReturnValue({ lte });
    const select = vi.fn().mockReturnValue({ eq });
    m.from.mockReturnValue({ select });

    const habits = await fetchActiveHabits(client, "2026-03-02", "daily");

    expect(m.from).toHaveBeenCalledWith("habits");
    expect(select).toHaveBeenCalledWith("*, habit_items(*)");
    expect(eq).toHaveBeenCalledWith("frequency", "daily");
    expect(lte).toHaveBeenCalledWith("active_from", "2026-03-02");
    expect(or).toHaveBeenCalledWith(
      "active_to.is.null,active_to.gte.2026-03-02",
    );
    expect(order).toHaveBeenCalledWith("sort_order");
    expect(habits).toEqual([
      {
        id: H1,
        slug: "prayer",
        name: "الصلاة",
        targetText: "5",
        frequency: "daily",
        kind: "checklist",
        sortOrder: 1,
        activeFrom: "2026-01-01",
        activeTo: null,
        items: [
          {
            id: "i1",
            name: "أ",
            sortOrder: 1,
            activeFrom: "2026-01-01",
            activeTo: null,
          },
          {
            id: "i3",
            name: "ج",
            sortOrder: 3,
            activeFrom: "2026-01-01",
            activeTo: null,
          },
        ],
      },
    ]);
  });

  it("rethrows the original error", async () => {
    const { client, m } = mock();
    const err = pgError("FORBIDDEN");
    const order = vi.fn().mockResolvedValue({ data: null, error: err });
    m.from.mockReturnValue({
      select: () => ({
        eq: () => ({ lte: () => ({ or: () => ({ order }) }) }),
      }),
    });
    await expect(fetchActiveHabits(client, "2026-03-02", "daily")).rejects.toBe(
      err,
    );
  });
});

describe("types", () => {
  it("createBrowserClient returns SupabaseClient<Database>; generated types cover functions", () => {
    expectTypeOf(createBrowserClient).returns.toEqualTypeOf<
      SupabaseClient<Database>
    >();
    expectTypeOf<TypedClient>().toEqualTypeOf<SupabaseClient<Database>>();
    expectTypeOf<Database["public"]["Functions"]["save_log"]>().toHaveProperty(
      "Args",
    );
    expectTypeOf<
      Database["public"]["Functions"]["save_log"]["Returns"]
    >().toEqualTypeOf<string>();
  });
  it("createBrowserClient constructs a client without touching the network", () => {
    const c = createBrowserClient("http://127.0.0.1:54321", "anon-key");
    expect(typeof c.rpc).toBe("function");
  });
});
