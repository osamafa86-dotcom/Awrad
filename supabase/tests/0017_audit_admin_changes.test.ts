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

// Final review db I3 (F-81 «سجلّ تدقيق مبسّط للتغييرات الإدارية»): the dashboard writes habits, habit items,
// session deletions and profile edits straight to the tables under RLS, and none of them left an audit row.
// Triggers now write one row per change: actor = auth.uid(), action = '<entity>.<op>', target = {table, id},
// diff = {column: {old, new}} of the columns that changed. No claims (migrations, seed, import system steps)
// → no row; a user's own self-service edits (timezone, reminders) → no row.

interface AuditRow {
  actor_id: string | null;
  action: string;
  target: { table: string; id: string };
  diff: Record<string, { old: unknown; new: unknown }>;
}

let db: pg.Client;
let fx: Fixture;
const clients: UserClient[] = [];

async function as(email: string): Promise<UserClient> {
  const client = await clientAs(email);
  clients.push(client);
  return client;
}

async function audit(): Promise<AuditRow[]> {
  const result = await db.query<AuditRow>('select actor_id, action, target, diff from audit_log order by id');
  return result.rows;
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

beforeEach(async () => {
  await db.query(`delete from habits where slug like 'audit_%'`);
  await db.query('delete from sessions');
  await db.query('truncate audit_log');
});

afterAll(async () => {
  await db.query(`delete from habits where slug like 'audit_%'`);
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0017_audit_admin_changes: habits and habit items', () => {
  test('create, rename, archive and delete of a habit each leave one row', async () => {
    const admin = await as('admin@test');
    const created = await admin.query<{ id: string }>(
      `insert into habits (slug, name, frequency, kind, sort_order, active_from)
       values ('audit_h', 'عادة', 'daily', 'tristate', 50, '2026-01-01') returning id`,
    );
    const id = created.rows[0]!.id;
    await admin.query(`update habits set name = 'عادة مصحّحة' where id = $1`, [id]);
    await admin.query(`update habits set active_to = '2026-12-31' where id = $1`, [id]);
    await admin.query('delete from habits where id = $1', [id]);

    const rows = await audit();
    expect(rows.map((row) => row.action)).toEqual([
      'habit.create',
      'habit.update',
      'habit.archive',
      'habit.delete',
    ]);
    for (const row of rows) {
      expect(row.actor_id).toBe(fx.admin);
      expect(row.target).toEqual({ table: 'habits', id });
    }
    expect(rows[0]!.diff).toMatchObject({
      slug: { old: null, new: 'audit_h' },
      name: { old: null, new: 'عادة' },
      frequency: { old: null, new: 'daily' },
    });
    expect(rows[1]!.diff).toEqual({ name: { old: 'عادة', new: 'عادة مصحّحة' } });
    expect(rows[2]!.diff).toEqual({ active_to: { old: null, new: '2026-12-31' } });
    expect(rows[3]!.diff).toMatchObject({ name: { old: 'عادة مصحّحة', new: null } });
  });

  test('habit items: create, rename, archive, delete', async () => {
    const admin = await as('admin@test');
    const habit = await admin.query<{ id: string }>(
      `insert into habits (slug, name, frequency, kind) values ('audit_list', 'قائمة', 'daily', 'checklist')
       returning id`,
    );
    const item = await admin.query<{ id: string }>(
      `insert into habit_items (habit_id, name, sort_order) values ($1, 'بند', 1) returning id`,
      [habit.rows[0]!.id],
    );
    const id = item.rows[0]!.id;
    await admin.query(`update habit_items set name = 'بند أول' where id = $1`, [id]);
    await admin.query(`update habit_items set active_to = current_date where id = $1`, [id]);
    await admin.query('delete from habit_items where id = $1', [id]);

    const rows = (await audit()).filter((row) => row.target.table === 'habit_items');
    expect(rows.map((row) => row.action)).toEqual([
      'habit_item.create',
      'habit_item.update',
      'habit_item.archive',
      'habit_item.delete',
    ]);
    expect(rows.every((row) => row.actor_id === fx.admin && row.target.id === id)).toBe(true);
    expect(rows[1]!.diff).toEqual({ name: { old: 'بند', new: 'بند أول' } });
  });

  test('an update that changes nothing (a reorder to the same place) writes no row', async () => {
    const admin = await as('admin@test');
    const created = await admin.query<{ id: string }>(
      `insert into habits (slug, name, frequency, sort_order) values ('audit_same', 'س', 'daily', 7) returning id`,
    );
    await db.query('truncate audit_log');
    await admin.query('update habits set sort_order = 7 where id = $1', [created.rows[0]!.id]);
    expect(await audit()).toEqual([]);
    await admin.query('update habits set sort_order = 8 where id = $1', [created.rows[0]!.id]);
    expect((await audit()).map((row) => [row.action, row.diff])).toEqual([
      ['habit.update', { sort_order: { old: 7, new: 8 } }],
    ]);
  });

  test('a write without claims (migration, seed, import system step) writes no row', async () => {
    await db.query(`insert into habits (slug, name, frequency) values ('audit_system', 'نظام', 'daily')`);
    await db.query(`update habits set name = 'نظام ٢' where slug = 'audit_system'`);
    expect(await audit()).toEqual([]);
  });
});

describe('0017_audit_admin_changes: sessions', () => {
  test('deleting a session records how many attendance marks went with it', async () => {
    const session = await db.query<{ id: string }>(
      `insert into sessions (group_id, session_date, title) values ($1, '2026-11-20', 'مجلس') returning id`,
      [fx.g1],
    );
    const id = session.rows[0]!.id;
    for (const user of [fx.p1, fx.sup1]) {
      await db.query(`insert into attendance (session_id, user_id, status) values ($1, $2, 'present')`, [id, user]);
    }
    await (await as('admin@test')).query('delete from sessions where id = $1', [id]);

    expect(await audit()).toEqual([
      {
        actor_id: fx.admin,
        action: 'session.delete',
        target: { table: 'sessions', id },
        diff: {
          group_id: { old: fx.g1, new: null },
          session_date: { old: '2026-11-20', new: null },
          title: { old: 'مجلس', new: null },
          attendance_count: { old: 2, new: null },
        },
      },
    ]);
  });

  test('a supervisor cannot delete a session (RLS) and so no row is written', async () => {
    const session = await db.query<{ id: string }>(
      `insert into sessions (group_id, session_date) values ($1, '2026-11-21') returning id`,
      [fx.g1],
    );
    const result = await (await as('sup1@test')).query('delete from sessions where id = $1', [session.rows[0]!.id]);
    expect(result.rowCount).toBe(0);
    expect(await audit()).toEqual([]);
  });
});

describe('0017_audit_admin_changes: profiles', () => {
  test('staff edits of role, group, activity, tracking, joined_at and name are recorded', async () => {
    const target = await createTestUser({
      email: 'audit.target@test',
      fullName: 'هدف',
      role: 'student',
      groupId: fx.g1,
    });
    const admin = await as('admin@test');
    await admin.query(
      `update profiles set full_name = 'هدف مصحّح', group_id = $2, is_active = false, is_tracked = false,
                           joined_at = '2025-09-01', role = 'supervisor'
        where id = $1`,
      [target.id, fx.g2],
    );
    const rows = await audit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: fx.admin,
      action: 'profile.update',
      target: { table: 'profiles', id: target.id },
    });
    expect(rows[0]!.diff).toEqual({
      full_name: { old: 'هدف', new: 'هدف مصحّح' },
      group_id: { old: fx.g1, new: fx.g2 },
      is_active: { old: true, new: false },
      is_tracked: { old: true, new: false },
      joined_at: { old: expect.any(String), new: '2025-09-01' },
      role: { old: 'student', new: 'supervisor' },
    });
  });

  test("a student's own self-service edits (timezone, reminders) are not audited", async () => {
    const p1 = await as('p1@test');
    await p1.query(
      `update profiles set timezone = 'Asia/Dubai', reminder_time = '20:00', weekly_reminder = false where id = $1`,
      [fx.p1],
    );
    expect(await audit()).toEqual([]);
  });

  test('an admin changing only self-service columns writes no row either', async () => {
    await (await as('admin@test')).query(`update profiles set reminder_time = '05:00' where id = $1`, [fx.p2]);
    expect(await audit()).toEqual([]);
  });

  test('the import system step (no claims) that moves joined_at back writes no row', async () => {
    await db.query(`update profiles set joined_at = '2024-01-01' where id = $1`, [fx.p2]);
    expect(await audit()).toEqual([]);
  });
});
