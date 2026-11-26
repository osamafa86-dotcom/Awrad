import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  createTestUser,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from './helpers';

// Seeded habit `adhkar` (checklist) and its first item (supabase/seed.sql).
const ADHKAR = '00000000-0000-4000-8000-0000000000a2';
const ADHKAR_ITEM = '00000000-0000-4000-8000-000000000101';

let db: pg.Client;
let f: Fixture;
const logs: Record<string, string> = {};
const entries: Record<string, string> = {};
const sessions: Record<string, string> = {};
const requests: Record<string, string> = {};
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

async function insertId(sql: string, params: unknown[]): Promise<string> {
  return (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
}

function ids(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id).sort();
}

beforeAll(async () => {
  await resetTestData();
  f = await seedFixture();
  db = await adminDb();

  for (const user of ['p1', 'p2'] as const) {
    const userId = f[user];
    logs[user] = await insertId(
      `insert into logs (user_id, period, period_start) values ($1, 'daily', '2026-11-20') returning id`,
      [userId],
    );
    entries[user] = await insertId(
      `insert into log_entries (log_id, habit_id, status) values ($1, $2, 'done') returning id`,
      [logs[user], ADHKAR],
    );
    await db.query('insert into log_entry_items (entry_id, habit_item_id) values ($1, $2)', [
      entries[user],
      ADHKAR_ITEM,
    ]);
    await db.query(`insert into push_tokens (user_id, token, platform) values ($1, $2, 'ios')`, [
      userId,
      `token-${user}`,
    ]);
    requests[user] = await insertId(
      'insert into deletion_requests (user_id) values ($1) returning id',
      [userId],
    );
  }

  sessions.g1 = await insertId(
    `insert into sessions (group_id, session_date) values ($1, '2026-11-20') returning id`,
    [f.g1],
  );
  sessions.g2 = await insertId(
    `insert into sessions (group_id, session_date) values ($1, '2026-11-20') returning id`,
    [f.g2],
  );
  sessions.shared = await insertId(
    `insert into sessions (group_id, session_date) values (null, '2026-11-21') returning id`,
    [],
  );
  for (const user of ['p1', 'p2'] as const) {
    await db.query(
      `insert into attendance (session_id, user_id, status) values ($1, $2, 'present')`,
      [sessions.shared, f[user]],
    );
  }
  await db.query(
    `insert into attendance (session_id, user_id, status) values ($1, $2, 'present')`,
    [sessions.g1, f.p1],
  );

  await db.query(
    `insert into invitations (email, full_name, role, group_id) values ('new@test', 'New', 'student', $1)`,
    [f.g1],
  );
  await db.query(`insert into audit_log (actor_id, action) values ($1, 'test.seed')`, [f.admin]);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0005_rls', () => {
  test('student sees only own profile', async () => {
    const p1 = await as('p1@test');
    const result = await p1.query<{ id: string }>('select id from profiles');
    expect(ids(result.rows)).toEqual([f.p1]);
  });

  test('student reading another student logs gets 0 rows', async () => {
    const p1 = await as('p1@test');
    const other = await p1.query('select * from logs where user_id = $1', [f.p2]);
    expect(other.rowCount).toBe(0);
    const otherEntries = await p1.query('select * from log_entries where log_id = $1', [logs.p2]);
    expect(otherEntries.rowCount).toBe(0);
    const otherItems = await p1.query('select * from log_entry_items where entry_id = $1', [
      entries.p2,
    ]);
    expect(otherItems.rowCount).toBe(0);
    // ... while the student's own rows are visible through the same tables.
    expect(ids((await p1.query<{ id: string }>('select id from logs')).rows)).toEqual([logs.p1]);
    expect(ids((await p1.query<{ id: string }>('select id from log_entries')).rows)).toEqual([
      entries.p1,
    ]);
    const ownItems = await p1.query<{ entry_id: string }>('select entry_id from log_entry_items');
    expect(ownItems.rows.map((row) => row.entry_id)).toEqual([entries.p1]);
  });

  test('supervisor sees profiles of own group only', async () => {
    const sup1 = await as('sup1@test');
    const result = await sup1.query<{ id: string }>('select id from profiles');
    expect(ids(result.rows)).toEqual([f.sup1, f.p1].sort());
  });

  test('supervisor reading other-group logs gets 0 rows', async () => {
    const sup1 = await as('sup1@test');
    expect((await sup1.query('select * from logs where user_id = $1', [f.p2])).rowCount).toBe(0);
    expect(
      (await sup1.query('select * from log_entries where log_id = $1', [logs.p2])).rowCount,
    ).toBe(0);
    expect(
      (await sup1.query('select * from log_entry_items where entry_id = $1', [entries.p2]))
        .rowCount,
    ).toBe(0);
    // Own group's logs are visible.
    expect(ids((await sup1.query<{ id: string }>('select id from logs')).rows)).toEqual([logs.p1]);
    expect(ids((await sup1.query<{ id: string }>('select id from log_entries')).rows)).toEqual([
      entries.p1,
    ]);
    expect((await sup1.query('select * from log_entry_items')).rowCount).toBe(1);
  });

  test('admin sees all profiles', async () => {
    const admin = await as('admin@test');
    const result = await admin.query<{ id: string }>('select id from profiles');
    expect(result.rowCount).toBe(5);
    expect((await admin.query('select * from logs')).rowCount).toBe(2);
    expect((await admin.query('select * from log_entries')).rowCount).toBe(2);
    expect((await admin.query('select * from log_entry_items')).rowCount).toBe(2);
  });

  test('student direct insert into logs is rejected', async () => {
    const p1 = await as('p1@test');
    const error = await failure(
      p1.query(
        `insert into logs (user_id, period, period_start) values ($1, 'daily', '2026-11-21')`,
        [f.p1],
      ),
    );
    expect(error.code).toBe('42501');
    // No direct writes to child tables or existing logs either (0 rows, no error for update/delete).
    expect(
      (
        await failure(
          p1.query(`insert into log_entries (log_id, habit_id, status) values ($1, $2, 'done')`, [
            logs.p1,
            '00000000-0000-4000-8000-0000000000a1',
          ]),
        )
      ).code,
    ).toBe('42501');
    expect((await p1.query(`update logs set note = 'x' where id = $1`, [logs.p1])).rowCount).toBe(
      0,
    );
    expect((await p1.query('delete from log_entry_items')).rowCount).toBe(0);
    expect((await db.query('select 1 from log_entry_items')).rowCount).toBe(2);
  });

  test('student can update own reminder_time', async () => {
    const p1 = await as('p1@test');
    const updated = await p1.query(`update profiles set reminder_time = '05:30' where id = $1`, [
      f.p1,
    ]);
    expect(updated.rowCount).toBe(1);
    const read = await p1.query<{ reminder_time: string }>(
      'select reminder_time from profiles where id = $1',
      [f.p1],
    );
    expect(read.rows[0]!.reminder_time).toBe('05:30:00');
    // Another user's profile is not updatable (filtered, not an error).
    expect(
      (await p1.query(`update profiles set reminder_time = '05:30' where id = $1`, [f.p2]))
        .rowCount,
    ).toBe(0);
  });

  test('everyone authenticated can read habits and app_settings', async () => {
    const p1 = await as('p1@test');
    expect((await p1.query('select * from habits')).rowCount).toBe(9);
    expect((await p1.query('select * from app_settings')).rowCount).toBe(6);
    expect((await p1.query('select * from habit_items')).rowCount).toBeGreaterThan(0);
    expect((await p1.query('select * from groups')).rowCount).toBe(2);
    expect((await p1.query('select * from group_supervisors')).rowCount).toBe(2);
  });

  test('student cannot read audit_log or invitations', async () => {
    const p1 = await as('p1@test');
    expect((await p1.query('select * from audit_log')).rowCount).toBe(0);
    expect((await p1.query('select * from invitations')).rowCount).toBe(0);
    const sup1 = await as('sup1@test');
    expect((await sup1.query('select * from audit_log')).rowCount).toBe(0);
    expect((await sup1.query('select * from invitations')).rowCount).toBe(0);
    const admin = await as('admin@test');
    expect((await admin.query('select * from audit_log')).rowCount).toBeGreaterThan(0);
    expect((await admin.query('select * from invitations')).rowCount).toBeGreaterThan(0);
  });

  test('student can upsert own push_tokens only', async () => {
    const p1 = await as('p1@test');
    const upsert = `insert into push_tokens (user_id, token, platform) values ($1, $2, 'android')
                    on conflict (user_id, token) do update set platform = excluded.platform,
                                                               updated_at = now()`;
    expect((await p1.query(upsert, [f.p1, 'token-p1'])).rowCount).toBe(1);
    const error = await failure(p1.query(upsert, [f.p2, 'token-from-p1']));
    expect(error.code).toBe('42501');
    const mine = await p1.query<{ user_id: string; platform: string }>(
      'select user_id, platform from push_tokens',
    );
    expect(mine.rows).toEqual([{ user_id: f.p1, platform: 'android' }]);
    // p2's token cannot be touched (0 rows).
    expect((await p1.query('delete from push_tokens where user_id = $1', [f.p2])).rowCount).toBe(0);
    expect((await db.query('select 1 from push_tokens where user_id = $1', [f.p2])).rowCount).toBe(
      1,
    );
  });

  test('supervisor listed in group_supervisors for G1 and G2 sees both groups', async () => {
    await createTestUser({
      email: 'sup12@test',
      fullName: 'Sup 12',
      role: 'supervisor',
      isTracked: false,
      supervises: [f.g1, f.g2],
    });
    const sup12 = await as('sup12@test');
    const seen = ids((await sup12.query<{ id: string }>('select id from profiles')).rows);
    expect(seen).toEqual(expect.arrayContaining([f.p1, f.p2, f.sup1, f.sup2]));
    expect(ids((await sup12.query<{ id: string }>('select id from logs')).rows)).toEqual(
      [logs.p1, logs.p2].sort(),
    );
  });

  test('student reads own deletion_requests only', async () => {
    const p1 = await as('p1@test');
    expect(ids((await p1.query<{ id: string }>('select id from deletion_requests')).rows)).toEqual([
      requests.p1,
    ]);
    const sup2 = await as('sup2@test');
    expect(
      ids((await sup2.query<{ id: string }>('select id from deletion_requests')).rows),
    ).toEqual([requests.p2]);
    // No direct insert: requests go through request_account_deletion().
    expect(
      (await failure(p1.query('insert into deletion_requests (user_id) values ($1)', [f.p1]))).code,
    ).toBe('42501');
    // Only the admin handles requests.
    expect(
      (
        await p1.query('update deletion_requests set handled_at = now() where id = $1', [
          requests.p1,
        ])
      ).rowCount,
    ).toBe(0);
  });

  test('every public table has rowsecurity = true', async () => {
    const result = await db.query<{ count: string }>(
      `select count(*) from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(result.rows[0]!.count).toBe('0');
    const total = await db.query<{ count: string }>(
      `select count(*) from pg_tables where schemaname = 'public'`,
    );
    expect(Number(total.rows[0]!.count)).toBeGreaterThanOrEqual(15);
  });

  test('anon cannot read or update profiles', async () => {
    const client = await adminDb();
    try {
      await client.query('begin');
      await client.query('set local role anon');
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      expect((await client.query('select * from profiles')).rowCount).toBe(0);
      expect((await client.query(`update profiles set full_name = 'hacked'`)).rowCount).toBe(0);
      expect((await client.query('select * from habits')).rowCount).toBe(0);
      await client.query('commit');
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
    expect((await db.query(`select 1 from profiles where full_name = 'hacked'`)).rowCount).toBe(0);
  });

  test('student cannot modify habits or app_settings', async () => {
    const p1 = await as('p1@test');
    expect((await p1.query(`update habits set name = 'x' where id = $1`, [ADHKAR])).rowCount).toBe(
      0,
    );
    expect(
      (await p1.query(`update app_settings set value = '5' where key = 'backfill_days'`)).rowCount,
    ).toBe(0);
    expect((await p1.query('delete from habit_items')).rowCount).toBe(0);
    expect(
      (await failure(p1.query(`insert into app_settings (key, value) values ('x', '1')`))).code,
    ).toBe('42501');
    expect((await failure(p1.query(`insert into groups (name) values ('G3')`))).code).toBe('42501');
    const habit = await db.query<{ name: string }>('select name from habits where id = $1', [
      ADHKAR,
    ]);
    expect(habit.rows[0]!.name).not.toBe('x');
    const setting = await db.query<{ value: number }>(
      `select value from app_settings where key = 'backfill_days'`,
    );
    expect(setting.rows[0]!.value).toBe(2);
  });

  test('sessions visibility', async () => {
    const all = [sessions.g1, sessions.g2, sessions.shared];
    const visible = async (email: string) => {
      const client = await as(email);
      const result = await client.query<{ id: string }>(
        'select id from sessions where id = any($1::uuid[])',
        [all],
      );
      return ids(result.rows);
    };
    expect(await visible('p1@test')).toEqual([sessions.g1, sessions.shared].sort());
    expect(await visible('p2@test')).toEqual([sessions.g2, sessions.shared].sort());
    expect(await visible('sup2@test')).toEqual([sessions.g2, sessions.shared].sort());
    expect(await visible('admin@test')).toEqual([...all].sort());
  });

  test('supervisor may insert a session for own group but not shared or other group', async () => {
    const sup1 = await as('sup1@test');
    const insert = `insert into sessions (group_id, session_date) values ($1, '2026-11-22')`;
    expect((await sup1.query(insert, [f.g1])).rowCount).toBe(1);
    expect((await failure(sup1.query(insert, [null]))).code).toBe('42501');
    expect((await failure(sup1.query(insert, [f.g2]))).code).toBe('42501');
    // Cannot move an own-group session to another group or make it shared.
    expect(
      (
        await failure(
          sup1.query('update sessions set group_id = $1 where id = $2', [f.g2, sessions.g1]),
        )
      ).code,
    ).toBe('42501');
    expect(
      (await sup1.query(`update sessions set title = 'x' where id = $1`, [sessions.shared]))
        .rowCount,
    ).toBe(0);
    expect((await sup1.query('delete from sessions where id = $1', [sessions.g1])).rowCount).toBe(
      0,
    );
    const p1 = await as('p1@test');
    expect((await failure(p1.query(insert, [f.g1]))).code).toBe('42501');
    const admin = await as('admin@test');
    expect((await admin.query(insert, [null])).rowCount).toBe(1);
  });

  test('attendance visibility', async () => {
    const p1 = await as('p1@test');
    const own = await p1.query<{ user_id: string }>('select user_id from attendance');
    expect(own.rowCount).toBe(2);
    expect(own.rows.every((row) => row.user_id === f.p1)).toBe(true);

    const sup1 = await as('sup1@test');
    const group = await sup1.query<{ user_id: string }>('select user_id from attendance');
    expect(group.rowCount).toBe(2);
    expect(group.rows.every((row) => row.user_id === f.p1)).toBe(true);

    const admin = await as('admin@test');
    expect((await admin.query('select * from attendance')).rowCount).toBe(3);

    const error = await failure(
      sup1.query(
        `insert into attendance (session_id, user_id, status) values ($1, $2, 'present')`,
        [sessions.g1, f.sup1],
      ),
    );
    expect(error.code).toBe('42501');
    expect(
      (await sup1.query(`update attendance set status = 'absent' where user_id = $1`, [f.p1]))
        .rowCount,
    ).toBe(0);

    const count = await sup1.rpc('set_attendance', {
      p_session_id: sessions.shared,
      p_rows: JSON.stringify([{ user_id: f.p1, status: 'excused' }]),
    });
    expect(count).toBe(1);
    const stored = await db.query<{ status: string }>(
      'select status from attendance where session_id = $1 and user_id = $2',
      [sessions.shared, f.p1],
    );
    expect(stored.rows[0]!.status).toBe('excused');
  });

  test('deletion_requests one open per user', async () => {
    const error = await failure(
      db.query('insert into deletion_requests (user_id) values ($1)', [f.p1]),
    );
    expect(error.code).toBe('23505');
    const p1 = await as('p1@test');
    expect(await p1.rpc<string>('request_account_deletion')).toBe(requests.p1);
    // Once handled, a new request may be opened.
    await db.query('update deletion_requests set handled_at = now() where id = $1', [requests.p1]);
    const next = await p1.rpc<string>('request_account_deletion');
    expect(next).not.toBe(requests.p1);
    expect(await p1.rpc<string>('request_account_deletion')).toBe(next);
  });
});
