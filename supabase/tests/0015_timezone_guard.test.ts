import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from './helpers';

// Final review db I1: a student's free-text timezone reached `at time zone` for every reminder candidate, so one
// bad value made due_reminders fail for everyone. Writes are now checked against pg_timezone_names ('' → null),
// and the read path falls back profile → group → Asia/Riyadh for a value stored before the guard existed.
const SAT_2110 = '2026-11-28T18:10:00Z'; // Saturday 21:10 in Riyadh

interface Due {
  user_id: string;
  kind: string;
  sent_for: string;
}

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

async function zoneOf(userId: string): Promise<string | null> {
  const result = await db.query<{ timezone: string | null }>('select timezone from profiles where id = $1', [userId]);
  return result.rows[0]!.timezone;
}

/** Writes a value the guard would refuse, the way a row stored before 0015 looks (triggers skipped). */
async function storeUnchecked(sql: string, params: unknown[]): Promise<void> {
  await db.query('begin');
  try {
    await db.query('set local session_replication_role = replica');
    await db.query(sql, params);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function due(now: string): Promise<Due[]> {
  await db.query('begin');
  try {
    await db.query('set local role service_role');
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const result = await db.query<Due>('select user_id, kind, sent_for from due_reminders($1)', [now]);
    await db.query('commit');
    return result.rows;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

beforeEach(async () => {
  await db.query('truncate reminder_log, push_tokens, logs cascade');
  await db.query(`update profiles set timezone = null, reminder_time = '21:00', weekly_reminder = true`);
  await db.query(`update groups set timezone = 'Asia/Riyadh'`);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db.end();
});

describe('0015_timezone_guard: writes', () => {
  test('a student cannot store a zone that is not in pg_timezone_names', async () => {
    const p1 = await as('p1@test');
    const error = await failure(
      p1.query(`update profiles set timezone = 'Mars/Olympus' where id = $1`, [fx.p1]),
    );
    expect(error).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
    expect(await zoneOf(fx.p1)).toBeNull();
  });

  test('an empty or blank zone is stored as null (the group default)', async () => {
    const p1 = await as('p1@test');
    await p1.query(`update profiles set timezone = 'Africa/Cairo' where id = $1`, [fx.p1]);
    expect(await zoneOf(fx.p1)).toBe('Africa/Cairo');
    await p1.query(`update profiles set timezone = '' where id = $1`, [fx.p1]);
    expect(await zoneOf(fx.p1)).toBeNull();
    await p1.query(`update profiles set timezone = 'Africa/Cairo' where id = $1`, [fx.p1]);
    await p1.query(`update profiles set timezone = '   ' where id = $1`, [fx.p1]);
    expect(await zoneOf(fx.p1)).toBeNull();
  });

  test('a valid zone is accepted and other self-service edits are unaffected', async () => {
    const p1 = await as('p1@test');
    await p1.query(`update profiles set timezone = 'Europe/Istanbul', reminder_time = '20:00' where id = $1`, [
      fx.p1,
    ]);
    expect(await zoneOf(fx.p1)).toBe('Europe/Istanbul');
    await p1.query(`update profiles set reminder_time = '19:00' where id = $1`, [fx.p1]);
    expect(await zoneOf(fx.p1)).toBe('Europe/Istanbul');
  });

  test('an admin cannot store a bad zone on a profile either', async () => {
    const admin = await as('admin@test');
    const error = await failure(
      admin.query(`update profiles set timezone = 'Asia/Atlantis' where id = $1`, [fx.p2]),
    );
    expect(error).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
  });

  test('direct writes to groups are checked the same way (upsert_group already was)', async () => {
    const admin = await as('admin@test');
    const update = await failure(admin.query(`update groups set timezone = 'Nowhere/City' where id = $1`, [fx.g1]));
    expect(update).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
    const blank = await failure(admin.query(`update groups set timezone = '' where id = $1`, [fx.g1]));
    expect(blank).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
    const insert = await failure(
      admin.query(`insert into groups (name, timezone) values ('Gx', 'Bad/Zone')`),
    );
    expect(insert).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
    await admin.query(`update groups set timezone = 'Asia/Dubai' where id = $1`, [fx.g1]);
    const row = await db.query<{ timezone: string }>('select timezone from groups where id = $1', [fx.g1]);
    expect(row.rows[0]!.timezone).toBe('Asia/Dubai');
  });
});

describe('0015_timezone_guard: a value stored before the guard cannot break the batch', () => {
  test('due_reminders still answers for everyone else when one profile holds a bad zone', async () => {
    for (const [user, token] of [
      [fx.p1, 'ExponentPushToken[p1]'],
      [fx.p2, 'ExponentPushToken[p2]'],
    ] as const) {
      await db.query(`insert into push_tokens (user_id, token, platform) values ($1, $2, 'ios')`, [user, token]);
    }
    await storeUnchecked(`update profiles set timezone = 'Mars/Olympus' where id = $1`, [fx.p1]);
    expect(await zoneOf(fx.p1)).toBe('Mars/Olympus');

    const rows = await due(SAT_2110);
    // p1 falls back to its group's zone (Asia/Riyadh), so it is due at 21:00 Riyadh like p2.
    expect(rows.filter((row) => row.kind === 'daily').map((row) => row.user_id).sort()).toEqual(
      [fx.p1, fx.p2].sort(),
    );
  });

  test('the fallback chain is profile → group → Asia/Riyadh', async () => {
    await storeUnchecked(`update profiles set timezone = '' where id = $1`, [fx.p1]);
    await db.query(`update groups set timezone = 'Asia/Tokyo' where id = $1`, [fx.g1]);
    const viaGroup = await db.query<{ zone: string }>('select user_timezone($1) as zone', [fx.p1]);
    expect(viaGroup.rows[0]!.zone).toBe('Asia/Tokyo');

    await storeUnchecked(`update groups set timezone = 'Bad/Zone' where id = $1`, [fx.g1]);
    const viaDefault = await db.query<{ zone: string; today: string }>(
      `select user_timezone($1) as zone, local_today($1, '2026-11-28T22:30:00Z')::text as today`,
      [fx.p1],
    );
    // 22:30 UTC is 01:30 the next day in Riyadh.
    expect(viaDefault.rows[0]).toEqual({ zone: 'Asia/Riyadh', today: '2026-11-29' });
  });

  test('the migration clears bad values that are already stored', async () => {
    await storeUnchecked(`update profiles set timezone = 'Mars/Olympus' where id = $1`, [fx.p1]);
    await storeUnchecked(`update groups set timezone = 'Bad/Zone' where id = $1`, [fx.g1]);
    await db.query('select clear_invalid_timezones()');
    expect(await zoneOf(fx.p1)).toBeNull();
    const group = await db.query<{ timezone: string }>('select timezone from groups where id = $1', [fx.g1]);
    expect(group.rows[0]!.timezone).toBe('Asia/Riyadh');
  });
});
