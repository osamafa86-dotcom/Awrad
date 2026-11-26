import type pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import {
  FixtureLoader,
  dayStatusCases,
  noonOf,
  streakCases,
  summaryCases,
  type StudentSummary,
} from "./fixtures";
import {
  adminDb,
  clientAs,
  createTestUser,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from "./helpers";

// Groups use Asia/Riyadh (UTC+3); noon UTC is 15:00 local, so "today" is unambiguous.
const TODAY = "2026-11-26";
const NOW = noonOf(TODAY);

let db: pg.Client;
let fx: Fixture;
let loader: FixtureLoader;
const clients: UserClient[] = [];

async function as(email: string): Promise<UserClient> {
  const client = await clientAs(email);
  clients.push(client);
  return client;
}

async function failure(
  promise: Promise<unknown>,
): Promise<{ message: string; code?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { message: string; code?: string };
  }
  throw new Error("expected the call to fail");
}

function summaryOf(
  client: UserClient,
  userId: string | null,
  range: { from?: string; to?: string } = {},
  now: string = NOW,
): Promise<StudentSummary> {
  return client.rpc<StudentSummary>(
    "get_student_summary",
    { p_user_id: userId, p_from: range.from ?? null, p_to: range.to ?? null },
    { settings: { "app.test_now": now } },
  );
}

interface CalendarRow {
  log_date: string;
  state: string;
  completion_pct: string | null;
}

interface OverviewRow {
  user_id: string;
  full_name: string;
  log_date: string;
  state: string;
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
  // joined_at defaults to the real current_date; pin it so streaks do not depend on the clock
  await db.query(
    `update profiles set joined_at = '2026-11-01' where id = any($1)`,
    [[fx.p1, fx.p2, fx.sup1, fx.sup2]],
  );
  loader = await FixtureLoader.open(db);
});

beforeEach(async () => {
  await db.query("delete from logs");
  await db.query("delete from attendance");
  await db.query("delete from sessions");
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await loader?.end();
  await db?.end();
});

describe("0007_summary: shared fixtures", () => {
  test.each(streakCases)("streaks $name", async (c) => {
    const student = await loader.createStudent(c.joinedAt);
    for (const day of c.days)
      await loader.saveState(student, day.date, day.state, c.today);
    // the materialized states are what the case says
    for (const day of c.days) {
      expect((await loader.dayStatus(student, day.date))?.state).toBe(
        day.state,
      );
    }
    const summary = await loader.summary(student, c.today);
    expect({
      longest: summary.longest_streak,
      current: summary.current_streak,
    }).toEqual(c.expect);
  });

  test.each(dayStatusCases)("day status $name", async (c) => {
    const student = await loader.createStudent("2026-11-01");
    await loader.saveDay(student, c.date, c.entries, c.date);
    const status = await loader.withThreshold(c.thresholdPct, () =>
      loader.dayStatus(student, c.date),
    );
    expect(status).toEqual({
      state: c.expect.state,
      completion_pct: c.expect.completionPct,
    });
  });

  test.each(summaryCases)("summary $name", async (c) => {
    const student = await loader.createStudent(c.joinedAt);
    for (const day of c.days)
      await loader.saveDay(student, day.date, day.entries, c.today);
    await loader.addAttendance(student, c.attendance, c.today);
    const summary = await loader.withThreshold(c.thresholdPct, () =>
      loader.summary(student, c.today),
    );
    expect(summary.days_logged).toBe(c.expect.daysLogged);
    expect(summary.completion_pct).toBe(c.expect.completionPct);
    expect(summary.attendance_pct).toBe(c.expect.attendancePct);
    if (c.expect.longestStreak !== undefined) {
      expect(summary.longest_streak).toBe(c.expect.longestStreak);
    }
    if (c.expect.currentStreak !== undefined) {
      expect(summary.current_streak).toBe(c.expect.currentStreak);
    }
  });
});

