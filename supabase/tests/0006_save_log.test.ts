import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  createTestUser,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from './helpers';

// Seeded habit ids (supabase/seed.sql). Daily: a1..a5 (a2 = 13-item checklist); weekly: a6..a9
// (a9 = 2-item checklist).
const H = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;
const I = (suffix: string) => `00000000-0000-4000-8000-000000000${suffix}`;
const DAILY_TRISTATE = [H('a1'), H('a3'), H('a4'), H('a5')];
const ADHKAR = H('a2');
const ADHKAR_ITEMS = Array.from({ length: 13 }, (_, i) => I(String(101 + i)));
const WEEKLY_TRISTATE = [H('a6'), H('a7'), H('a8')];
const LESSON_PREP = H('a9');
const LESSON_ITEMS = [I('201'), I('202')];

// p1's group G1 uses Asia/Riyadh (UTC+3) and weeks starting on Sunday: today = Thu 2026-11-26,
// this week starts Sun 2026-11-22.
const NOW = '2026-11-26T10:00:00Z';
const TODAY = '2026-11-26';
const THIS_WEEK = '2026-11-22';

interface Entry {
  habit_id: string;
  status: string;
  checked_item_ids?: string[];
}

let db: pg.Client;
let fx: Fixture;
let p3: string;
const clients: UserClient[] = [];

async function as(email: string): Promise<UserClient> {
  const client = await clientAs(email);
  clients.push(client);
  return client;
}

async function failure(promise: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { message: string; code?: string };
  }
  throw new Error('expected the call to fail');
}

function dailyEntries(adhkar: Partial<Entry> = {}): Entry[] {
  return [
    ...DAILY_TRISTATE.map((habit_id) => ({ habit_id, status: 'done' })),
    {
      habit_id: ADHKAR,
      status: 'done',
      checked_item_ids: ADHKAR_ITEMS,
      ...adhkar,
    },
  ];
}

function weeklyEntries(): Entry[] {
  return [
    ...WEEKLY_TRISTATE.map((habit_id) => ({ habit_id, status: 'done' })),
    { habit_id: LESSON_PREP, status: 'done', checked_item_ids: LESSON_ITEMS },
  ];
}

function save(
  client: UserClient,
  args: {
    period?: 'daily' | 'weekly';
    start?: string;
    entries?: unknown;
    note?: string | null;
    review?: string | null;
    support?: string | null;
    userId?: string | null;
  },
  now: string = NOW,
): Promise<string> {
  return client.rpc<string>(
    'save_log',
    {
      p_period: args.period ?? 'daily',
      p_period_start: args.start ?? TODAY,
      // pg would serialize a JS array as a Postgres array literal, so jsonb goes as JSON text.
      p_entries: JSON.stringify(args.entries ?? dailyEntries()),
      p_note: args.note ?? null,
      p_review_text: args.review ?? null,
      p_support_request_text: args.support ?? null,
      p_user_id: args.userId ?? null,
    },
    { settings: { 'app.test_now': now } },
  );
}

/** The stored entries of one log, read back through the RLS select policies as `client`. */
async function storedEntries(
  client: UserClient,
  logId: string,
): Promise<Map<string, { status: string; items: string[] }>> {
  const result = await client.query<{
    habit_id: string;
    status: string;
    items: string[];
  }>(
    `select e.habit_id, e.status,
            coalesce(array_agg(i.habit_item_id::text order by i.habit_item_id)
                       filter (where i.habit_item_id is not null), '{}') as items
       from log_entries e left join log_entry_items i on i.entry_id = e.id
      where e.log_id = $1
      group by e.habit_id, e.status`,
    [logId],
  );
  return new Map(result.rows.map((row) => [row.habit_id, row]));
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
  p3 = (
    await createTestUser({
      email: 'p3@test',
      fullName: 'P3',
      role: 'student',
      groupId: fx.g1,
    })
  ).id;
  await db.query('update profiles set is_active = false where id = $1', [p3]);
});

