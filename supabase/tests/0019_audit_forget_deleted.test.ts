import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminDb, clientAs, createTestUser, resetTestData, seedFixture, type Fixture } from './helpers';

// The privacy policy (F-80) promises that after a permanent deletion only a minimal record remains: that the account
// was deleted (date, email; the user.delete row). 0017's profile.update rows carry the person's name and group
// changes, so they go with the profile; every other audit row stays.

let db: pg.Client;
let fx: Fixture;

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

afterAll(async () => {
  await db.end();
});

describe('0019_audit_forget_deleted: a deleted profile leaves only the minimal record', () => {
  test("the deleted person's profile.* rows go; user.delete and other rows stay", async () => {
    const gone = await createTestUser({ email: 'gone@test', fullName: 'اسم سيُحذف', role: 'student', groupId: fx.g1 });
    const admin = await clientAs('admin@test');
    try {
      await admin.query(`update profiles set full_name = 'اسم معدّل' where id = $1`, [gone.id]);
      await admin.query(`update profiles set full_name = 'P2 مصحّح' where id = $1`, [fx.p2]);
      const before = await db.query(`select 1 from audit_log where action = 'profile.update' and target ->> 'id' = $1`, [
        gone.id,
      ]);
      expect(before.rowCount).toBe(1);

      await admin.rpc('admin_delete_user', { p_user_id: gone.id });
    } finally {
      await admin.end();
    }

    const left = await db.query<{ action: string; text: string }>(
      `select action, target::text || coalesce(diff::text, '') as text from audit_log
        where target ->> 'id' = $1 or diff::text like '%اسم%'`,
      [gone.id],
    );
    expect(left.rows.map((row) => row.action)).toEqual(['user.delete']);
    expect(left.rows[0]!.text).not.toContain('اسم');
    const others = await db.query(`select 1 from audit_log where action = 'profile.update' and target ->> 'id' = $1`, [
      fx.p2,
    ]);
    expect(others.rowCount).toBe(1);
  });
});