describe("0007_summary: get_student_summary", () => {
  test("supervisor of other group calling get_student_summary → FORBIDDEN", async () => {
    const sup2 = await as("sup2@test");
    const error = await failure(summaryOf(sup2, fx.p1));
    expect(error.message).toBe("FORBIDDEN");
    expect(error.code).toBe("42501");
  });

  test("student calling for another student → FORBIDDEN", async () => {
    const p1 = await as("p1@test");
    expect((await failure(summaryOf(p1, fx.p2))).message).toBe("FORBIDDEN");
    // an unknown target is FORBIDDEN too, even for the admin (no existence leak)
    const admin = await as("admin@test");
    const unknown = "00000000-0000-4000-8000-00000000dead";
    expect((await failure(summaryOf(admin, unknown))).message).toBe(
      "FORBIDDEN",
    );
  });

  test("supervisor of own group → ok; a student gets their own summary by default", async () => {
    await loader.saveState(fx.p1, TODAY, "achieved", TODAY);
    const sup1 = await as("sup1@test");
    const viaSupervisor = await summaryOf(sup1, fx.p1);
    expect(viaSupervisor).toMatchObject({
      days_logged: 1,
      completion_pct: 100,
      current_streak: 1,
    });

    const p1 = await as("p1@test");
    const own = await p1.rpc<StudentSummary>(
      "get_student_summary",
      {},
      {
        settings: { "app.test_now": NOW },
      },
    );
    expect(own).toEqual(viaSupervisor);
    expect(Object.keys(own).sort()).toEqual([
      "attendance_pct",
      "completion_pct",
      "current_streak",
      "days_logged",
      "longest_streak",
      "per_habit",
      "weekly",
    ]);
    expect(own.attendance_pct).toBeNull();
    expect(own.weekly).toBeNull();
  });

  test("range filters days_logged and completion but never the streaks", async () => {
    const student = await loader.createStudent("2026-11-01");
    for (const date of [
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
    ]) {
      await loader.saveState(student, date, "achieved", TODAY);
    }
    await loader.saveState(student, "2026-11-25", "failed", TODAY);
    await loader.saveState(student, "2026-11-26", "achieved", TODAY);

    const all = await loader.summary(student, TODAY);
    expect(all).toMatchObject({
      days_logged: 7,
      longest_streak: 5,
      current_streak: 1,
    });
    // 6 achieved days at 5/5 + 1 failed at 4/5 = 34/35 = 97.1%
    expect(all.completion_pct).toBe(97);

    const lastTwo = await loader.summary(student, TODAY, {
      from: "2026-11-25",
      to: "2026-11-26",
    });
    // 9/10 = 90%; streaks still over [joined_at, today]
    expect(lastTwo).toMatchObject({
      days_logged: 2,
      completion_pct: 90,
      longest_streak: 5,
      current_streak: 1,
    });
    const nothing = await loader.summary(student, TODAY, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(nothing).toMatchObject({
      days_logged: 0,
      completion_pct: null,
      per_habit: [],
    });
  });

  test("weekly block weighs the weekly checklist by its items", async () => {
    const habits = await db.query<{ id: string; kind: string }>(
      `select id, kind::text as kind from active_habits_on('2026-11-22', 'weekly')`,
    );
    const entries = [];
    for (const habit of habits.rows) {
      if (habit.kind === "checklist") {
        const items = await db.query<{ id: string }>(
          `select id from active_items_on($1, '2026-11-22')`,
          [habit.id],
        );
        entries.push({
          habit_id: habit.id,
          status: "done",
          checked_item_ids: [items.rows[0]!.id],
        });
      } else {
        entries.push({ habit_id: habit.id, status: "done" });
      }
    }
    const p1 = await as("p1@test");
    await p1.rpc(
      "save_log",
      {
        p_period: "weekly",
        p_period_start: "2026-11-22",
        p_entries: JSON.stringify(entries),
      },
      { settings: { "app.test_now": NOW } },
    );
    // three tristate done + lesson_prep 1/2 = 3.5/4 = 87.5% → 88
    const summary = await summaryOf(p1, null);
    expect(summary.weekly).toEqual({ weeks_logged: 1, completion_pct: 88 });
    expect(summary.days_logged).toBe(0);
    const before = await summaryOf(p1, null, { to: "2026-11-21" });
    expect(before.weekly).toBeNull();
  });

  test("attendance_pct unchanged after moving student to another group", async () => {
    const p4 = (
      await createTestUser({
        email: "p4@test",
        fullName: "P4",
        role: "student",
        groupId: fx.g1,
      })
    ).id;
    await db.query(
      `update profiles set joined_at = '2026-11-01' where id = $1`,
      [p4],
    );
    const sessions = await db.query<{ id: string }>(
      `insert into sessions (group_id, session_date) values
         ($1, '2026-11-10'), (null, '2026-11-17'), ($1, '2026-11-24'), ($1, '2026-10-20')
       returning id`,
      [fx.g1],
    );
    const [g1a, shared, g1b, beforeJoin] = sessions.rows.map((row) => row.id);
    await db.query(
      `insert into attendance (session_id, user_id, status) values
         ($1, $5, 'present'), ($2, $5, 'present'), ($3, $5, 'absent'), ($4, $5, 'absent')`,
      [g1a, shared, g1b, beforeJoin, p4],
    );
    const admin = await as("admin@test");
    // 2 present / (2 present + 1 absent); the session before joined_at is ignored
    expect((await summaryOf(admin, p4)).attendance_pct).toBe(67);

    await db.query("update profiles set group_id = $2 where id = $1", [
      p4,
      fx.g2,
    ]);
    expect((await summaryOf(admin, p4)).attendance_pct).toBe(67);
    // the new group's supervisor sees the same number
    const sup2 = await as("sup2@test");
    expect((await summaryOf(sup2, p4)).attendance_pct).toBe(67);

    // excused counts as absent only when the setting says so
    await db.query(
      `update attendance set status = 'excused' where session_id = $1`,
      [g1b],
    );
    expect((await summaryOf(admin, p4)).attendance_pct).toBe(100);
    await db.query(
      `update app_settings set value = 'true' where key = 'excused_counts_as_absent'`,
    );
    try {
      expect((await summaryOf(admin, p4)).attendance_pct).toBe(67);
    } finally {
      await db.query(
        `update app_settings set value = 'false' where key = 'excused_counts_as_absent'`,
      );
    }
  });

  test("archived habit still appears in old day status under its old name", async () => {
    const habit = await db.query<{
      id: string;
      name: string;
      sort_order: number;
    }>(`select id, name, sort_order from habits where slug = 'sahihayn'`);
    const sahihayn = habit.rows[0]!;
    await loader.saveState(fx.p1, "2026-11-20", "achieved", TODAY);
    expect(await loader.dayStatus(fx.p1, "2026-11-20")).toEqual({
      state: "achieved",
      completion_pct: 100,
    });

    await db.query(`update habits set active_to = '2026-11-22' where id = $1`, [
      sahihayn.id,
    ]);
    try {
      // after the archive date the log simply has no sahihayn entry
      await loader.saveState(fx.p1, "2026-11-24", "achieved", TODAY);

      expect(await loader.dayStatus(fx.p1, "2026-11-20")).toEqual({
        state: "achieved",
        completion_pct: 100,
      });
      expect(await loader.dayStatus(fx.p1, "2026-11-24")).toEqual({
        state: "achieved",
        completion_pct: 100,
      });

      const summary = await loader.summary(fx.p1, TODAY, {
        from: "2026-11-18",
        to: TODAY,
      });
      const row = summary.per_habit.find((h) => h.habit_id === sahihayn.id);
      expect(row).toEqual({
        habit_id: sahihayn.id,
        slug: "sahihayn",
        name: sahihayn.name,
        completion_pct: 100,
      });
      expect(summary.per_habit).toHaveLength(5);
      // ordered by sort_order
      const orders = await db.query<{ id: string }>(
        `select id from habits where frequency = 'daily' order by sort_order, slug`,
      );
      expect(summary.per_habit.map((h) => h.habit_id)).toEqual(
        orders.rows.map((r) => r.id),
      );
      // a range after the archive date no longer lists it
      const later = await loader.summary(fx.p1, TODAY, {
        from: "2026-11-23",
        to: TODAY,
      });
      expect(later.per_habit.map((h) => h.slug)).not.toContain("sahihayn");
      expect(later.per_habit).toHaveLength(4);
    } finally {
      await db.query("update habits set active_to = null where id = $1", [
        sahihayn.id,
      ]);
    }
  });
});

describe("0007_summary: v_day_status", () => {
  test("v_day_status respects RLS", async () => {
    await loader.saveState(fx.p1, TODAY, "achieved", TODAY);
    await loader.saveState(fx.p2, TODAY, "failed", TODAY);

    const p1 = await as("p1@test");
    const own = await p1.query<{ user_id: string; state: string }>(
      "select user_id, state from v_day_status",
    );
    expect(own.rows).toEqual([{ user_id: fx.p1, state: "achieved" }]);

    const sup1 = await as("sup1@test");
    const supervised = await sup1.query<{ user_id: string }>(
      "select user_id from v_day_status",
    );
    expect(supervised.rows.map((row) => row.user_id)).toEqual([fx.p1]);

    const admin = await as("admin@test");
    const everyone = await admin.query<{ user_id: string }>(
      "select user_id from v_day_status order by user_id",
    );
    expect(everyone.rows.map((row) => row.user_id).sort()).toEqual(
      [fx.p1, fx.p2].sort(),
    );

    const view = await db.query<{ options: string[] }>(
      `select reloptions as options from pg_class where relname = 'v_day_status'`,
    );
    expect(view.rows[0]!.options).toContain("security_invoker=true");
  });
});

describe("0007_summary: get_calendar", () => {
  test("get_calendar fills 30 days with missing", async () => {
    await loader.saveState(fx.p1, "2026-11-10", "achieved", TODAY);
    await loader.saveState(fx.p1, "2026-11-20", "failed", TODAY);
    await loader.saveState(fx.p1, "2026-11-26", "neutral", TODAY);
    const p1 = await as("p1@test");
    // p_to is past today: the calendar stops at the student's local today
    const rows = await p1.rpc<CalendarRow[]>(
      "get_calendar",
      { p_user_id: fx.p1, p_from: "2026-10-28", p_to: "2026-11-30" },
      { settings: { "app.test_now": NOW } },
    );
    expect(rows).toHaveLength(30);
    expect(rows[0]!.log_date).toBe("2026-10-28");
    expect(rows[29]!.log_date).toBe(TODAY);
    const missing = rows.filter((row) => row.state === "missing");
    expect(missing).toHaveLength(27);
    expect(missing.every((row) => row.completion_pct === null)).toBe(true);
    expect(
      rows
        .filter((row) => row.state !== "missing")
        .map((row) => [row.log_date, row.state, row.completion_pct]),
    ).toEqual([
      ["2026-11-10", "achieved", "100"],
      ["2026-11-20", "failed", "80"],
      ["2026-11-26", "neutral", null],
    ]);

    const sup2 = await as("sup2@test");
    const forbidden = await failure(
      sup2.rpc(
        "get_calendar",
        { p_user_id: fx.p1, p_from: "2026-11-01", p_to: TODAY },
        {
          settings: { "app.test_now": NOW },
        },
      ),
    );
    expect(forbidden.message).toBe("FORBIDDEN");
  });

  test("get_calendar range > 62 days → INVALID_ITEM", async () => {
    const p1 = await as("p1@test");
    const call = (from: string, to: string) =>
      p1.rpc<CalendarRow[]>(
        "get_calendar",
        { p_user_id: fx.p1, p_from: from, p_to: to },
        {
          settings: { "app.test_now": NOW },
        },
      );
    const tooLong = await failure(call("2026-09-25", TODAY)); // 63 days
    expect(tooLong.message).toBe("INVALID_ITEM");
    expect(tooLong.code).toBe("22023");
    expect((await failure(call(TODAY, "2026-11-20"))).message).toBe(
      "INVALID_ITEM",
    );
    expect(await call("2026-09-26", TODAY)).toHaveLength(62);
  });
});

describe("0007_summary: get_group_overview", () => {
  test("untracked supervisor and inactive student absent from get_group_overview", async () => {
    const sup3 = (
      await createTestUser({
        email: "sup3@test",
        fullName: "Sup 3 (untracked)",
        role: "supervisor",
        groupId: fx.g1,
        isTracked: false,
        supervises: [fx.g1],
      })
    ).id;
    const p5 = (
      await createTestUser({
        email: "p5@test",
        fullName: "P5",
        role: "student",
        groupId: fx.g1,
      })
    ).id;
    await db.query("update profiles set is_active = false where id = $1", [p5]);
    await loader.saveState(fx.p1, "2026-11-25", "achieved", TODAY);

    const sup1 = await as("sup1@test");
    // 22:00 UTC on the 26th is 01:00 on the 27th in Riyadh: the group's today is the 27th
    const rows = await sup1.rpc<OverviewRow[]>(
      "get_group_overview",
      { p_group_id: fx.g1, p_from: "2026-11-24", p_to: "2026-11-30" },
      { settings: { "app.test_now": "2026-11-26T22:00:00Z" } },
    );
    const expected = await db.query<{ id: string; full_name: string }>(
      `select id, full_name from profiles
        where group_id = $1 and is_tracked and is_active order by full_name, id`,
      [fx.g1],
    );
    const users = expected.rows.map((row) => row.id);
    expect(users).toContain(fx.p1);
    expect(users).toContain(fx.sup1);
    expect(users).not.toContain(sup3);
    expect(users).not.toContain(p5);

    const days = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
    expect(rows.map((row) => [row.user_id, row.log_date])).toEqual(
      expected.rows.flatMap((user) => days.map((day) => [user.id, day])),
    );
    expect(
      rows.find(
        (row) => row.user_id === fx.p1 && row.log_date === "2026-11-25",
      ),
    ).toEqual({
      user_id: fx.p1,
      full_name: "P1",
      log_date: "2026-11-25",
      state: "achieved",
    });
    expect(rows.filter((row) => row.state !== "missing")).toHaveLength(1);
  });

  test("get_group_overview is FORBIDDEN outside the caller’s groups and rejects long ranges", async () => {
    const call = (client: UserClient, from: string, to: string) =>
      client.rpc(
        "get_group_overview",
        { p_group_id: fx.g1, p_from: from, p_to: to },
        {
          settings: { "app.test_now": NOW },
        },
      );
    expect(
      (await failure(call(await as("sup2@test"), "2026-11-20", TODAY))).message,
    ).toBe("FORBIDDEN");
    expect(
      (await failure(call(await as("p1@test"), "2026-11-20", TODAY))).message,
    ).toBe("FORBIDDEN");
    const admin = await as("admin@test");
    expect((await failure(call(admin, "2026-09-01", TODAY))).message).toBe(
      "INVALID_ITEM",
    );
    expect((await failure(call(admin, TODAY, "2026-11-20"))).message).toBe(
      "INVALID_ITEM",
    );
    expect(await call(admin, "2026-11-20", TODAY)).not.toHaveLength(0);
  });
});
