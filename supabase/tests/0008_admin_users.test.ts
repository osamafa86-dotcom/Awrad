import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from './helpers';

let db: pg.Client;
let fx: Fixture;
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

async function count(sql: string, params: unknown[]): Promise<number> {
  const result = await db.query<{ n: string }>(`select count(*) as n from (${sql}) s`, params);
  return Number(result.rows[0]!.n);
}

/** A daily log, a session the user attended and a pending deletion request, all for `userId`. */
async function giveHistory(userId: string, recordedBy: string): Promise<void> {
  await db.query(
    `insert into logs (user_id, period, period_start, note) values ($1, 'daily', '2026-11-20', 'ملاحظة')`,
    [userId],
  );
  const session = await db.query<{ id: string }>(
    `insert into sessions (session_date, title, created_by) values ('2026-11-20', 'مجلس', $1) returning id`,
    [recordedBy],
  );
  await db.query(
    `insert into attendance (session_id, user_id, status, recorded_by) values ($1, $2, 'present', $3)`,
    [session.rows[0]!.id, userId, recordedBy],
  );
  await db.query('insert into deletion_requests (user_id) values ($1)', [userId]);
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0008_admin_users: admin_delete_user', () => {
  test('a supervisor cannot delete a student of their group (FORBIDDEN)', async () => {
    const sup1 = await as('sup1@test');
    const error = await failure(sup1.rpc('admin_delete_user', { p_user_id: fx.p1 }));
    expect(error.message).toBe('FORBIDDEN');
    expect(error.code).toBe('42501');
    expect(await count('select 1 from auth.users where id = $1', [fx.p1])).toBe(1);
  });

  test('a student cannot delete anyone (FORBIDDEN)', async () => {
    const p1 = await as('p1@test');
    const error = await failure(p1.rpc('admin_delete_user', { p_user_id: fx.p2 }));
    expect(error.message).toBe('FORBIDDEN');
  });

  test('an admin cannot delete their own account (FORBIDDEN)', async () => {
    const admin = await as('admin@test');
    const error = await failure(admin.rpc('admin_delete_user', { p_user_id: fx.admin }));
    expect(error.message).toBe('FORBIDDEN');
    expect(await count('select 1 from profiles where id = $1', [fx.admin])).toBe(1);
  });

  test('anon may not execute the function at all', async () => {
    await db.query('begin');
    try {
      await db.query('set local role anon');
      const error = await failure(db.query('select admin_delete_user($1)', [fx.p2]));
      expect(error.message).toMatch(/permission denied for function admin_delete_user/);
    } finally {
      await db.query('rollback');
    }
  });

  test('an admin deletes a student: the account and everything below it are gone, an audit row stays', async () => {
    await giveHistory(fx.p2, fx.sup2);
    expect(await count('select 1 from logs where user_id = $1', [fx.p2])).toBe(1);

    const admin = await as('admin@test');
    await admin.rpc('admin_delete_user', { p_user_id: fx.p2 });

    expect(await count('select 1 from auth.users where id = $1', [fx.p2])).toBe(0);
    expect(await count('select 1 from profiles where id = $1', [fx.p2])).toBe(0);
    expect(await count('select 1 from logs where user_id = $1', [fx.p2])).toBe(0);
    expect(await count('select 1 from attendance where user_id = $1', [fx.p2])).toBe(0);
    expect(await count('select 1 from deletion_requests where user_id = $1', [fx.p2])).toBe(0);

    const audit = await db.query<{ actor_id: string; target: Record<string, unknown> }>(
      `select actor_id, target from audit_log where action = 'user.delete'`,
    );
    expect(audit.rows).toEqual([
      { actor_id: fx.admin, target: { table: 'auth.users', id: fx.p2, email: 'p2@test' } },
    ]);
  });

  test('an admin can delete a supervisor who recorded history; the references to them are cleared', async () => {
    await giveHistory(fx.p1, fx.sup1);
    // sup1 also handled a support request and invited someone
    await db.query(`update logs set handled_by = $1 where user_id = $2`, [fx.sup1, fx.p1]);
    await db.query(
      `insert into invitations (email, full_name, invited_by) values ('later@test', 'Later', $1)`,
      [fx.sup1],
    );
    await db.query(`insert into audit_log (actor_id, action) values ($1, 'attendance.set')`, [
      fx.sup1,
    ]);

    const admin = await as('admin@test');
    await admin.rpc('admin_delete_user', { p_user_id: fx.sup1 });

    expect(await count('select 1 from profiles where id = $1', [fx.sup1])).toBe(0);
    // the student's own history survives the supervisor's deletion
    expect(
      await count('select 1 from logs where user_id = $1 and handled_by is null', [fx.p1]),
    ).toBe(1);
    expect(
      await count('select 1 from attendance where user_id = $1 and recorded_by is null', [fx.p1]),
    ).toBe(1);
    expect(
      await count(
        `select 1 from audit_log where action = 'attendance.set' and actor_id is null`,
        [],
      ),
    ).toBe(1);
  });

  test('deleting an id with no account is a no-op that still requires an admin', async () => {
    const admin = await as('admin@test');
    await admin.rpc('admin_delete_user', { p_user_id: '00000000-0000-0000-0000-000000000000' });
    expect(await count('select 1 from auth.users', [])).toBe(3);
  });
});
