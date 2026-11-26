import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminDb, createTestGroup, createTestUser, resetTestData } from './helpers';

let db: pg.Client;

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
});

afterAll(async () => {
  await db?.end();
});

async function weekStart(date: string, weekStartsOn: number): Promise<string> {
  const result = await db.query<{ d: string }>('select week_start($1::date, $2::int) as d', [
    date,
    weekStartsOn,
  ]);
  return result.rows[0]!.d;
}

async function localToday(userId: string, now: string): Promise<string> {
  const result = await db.query<{ d: string }>('select local_today($1, $2::timestamptz) as d', [
    userId,
    now,
  ]);
  return result.rows[0]!.d;
}

describe('0003_logs', () => {
  test("week_start('2026-11-26', 0) = '2026-11-22'", async () => {
    expect(await weekStart('2026-11-26', 0)).toBe('2026-11-22');
  });

  test("week_start('2026-11-26', 6) = '2026-11-21'", async () => {
    expect(await weekStart('2026-11-26', 6)).toBe('2026-11-21');
  });

  test("week_start('2026-11-22', 0) = '2026-11-22'", async () => {
    expect(await weekStart('2026-11-22', 0)).toBe('2026-11-22');
  });

  test("local_today for Asia/Riyadh user at 2026-11-26T22:30:00Z = '2026-11-27'", async () => {
    const group = await createTestGroup('g-riyadh');
    const user = await createTestUser({
      email: 'riyadh@example.com',
      fullName: 'Riyadh',
      role: 'student',
      groupId: group.id,
    });
    expect(await localToday(user.id, '2026-11-26T22:30:00Z')).toBe('2026-11-27');
  });

  test('local_today falls back to group timezone then Asia/Riyadh', async () => {
    const amman = await createTestGroup('g-amman', { timezone: 'Asia/Amman' });
    const inGroup = await createTestUser({
      email: 'amman@example.com',
      fullName: 'Amman',
      role: 'student',
      groupId: amman.id,
    });
    const loner = await createTestUser({
      email: 'nogroup@example.com',
      fullName: 'No Group',
      role: 'student',
    });
    const london = await createTestUser({
      email: 'london@example.com',
      fullName: 'London',
      role: 'student',
      groupId: amman.id,
    });
    await db.query(`update profiles set timezone = 'Europe/London' where id = $1`, [london.id]);

    // Jordan has used permanent UTC+3 since 2022, so the Amman and Riyadh dates coincide; the
    // zone name itself is asserted too, and London (UTC+0) separates the profile override.
    const zone = async (id: string): Promise<string> =>
      (await db.query<{ z: string }>('select user_timezone($1) as z', [id])).rows[0]!.z;
    expect(await zone(inGroup.id)).toBe('Asia/Amman');
    expect(await zone(loner.id)).toBe('Asia/Riyadh');
    expect(await zone(london.id)).toBe('Europe/London');
    expect(await localToday(inGroup.id, '2026-11-26T21:30:00Z')).toBe('2026-11-27');
    expect(await localToday(loner.id, '2026-11-26T21:30:00Z')).toBe('2026-11-27');
    expect(await localToday(london.id, '2026-11-26T21:30:00Z')).toBe('2026-11-26');
  });

  test('logs unique (user_id, period, period_start)', async () => {
    const user = await createTestUser({
      email: 'unique@example.com',
      fullName: 'Unique',
      role: 'student',
    });
    const insert = `insert into logs (user_id, period, period_start) values ($1, 'daily', '2026-11-26')`;
    await db.query(insert, [user.id]);
    await expect(db.query(insert, [user.id])).rejects.toMatchObject({ code: '23505' });
  });

  test('app.test_now overrides p_now inside a transaction', async () => {
    const group = await createTestGroup('g-override');
    const user = await createTestUser({
      email: 'override@example.com',
      fullName: 'Override',
      role: 'student',
      groupId: group.id,
    });
    await db.query('begin');
    try {
      await db.query(`select set_config('app.test_now', '2026-11-26T22:30:00Z', true)`);
      const inside = await db.query<{ d: string }>(
        `select local_today($1, '2026-11-26T10:00:00Z') as d`,
        [user.id],
      );
      expect(inside.rows[0]!.d).toBe('2026-11-27');
    } finally {
      await db.query('rollback');
    }
    expect(await localToday(user.id, '2026-11-26T10:00:00Z')).toBe('2026-11-26');
  });

  test('updated_at changes on update', async () => {
    const user = await createTestUser({
      email: 'updated@example.com',
      fullName: 'Updated',
      role: 'student',
    });
    const inserted = await db.query<{ id: string }>(
      `insert into logs (user_id, period, period_start) values ($1, 'daily', '2026-11-25')
       returning id`,
      [user.id],
    );
    const id = inserted.rows[0]!.id;
    await db.query(`update logs set note = 'x' where id = $1`, [id]);
    const row = await db.query<{ changed: boolean }>(
      'select updated_at > created_at as changed from logs where id = $1',
      [id],
    );
    expect(row.rows[0]!.changed).toBe(true);
  });
});
