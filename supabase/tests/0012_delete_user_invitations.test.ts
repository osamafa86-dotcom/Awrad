import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminDb, clientAs, resetTestData, seedFixture, type Fixture, type UserClient } from './helpers';

let db: pg.Client;
let fx: Fixture;
const clients: UserClient[] = [];

async function as(email: string): Promise<UserClient> {
  const client = await clientAs(email);
  clients.push(client);
  return client;
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const result = await db.query<{ n: string }>(`select count(*) as n from (${sql}) s`, params);
  return Number(result.rows[0]!.n);
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db.end();
});

describe('0012_delete_user_invitations: admin_delete_user removes the account invitations', () => {
  test('the accepted and any pending invitation for the email go; others and the audit row stay', async () => {
    await db.query(
      `insert into invitations (email, full_name, group_id, accepted_at)
       values ('P2@Test', 'طالب ثانٍ', $1, now()), ('p2@test', 'طالب ثانٍ', $1, null),
              ('other@test', 'آخر', $1, null)`,
      [fx.g2],
    );

    const admin = await as('admin@test');
    await admin.rpc('admin_delete_user', { p_user_id: fx.p2 });

    expect(await count('select 1 from auth.users where id = $1', [fx.p2])).toBe(0);
    expect(await count(`select 1 from invitations where lower(email) = 'p2@test'`, [])).toBe(0);
    expect(await count(`select 1 from invitations where email = 'other@test'`, [])).toBe(1);

    const audit = await db.query<{ actor_id: string; target: Record<string, unknown> }>(
      `select actor_id, target from audit_log where action = 'user.delete'`,
    );
    expect(audit.rows).toEqual([
      { actor_id: fx.admin, target: { table: 'auth.users', id: fx.p2, email: 'p2@test' } },
    ]);
  });

  test('a refused deletion (supervisor) leaves the invitation in place', async () => {
    await db.query(`insert into invitations (email, full_name, accepted_at) values ('p1@test', 'طالب أول', now())`);
    const before = await count(`select 1 from invitations where email = 'p1@test'`, []);
    expect(before).toBeGreaterThan(0);
    const sup1 = await as('sup1@test');
    await expect(sup1.rpc('admin_delete_user', { p_user_id: fx.p1 })).rejects.toMatchObject({ message: 'FORBIDDEN' });
    expect(await count(`select 1 from invitations where email = 'p1@test'`, [])).toBe(before);
  });

  test('anon still may not execute the function', async () => {
    await db.query('begin');
    try {
      await db.query('set local role anon');
      await expect(db.query('select admin_delete_user($1)', [fx.p1])).rejects.toThrow(
        /permission denied for function admin_delete_user/,
      );
    } finally {
      await db.query('rollback');
    }
  });
});
