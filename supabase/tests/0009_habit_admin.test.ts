import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import {
  adminDb,
  clientAs,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from "./helpers";

// Every habit this file makes has a slug starting with this, so afterEach can remove them (and their
// logs) without touching the seeded habits, which resetTestData keeps for the other files.
const PREFIX = "test_hab_";

let db: pg.Client;
let fx: Fixture;
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

interface HabitRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target_text: string | null;
  frequency: "daily" | "weekly";
  kind: "tristate" | "checklist";
  sort_order: number;
  active_from: string;
  active_to: string | null;
}

async function makeHabit(
  slug: string,
  opts: {
    kind?: "tristate" | "checklist";
    frequency?: "daily" | "weekly";
    activeFrom?: string;
  } = {},
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into habits (slug, name, target_text, frequency, kind, sort_order, active_from)
     values ($1, 'قديمة', 'هدف قديم', $2, $3, 7, $4) returning id`,
    [
      PREFIX + slug,
      opts.frequency ?? "daily",
      opts.kind ?? "tristate",
      opts.activeFrom ?? "2026-01-01",
    ],
  );
  return result.rows[0]!.id;
}

async function habit(id: string): Promise<HabitRow> {
  const result = await db.query<HabitRow>(
    "select * from habits where id = $1",
    [id],
  );
  return result.rows[0]!;
}

/** A log of p1 (daily by default) starting on `date` with an entry for `habitId` (written directly: this file tests habits, not save_log). */
async function logOn(
  habitId: string,
  date: string,
  period: "daily" | "weekly" = "daily",
): Promise<string> {
  const log = await db.query<{ id: string }>(
    `insert into logs (user_id, period, period_start) values ($1, $3, $2)
     on conflict (user_id, period, period_start) do update set note = null returning id`,
    [fx.p1, date, period],
  );
  const entry = await db.query<{ id: string }>(
    `insert into log_entries (log_id, habit_id, status) values ($1, $2, 'done') returning id`,
    [log.rows[0]!.id, habitId],
  );
  return entry.rows[0]!.id;
}

async function activeIds(
  date: string,
  frequency: "daily" | "weekly" = "daily",
): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `select id from active_habits_on($1::date, $2::habit_frequency) where slug like $3`,
    [date, frequency, `${PREFIX}%`],
  );
  return result.rows.map((row) => row.id);
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

afterEach(async () => {
  await db.query(
    `delete from log_entries where habit_id in (select id from habits where slug like $1)`,
    [`${PREFIX}%`],
  );
  await db.query("delete from logs");
  await db.query("delete from habits where slug like $1", [`${PREFIX}%`]);
  await db.query(`delete from audit_log where action = 'habit.replace'`);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe("0009_habit_admin: archive_and_replace_habit", () => {
  test("switching on 2026-12-01 ends the old habit on 2026-11-30 and starts the new one on 2026-12-01", async () => {
    const old = await makeHabit("book");
    const admin = await as("admin@test");
    const newId = await admin.rpc<string>("archive_and_replace_habit", {
      p_old_habit_id: old,
      p_new: {
        name: "الكتاب الجديد",
        target_text: "عشر صفحات",
        description: "وصف",
      },
      p_switch_date: "2026-12-01",
    });

    expect((await habit(old)).active_to).toBe("2026-11-30");
    const created = await habit(newId);
    expect(created).toMatchObject({
      name: "الكتاب الجديد",
      target_text: "عشر صفحات",
      description: "وصف",
      frequency: "daily",
      kind: "tristate",
      sort_order: 7,
      active_from: "2026-12-01",
      active_to: null,
      slug: `${PREFIX}book_20261201`,
    });

    expect(await activeIds("2026-11-30")).toEqual([old]);
    expect(await activeIds("2026-12-01")).toEqual([newId]);
  });

  test("writes one habit.replace audit row naming the new habit and the switch date", async () => {
    const old = await makeHabit("audited");
    const admin = await as("admin@test");
    const newId = await admin.rpc<string>("archive_and_replace_habit", {
      p_old_habit_id: old,
      p_new: { name: "بديل" },
      p_switch_date: "2026-12-01",
    });
    const audit = await db.query(
      `select actor_id, target, diff from audit_log where action = 'habit.replace'`,
    );
    expect(audit.rows).toEqual([
      {
        actor_id: fx.admin,
        target: { table: "habits", id: old },
        diff: { new_id: newId, switch_date: "2026-12-01" },
      },
    ]);
  });

  test("the generated slug is made unique with a numeric suffix; an explicit slug is used as given", async () => {
    const admin = await as("admin@test");
    await db.query(
      `insert into habits (slug, name, frequency, active_from) values ($1, 'x', 'daily', '2026-01-01')`,
      [`${PREFIX}dup_20261201`],
    );
    const old = await makeHabit("dup");
    const generated = await admin.rpc<string>("archive_and_replace_habit", {
      p_old_habit_id: old,
      p_new: { name: "بديل" },
      p_switch_date: "2026-12-01",
    });
    expect((await habit(generated)).slug).toBe(`${PREFIX}dup_20261201_2`);

    const other = await makeHabit("named");
    const named = await admin.rpc<string>("archive_and_replace_habit", {
      p_old_habit_id: other,
      p_new: { name: "بديل", slug: `${PREFIX}chosen` },
      p_switch_date: "2026-12-01",
    });
    expect((await habit(named)).slug).toBe(`${PREFIX}chosen`);
  });

  test("a slug already taken is rejected (INVALID_ITEM) and nothing changes", async () => {
    const old = await makeHabit("taken");
    const admin = await as("admin@test");
    const error = await failure(
      admin.rpc("archive_and_replace_habit", {
        p_old_habit_id: old,
        p_new: { name: "بديل", slug: "quran_wird" },
        p_switch_date: "2026-12-01",
      }),
    );
    expect(error.message).toBe("INVALID_ITEM");
    expect(error.code).toBe("22023");
    expect((await habit(old)).active_to).toBeNull();
  });

  test("a checklist replacement creates its items active from the switch date", async () => {
    const old = await makeHabit("list", { kind: "checklist" });
    await db.query(
      `insert into habit_items (habit_id, name, sort_order, active_from) values ($1, 'قديم', 1, '2026-01-01')`,
      [old],
    );
    const admin = await as("admin@test");
    const newId = await admin.rpc<string>("archive_and_replace_habit", {
      p_old_habit_id: old,
      p_new: {
        name: "قائمة جديدة",
        items: [{ name: "الأول" }, { name: "الثاني", sort_order: 5 }],
      },
      p_switch_date: "2026-12-01",
    });
    expect((await habit(newId)).kind).toBe("checklist");
    const items = await db.query(
      `select name, sort_order, active_from, active_to from habit_items where habit_id = $1 order by sort_order`,
      [newId],
    );
    expect(items.rows).toEqual([
      {
        name: "الأول",
        sort_order: 1,
        active_from: "2026-12-01",
        active_to: null,
      },
      {
        name: "الثاني",
        sort_order: 5,
        active_from: "2026-12-01",
        active_to: null,
      },
    ]);
  });

  test("a checklist replacement without items is rejected (INVALID_ITEM)", async () => {
    const old = await makeHabit("empty", { kind: "checklist" });
    const admin = await as("admin@test");
    const error = await failure(
      admin.rpc("archive_and_replace_habit", {
        p_old_habit_id: old,
        p_new: { name: "قائمة", items: [] },
        p_switch_date: "2026-12-01",
      }),
    );
    expect(error.message).toBe("INVALID_ITEM");
    const tristate = await makeHabit("to_list");
    const missing = await failure(
      admin.rpc("archive_and_replace_habit", {
        p_old_habit_id: tristate,
        p_new: { name: "قائمة", kind: "checklist" },
        p_switch_date: "2026-12-01",
      }),
    );
    expect(missing.message).toBe("INVALID_ITEM");
  });

  test("a new habit without a name is rejected (INVALID_ITEM)", async () => {
    const old = await makeHabit("nameless");
    const admin = await as("admin@test");
    const error = await failure(
      admin.rpc("archive_and_replace_habit", {
        p_old_habit_id: old,
        p_new: { name: "  " },
        p_switch_date: "2026-12-01",
      }),
    );
    expect(error.message).toBe("INVALID_ITEM");
  });

  test("a supervisor or a student may not replace a habit (FORBIDDEN)", async () => {
    const old = await makeHabit("guarded");
    for (const email of ["sup1@test", "p1@test"]) {
      const user = await as(email);
      const error = await failure(
        user.rpc("archive_and_replace_habit", {
          p_old_habit_id: old,
          p_new: { name: "بديل" },
          p_switch_date: "2026-12-01",
        }),
      );
      expect(error.message).toBe("FORBIDDEN");
      expect(error.code).toBe("42501");
    }
    expect((await habit(old)).active_to).toBeNull();
  });

  test("anon may not execute the function at all", async () => {
    await db.query("begin");
    try {
      await db.query("set local role anon");
      const error = await failure(
        db.query(
          `select archive_and_replace_habit($1, '{}'::jsonb, '2026-12-01')`,
          ["00000000-0000-0000-0000-000000000000"],
        ),
      );
      expect(error.message).toMatch(
        /permission denied for function archive_and_replace_habit/,
      );
    } finally {
      await db.query("rollback");
    }
  });

  test("an archived or unknown habit cannot be replaced (INACTIVE_HABIT)", async () => {
    const old = await makeHabit("archived");
    await db.query(`update habits set active_to = '2026-06-30' where id = $1`, [
      old,
    ]);
    const admin = await as("admin@test");
    for (const id of [old, "00000000-0000-0000-0000-000000000000"]) {
      const error = await failure(
        admin.rpc("archive_and_replace_habit", {
          p_old_habit_id: id,
          p_new: { name: "بديل" },
          p_switch_date: "2026-12-01",
        }),
      );
      expect(error.message).toBe("INACTIVE_HABIT");
      expect(error.code).toBe("22023");
    }
  });

  test("a switch date on or before the old start, or before an existing log, is rejected (DATE_OUT_OF_WINDOW)", async () => {
    const old = await makeHabit("logged", { activeFrom: "2026-11-01" });
    await logOn(old, "2026-11-20");
    const admin = await as("admin@test");
    for (const date of [
      "2026-11-01",
      "2026-10-15",
      "2026-11-20",
      "2026-11-10",
    ]) {
      const error = await failure(
        admin.rpc("archive_and_replace_habit", {
          p_old_habit_id: old,
          p_new: { name: "بديل" },
          p_switch_date: date,
        }),
      );
      expect(error.message, date).toBe("DATE_OUT_OF_WINDOW");
      expect(error.code).toBe("22023");
    }
    expect((await habit(old)).active_to).toBeNull();

    // The day after the latest log is allowed: the old habit stays active on every logged date.
    await admin.rpc("archive_and_replace_habit", {
      p_old_habit_id: old,
      p_new: { name: "بديل" },
      p_switch_date: "2026-11-21",
    });
    expect((await habit(old)).active_to).toBe("2026-11-20");
  });

  test("weekly: the switch may not be on or before a logged week start, but may fall inside that week (the log's period_start is what counts)", async () => {
    // A weekly log is checked against the habits active on its week start (save_log), so the old habit
    // must stay active through W; a switch on W+3 keeps it active on W and starts the new one mid-week.
    const old = await makeHabit("weekly_logged", { frequency: "weekly" });
    await logOn(old, "2026-11-15", "weekly");
    const admin = await as("admin@test");
    for (const date of ["2026-11-15", "2026-11-08"]) {
      const error = await failure(
        admin.rpc("archive_and_replace_habit", {
          p_old_habit_id: old,
          p_new: { name: "بديل" },
          p_switch_date: date,
        }),
      );
      expect(error.message, date).toBe("DATE_OUT_OF_WINDOW");
    }
    await admin.rpc("archive_and_replace_habit", {
      p_old_habit_id: old,
      p_new: { name: "بديل" },
      p_switch_date: "2026-11-18",
    });
    expect((await habit(old)).active_to).toBe("2026-11-17");
    expect(await activeIds("2026-11-15", "weekly")).toEqual([old]);
  });
});

describe("0009_habit_admin: delete guards", () => {
  test("a habit with logs cannot be deleted (HABIT_HAS_LOGS), even by an admin", async () => {
    const id = await makeHabit("with_logs");
    await logOn(id, "2026-11-20");
    const admin = await as("admin@test");
    const error = await failure(
      admin.query("delete from habits where id = $1", [id]),
    );
    expect(error.message).toBe("HABIT_HAS_LOGS");
    expect(error.code).toBe("22023");
    expect(await habit(id)).toBeDefined();
  });

  test("a habit without logs can be deleted, its items with it", async () => {
    const id = await makeHabit("no_logs", { kind: "checklist" });
    await db.query(
      `insert into habit_items (habit_id, name) values ($1, 'بند')`,
      [id],
    );
    const admin = await as("admin@test");
    const deleted = await admin.query("delete from habits where id = $1", [id]);
    expect(deleted.rowCount).toBe(1);
    expect(
      (await db.query("select 1 from habit_items where habit_id = $1", [id]))
        .rowCount,
    ).toBe(0);
  });

  test("an item that a log checked cannot be deleted (HABIT_HAS_LOGS); an unchecked one can", async () => {
    const id = await makeHabit("items", { kind: "checklist" });
    const items = await db.query<{ id: string }>(
      `insert into habit_items (habit_id, name, sort_order) values ($1, 'أ', 1), ($1, 'ب', 2) returning id`,
      [id],
    );
    const [checked, unchecked] = items.rows.map((row) => row.id);
    const entry = await logOn(id, "2026-11-20");
    await db.query(
      "insert into log_entry_items (entry_id, habit_item_id) values ($1, $2)",
      [entry, checked],
    );
    const admin = await as("admin@test");
    const error = await failure(
      admin.query("delete from habit_items where id = $1", [checked]),
    );
    expect(error.message).toBe("HABIT_HAS_LOGS");
    expect(error.code).toBe("22023");
    expect(
      (await admin.query("delete from habit_items where id = $1", [unchecked]))
        .rowCount,
    ).toBe(1);
  });
});