beforeEach(async () => {
  await db.query('delete from logs');
  await db.query('delete from audit_log');
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0006_save_log', () => {
  test('student saves today daily log with 5 entries and gets same id on second save (upsert)', async () => {
    const p1 = await as('p1@test');
    const first = await save(p1, { note: 'first' });
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect((await storedEntries(p1, first)).get(ADHKAR)!.items).toHaveLength(13);

    const second = await save(p1, {
      note: 'second',
      entries: dailyEntries({ checked_item_ids: ADHKAR_ITEMS.slice(0, 10) }),
    });
    expect(second).toBe(first);

    const logs = await p1.query<{
      id: string;
      note: string;
      period: string;
      period_start: string;
    }>('select id, note, period, period_start from logs');
    expect(logs.rows).toEqual([
      { id: first, note: 'second', period: 'daily', period_start: TODAY },
    ]);
    const entries = await storedEntries(p1, first);
    expect(entries.size).toBe(5);
    // the update replaced the items: no stale rows from the first save
    expect(entries.get(ADHKAR)!.items).toEqual(ADHKAR_ITEMS.slice(0, 10));
  });

  test('two concurrent saves for same day produce one logs row', async () => {
    const a = await as('p1@test');
    const b = await as('p1@test');
    const [idA, idB] = await Promise.all([save(a, { note: 'A' }), save(b, { note: 'B' })]);
    expect(idA).toBe(idB);
    const logs = await db.query<{ id: string; note: string }>(
      'select id, note from logs where user_id = $1',
      [fx.p1],
    );
    expect(logs.rows).toHaveLength(1);
    expect(['A', 'B']).toContain(logs.rows[0]!.note);
    const entries = await db.query('select 1 from log_entries where log_id = $1', [idA]);
    expect(entries.rowCount).toBe(5);
  });

  test('future date rejected FUTURE_DATE', async () => {
    const p1 = await as('p1@test');
    const error = await failure(save(p1, { start: '2026-11-27' }));
    expect(error.message).toBe('FUTURE_DATE');
    expect(error.code).toBe('22023');
    // admins bypass the window, never the future check
    const admin = await as('admin@test');
    expect((await failure(save(admin, { start: '2026-11-27', userId: fx.p1 }))).message).toBe(
      'FUTURE_DATE',
    );
    const weekly = await failure(save(p1, { period: 'weekly', start: '2026-11-29' }));
    expect(weekly.message).toBe('FUTURE_DATE');
  });

  test('date older than backfill_days rejected DATE_OUT_OF_WINDOW; admin bypass succeeds and writes audit_log', async () => {
    const p1 = await as('p1@test');
    await save(p1, { start: '2026-11-24' }); // today - 2: still inside the window
    const error = await failure(save(p1, { start: '2026-11-23' }));
    expect(error.message).toBe('DATE_OUT_OF_WINDOW');
    expect(error.code).toBe('22023');
    const own = await db.query('select 1 from audit_log');
    expect(own.rowCount).toBe(0);

    const admin = await as('admin@test');
    const logId = await save(admin, { start: '2026-11-20', userId: fx.p1 });
    const stored = await p1.query<{ user_id: string; period_start: string }>(
      'select user_id, period_start from logs where id = $1',
      [logId],
    );
    expect(stored.rows).toEqual([{ user_id: fx.p1, period_start: '2026-11-20' }]);
    const audit = await db.query<{
      actor_id: string;
      action: string;
      target: unknown;
      diff: unknown;
    }>('select actor_id, action, target, diff from audit_log');
    expect(audit.rows).toEqual([
      {
        actor_id: fx.admin,
        action: 'log.admin_save',
        target: { table: 'logs', id: logId },
        diff: {
          user_id: fx.p1,
          period: 'daily',
          period_start: '2026-11-20',
          reason: 'both',
        },
      },
    ]);

    // admin writing for another user inside the window is audited as other_user
    await save(admin, { start: TODAY, userId: fx.p1 });
    const reasons = await db.query<{ reason: string }>(
      `select diff ->> 'reason' as reason from audit_log order by id`,
    );
    expect(reasons.rows.map((row) => row.reason)).toEqual(['both', 'other_user']);
  });

  test('local date near midnight accepted: user tz Asia/Riyadh, server now 22:30Z → period_start = tomorrow-UTC accepted', async () => {
    const p1 = await as('p1@test');
    // 2026-11-25T22:30Z is 2026-11-26 01:30 in Riyadh
    const logId = await save(p1, { start: '2026-11-26' }, '2026-11-25T22:30:00Z');
    const stored = await p1.query('select period_start from logs where id = $1', [logId]);
    expect(stored.rows).toEqual([{ period_start: '2026-11-26' }]);
    const error = await failure(save(p1, { start: '2026-11-27' }, '2026-11-25T22:30:00Z'));
    expect(error.message).toBe('FUTURE_DATE');
  });

  test('checklist: client status done with 10/13 items stored as not_done with 10 items', async () => {
    const p1 = await as('p1@test');
    const logId = await save(p1, {
      entries: dailyEntries({
        status: 'done',
        checked_item_ids: ADHKAR_ITEMS.slice(0, 10),
      }),
    });
    const adhkar = (await storedEntries(p1, logId)).get(ADHKAR)!;
    expect(adhkar.status).toBe('not_done');
    expect(adhkar.items).toHaveLength(10);
  });

  test('checklist: all 13 items → done; not_required → no items stored', async () => {
    const p1 = await as('p1@test');
    // the client status is ignored for checklists: all items checked → done
    const logId = await save(p1, {
      entries: dailyEntries({ status: 'not_done' }),
    });
    expect((await storedEntries(p1, logId)).get(ADHKAR)).toEqual({
      habit_id: ADHKAR,
      status: 'done',
      items: ADHKAR_ITEMS,
    });

    await save(p1, {
      entries: dailyEntries({ status: 'not_required', checked_item_ids: [] }),
    });
    expect((await storedEntries(p1, logId)).get(ADHKAR)).toEqual({
      habit_id: ADHKAR,
      status: 'not_required',
      items: [],
    });

    // not_required with checked items is contradictory
    const error = await failure(
      save(p1, {
        entries: dailyEntries({
          status: 'not_required',
          checked_item_ids: [I('101')],
        }),
      }),
    );
    expect(error.message).toBe('INVALID_ITEM');
  });

  test('checked_item_id not belonging to habit → INVALID_ITEM', async () => {
    const p1 = await as('p1@test');
    const error = await failure(
      save(p1, {
        entries: dailyEntries({
          checked_item_ids: [I('101'), LESSON_ITEMS[0]!],
        }),
      }),
    );
    expect(error.message).toBe('INVALID_ITEM');
    expect(error.code).toBe('22023');
  });

  test('weekly: period_start not a week start → INVALID_WEEK_START', async () => {
    const p1 = await as('p1@test');
    const error = await failure(
      save(p1, {
        period: 'weekly',
        start: '2026-11-23',
        entries: weeklyEntries(),
      }),
    );
    expect(error.message).toBe('INVALID_WEEK_START');
    expect(error.code).toBe('22023');
    const logId = await save(p1, {
      period: 'weekly',
      start: THIS_WEEK,
      entries: weeklyEntries(),
    });
    const lesson = (await storedEntries(p1, logId)).get(LESSON_PREP)!;
    expect(lesson).toEqual({
      habit_id: LESSON_PREP,
      status: 'done',
      items: LESSON_ITEMS,
    });
  });

  test('weekly: saved on grace day 3 accepted, day 4 rejected', async () => {
    const p1 = await as('p1@test');
    // week of Sun 2026-11-15 ends Sat 2026-11-21; grace days 3 → last day Tue 2026-11-24
    const args = {
      period: 'weekly' as const,
      start: '2026-11-15',
      entries: weeklyEntries(),
    };
    await save(p1, args, '2026-11-24T10:00:00Z');
    const error = await failure(save(p1, args, '2026-11-25T10:00:00Z'));
    expect(error.message).toBe('DATE_OUT_OF_WINDOW');
  });

  test('weekly with support text sets support_status open; empty text sets none', async () => {
    const p1 = await as('p1@test');
    const args = {
      period: 'weekly' as const,
      start: THIS_WEEK,
      entries: weeklyEntries(),
    };
    const logId = await save(p1, {
      ...args,
      review: 'good week',
      support: 'need help',
    });
    const read = () =>
      p1.query<{ support_status: string; support_request_text: string | null }>(
        'select support_status, support_request_text, review_text from logs where id = $1',
        [logId],
      );
    expect((await read()).rows).toEqual([
      {
        support_status: 'open',
        support_request_text: 'need help',
        review_text: 'good week',
      },
    ]);
    await save(p1, { ...args, support: '   ' });
    expect((await read()).rows[0]!.support_status).toBe('none');

    // daily logs never carry weekly fields
    const daily = await save(p1, { review: 'ignored', support: 'ignored' });
    const dailyRow = await p1.query(
      'select support_status, support_request_text, review_text from logs where id = $1',
      [daily],
    );
    expect(dailyRow.rows).toEqual([
      { support_status: 'none', support_request_text: null, review_text: null },
    ]);
  });

  test('support text unchanged after handled keeps handled; changed text reopens', async () => {
    const p1 = await as('p1@test');
    const args = {
      period: 'weekly' as const,
      start: THIS_WEEK,
      entries: weeklyEntries(),
    };
    const logId = await save(p1, { ...args, support: 'help' });
    await db.query(
      `update logs set support_status = 'handled', handled_by = $2, handled_at = now(),
                       handled_note = 'done' where id = $1`,
      [logId, fx.sup1],
    );
    const read = async () =>
      (
        await p1.query<{
          support_status: string;
          handled_by: string | null;
          handled_note: string | null;
        }>('select support_status, handled_by, handled_note from logs where id = $1', [logId])
      ).rows[0];

    await save(p1, { ...args, support: 'help', note: 'edited note' });
    expect(await read()).toEqual({
      support_status: 'handled',
      handled_by: fx.sup1,
      handled_note: 'done',
    });

    await save(p1, { ...args, support: 'help again' });
    expect(await read()).toEqual({
      support_status: 'open',
      handled_by: null,
      handled_note: null,
    });
  });

  test('inactive habit on that date → INACTIVE_HABIT; weekly habit in daily log → FREQUENCY_MISMATCH', async () => {
    const p1 = await as('p1@test');
    const mismatch = await failure(
      save(p1, {
        entries: [...dailyEntries(), { habit_id: WEEKLY_TRISTATE[0]!, status: 'done' }],
      }),
    );
    expect(mismatch.message).toBe('FREQUENCY_MISMATCH');
    expect(mismatch.code).toBe('22023');

    await db.query(`delete from habits where slug = 'test_archived_habit'`);
    const archived = (
      await db.query<{ id: string }>(
        `insert into habits (slug, name, frequency, kind, active_from, active_to)
         values ('test_archived_habit', 'Archived', 'daily', 'tristate', '2020-01-01', '2026-11-01')
         returning id`,
      )
    ).rows[0]!.id;
    try {
      const inactive = await failure(
        save(p1, {
          entries: [...dailyEntries(), { habit_id: archived, status: 'done' }],
        }),
      );
      expect(inactive.message).toBe('INACTIVE_HABIT');
      expect(inactive.code).toBe('22023');
    } finally {
      await db.query('delete from habits where id = $1', [archived]);
    }
  });

  test('student saving for another user → FORBIDDEN', async () => {
    const p1 = await as('p1@test');
    const error = await failure(save(p1, { userId: fx.p2 }));
    expect(error.message).toBe('FORBIDDEN');
    expect(error.code).toBe('42501');
    const sup1 = await as('sup1@test');
    expect((await failure(save(sup1, { userId: fx.p1 }))).message).toBe('FORBIDDEN');
    expect((await db.query('select 1 from logs')).rowCount).toBe(0);
  });

  test('entries missing one active habit → MISSING_ENTRY', async () => {
    const p1 = await as('p1@test');
    const error = await failure(save(p1, { entries: dailyEntries().slice(1) }));
    expect(error.message).toBe('MISSING_ENTRY');
    expect(error.code).toBe('22023');
    // nothing is written on a validation failure
    expect((await db.query('select 1 from logs')).rowCount).toBe(0);
  });

  test('checklist with empty checked_item_ids and status not_done is stored (not dropped)', async () => {
    const p1 = await as('p1@test');
    const logId = await save(p1, {
      entries: dailyEntries({ status: 'not_done', checked_item_ids: [] }),
    });
    const entries = await storedEntries(p1, logId);
    expect(entries.size).toBe(5);
    expect(entries.get(ADHKAR)).toEqual({
      habit_id: ADHKAR,
      status: 'not_done',
      items: [],
    });
  });

  test('inactive (is_active=false) user → INACTIVE_USER', async () => {
    const asP3 = await as('p3@test');
    const own = await failure(save(asP3, {}));
    expect(own.message).toBe('INACTIVE_USER');
    expect(own.code).toBe('42501');
    const admin = await as('admin@test');
    expect((await failure(save(admin, { userId: p3 }))).message).toBe('INACTIVE_USER');
  });

  test('duplicate habit_id in entries → INVALID_ITEM', async () => {
    const p1 = await as('p1@test');
    const error = await failure(
      save(p1, {
        entries: [...dailyEntries(), { habit_id: DAILY_TRISTATE[0]!, status: 'not_done' }],
      }),
    );
    expect(error.message).toBe('INVALID_ITEM');
    expect(error.code).toBe('22023');
  });

  test('checked_item_ids on a tristate habit → INVALID_ITEM', async () => {
    const p1 = await as('p1@test');
    const entries = dailyEntries();
    entries[0] = {
      habit_id: DAILY_TRISTATE[0]!,
      status: 'done',
      checked_item_ids: [I('101')],
    };
    expect((await failure(save(p1, { entries }))).message).toBe('INVALID_ITEM');
    // malformed payloads too
    for (const bad of [
      { not: 'an array' },
      [...dailyEntries().slice(1), { habit_id: ADHKAR, status: 'maybe' }],
      [...dailyEntries().slice(1), { habit_id: 'not-a-uuid', status: 'done' }],
      [...dailyEntries().slice(0, 4), { habit_id: ADHKAR, status: 'done', checked_item_ids: 'x' }],
    ]) {
      expect((await failure(save(p1, { entries: bad }))).message).toBe('INVALID_ITEM');
    }
  });

  test('supervisor can save own daily log', async () => {
    const sup1 = await as('sup1@test');
    const logId = await save(sup1, { note: 'mine' });
    const stored = await sup1.query('select user_id, note from logs where id = $1', [logId]);
    expect(stored.rows).toEqual([{ user_id: fx.sup1, note: 'mine' }]);
  });
});
