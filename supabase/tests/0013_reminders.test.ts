import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  createTestGroup,
  createTestUser,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from './helpers';

// Spec §12: due_reminders(p_now) is the hourly job's question «who gets a reminder this hour?».
// The fixture's tracked users all have reminder_time 21:00 (default_reminder_time) and groups on
// Asia/Riyadh (UTC+3) with weeks starting on Sunday; only users holding a push token can be due.
const THU_2110 = '2026-11-26T18:10:00Z'; // Thursday 21:10 in Riyadh
const THU_2010 = '2026-11-26T17:10:00Z'; // Thursday 20:10 in Riyadh
const FRI_2110 = '2026-11-27T18:10:00Z'; // Friday 21:10 in Riyadh
const SAT_2110 = '2026-11-28T18:10:00Z'; // Saturday 21:10 in Riyadh: last day of a Sunday week

interface Due {
  user_id: string;
  kind: 'daily' | 'weekly';
  sent_for: string;
  tokens: string[];
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

/** Runs `sql` the way the Edge Function does: role service_role with service_role JWT claims. */
async function asService<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('begin');
  try {
    await db.query('set local role service_role');
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const result = await db.query<T>(sql, params);
    await db.query('commit');
    return result.rows;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

function due(now: string): Promise<Due[]> {
  return asService<Due>('select * from due_reminders($1)', [now]);
}

async function addToken(userId: string, token: string): Promise<void> {
  await db.query(`insert into push_tokens (user_id, token, platform) values ($1, $2, 'android')`, [
    userId,
    token,
  ]);
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

beforeEach(async () => {
  // Every test starts from the fixture as seeded: no tokens, logs or reminders; profiles at defaults.
  await db.query('truncate reminder_log, push_tokens, logs cascade');
  await db.query(
    `update profiles set is_active = true, timezone = null, reminder_time = '21:00', weekly_reminder = true
     where id = any($1)`,
    [[fx.p1, fx.p2, fx.sup1, fx.sup2]],
  );
  await db.query(`update profiles set is_tracked = true where id = any($1)`, [[fx.p1, fx.p2]]);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db.end();
});

describe('0013_reminders: due_reminders — daily', () => {
  test('a tracked user whose reminder hour is the local hour and who has not logged today is due', async () => {
    await addToken(fx.p1, 'ExponentPushToken[b]');
    await addToken(fx.p1, 'ExponentPushToken[a]');
    expect(await due(THU_2110)).toEqual([
      {
        user_id: fx.p1,
        kind: 'daily',
        sent_for: '2026-11-26',
        tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
      },
    ]);
  });

  test('a daily log for today removes the user', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query(`insert into logs (user_id, period, period_start) values ($1, 'daily', '2026-11-26')`, [
      fx.p1,
    ]);
    expect(await due(THU_2110)).toEqual([]);
  });

  test('a log for another day does not count as today', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query(`insert into logs (user_id, period, period_start) values ($1, 'daily', '2026-11-25')`, [
      fx.p1,
    ]);
    expect((await due(THU_2110)).map((row) => row.user_id)).toEqual([fx.p1]);
  });

  test('a reminder already sent for today removes the user', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query(`insert into reminder_log (user_id, kind, sent_for) values ($1, 'daily', '2026-11-26')`, [
      fx.p1,
    ]);
    expect(await due(THU_2110)).toEqual([]);
  });

  test('another local hour (20:10 for a 21:00 reminder) is not due', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    expect(await due(THU_2010)).toEqual([]);
  });

  test('the profile timezone wins over the group timezone (BR-08)', async () => {
    await addToken(fx.p2, 'ExponentPushToken[cairo]');
    // Cairo is UTC+2 in November: 18:10Z is 20:10 there, 19:10Z is 21:10.
    await db.query(`update profiles set timezone = 'Africa/Cairo' where id = $1`, [fx.p2]);
    expect(await due(THU_2110)).toEqual([]);
    expect(await due('2026-11-26T19:10:00Z')).toEqual([
      { user_id: fx.p2, kind: 'daily', sent_for: '2026-11-26', tokens: ['ExponentPushToken[cairo]'] },
    ]);
  });

  test('the group timezone applies when the profile has none', async () => {
    const dubai = await createTestGroup('مجموعة دبي', { timezone: 'Asia/Dubai' });
    const user = await createTestUser({
      email: 'dubai@test',
      fullName: 'Dubai',
      role: 'student',
      groupId: dubai.id,
    });
    await addToken(user.id, 'ExponentPushToken[dubai]');
    // Dubai is UTC+4: 17:10Z is 21:10 there (and 20:10 in Riyadh, so nobody else is due).
    expect(await due('2026-11-26T17:10:00Z')).toEqual([
      { user_id: user.id, kind: 'daily', sent_for: '2026-11-26', tokens: ['ExponentPushToken[dubai]'] },
    ]);
    await db.query('delete from auth.users where id = $1', [user.id]);
  });

  test('the local date decides the day: 23:30 local is still that day after UTC midnight', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query(`update profiles set reminder_time = '23:30' where id = $1`, [fx.p1]);
    // 2026-11-26T20:45Z is 23:45 on Thursday in Riyadh.
    expect(await due('2026-11-26T20:45:00Z')).toEqual([
      { user_id: fx.p1, kind: 'daily', sent_for: '2026-11-26', tokens: ['ExponentPushToken[a]'] },
    ]);
  });

  test('a user without push tokens is never due', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    expect((await due(THU_2110)).map((row) => row.user_id)).toEqual([fx.p1]);
  });

  test('inactive, untracked and reminder-less users are excluded', async () => {
    await addToken(fx.p1, 'ExponentPushToken[p1]');
    await addToken(fx.p2, 'ExponentPushToken[p2]');
    await addToken(fx.sup1, 'ExponentPushToken[sup1]');
    await addToken(fx.admin, 'ExponentPushToken[admin]'); // admin: not tracked
    await db.query('update profiles set is_active = false where id = $1', [fx.p1]);
    await db.query('update profiles set is_tracked = false where id = $1', [fx.p2]);
    await db.query('update profiles set reminder_time = null where id = $1', [fx.sup1]);
    await db.query(`update profiles set reminder_time = '21:00' where id = $1`, [fx.admin]);
    expect(await due(THU_2110)).toEqual([]);
  });
});

describe('0013_reminders: due_reminders — weekly', () => {
  test('not before the last day of the group week', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    expect((await due(THU_2110)).map((row) => row.kind)).toEqual(['daily']);
    expect((await due(FRI_2110)).map((row) => row.kind)).toEqual(['daily']);
  });

  test('on the last day of a Sunday week, with sent_for = the week start', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    expect(await due(SAT_2110)).toEqual([
      { user_id: fx.p1, kind: 'daily', sent_for: '2026-11-28', tokens: ['ExponentPushToken[a]'] },
      { user_id: fx.p1, kind: 'weekly', sent_for: '2026-11-22', tokens: ['ExponentPushToken[a]'] },
    ]);
  });

  test('follows the group week start (BR-05): a Saturday week ends on Friday', async () => {
    const sat = await createTestGroup('مجموعة السبت', { weekStartsOn: 6 });
    const user = await createTestUser({
      email: 'saturday@test',
      fullName: 'Saturday',
      role: 'student',
      groupId: sat.id,
    });
    await addToken(user.id, 'ExponentPushToken[sat]');
    await addToken(fx.p1, 'ExponentPushToken[p1]');
    const friday = await due(FRI_2110);
    expect(friday.filter((row) => row.kind === 'weekly')).toEqual([
      { user_id: user.id, kind: 'weekly', sent_for: '2026-11-21', tokens: ['ExponentPushToken[sat]'] },
    ]);
    const saturday = await due(SAT_2110);
    expect(saturday.filter((row) => row.kind === 'weekly').map((row) => row.user_id)).toEqual([fx.p1]);
    await db.query('delete from auth.users where id = $1', [user.id]);
  });

  test('a weekly review already written removes only the weekly reminder', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query(`insert into logs (user_id, period, period_start) values ($1, 'weekly', '2026-11-22')`, [
      fx.p1,
    ]);
    expect((await due(SAT_2110)).map((row) => row.kind)).toEqual(['daily']);
  });

  test('a weekly reminder already sent for the week is not sent again', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query(`insert into reminder_log (user_id, kind, sent_for) values ($1, 'weekly', '2026-11-22')`, [
      fx.p1,
    ]);
    expect((await due(SAT_2110)).map((row) => row.kind)).toEqual(['daily']);
  });

  test('weekly_reminder = false switches off the weekly reminder only', async () => {
    await addToken(fx.p1, 'ExponentPushToken[a]');
    await db.query('update profiles set weekly_reminder = false where id = $1', [fx.p1]);
    expect((await due(SAT_2110)).map((row) => row.kind)).toEqual(['daily']);
  });
});

describe('0013_reminders: access', () => {
  test('an admin session (not the service role) gets FORBIDDEN', async () => {
    const admin = await as('admin@test');
    const error = await failure(admin.rpc('due_reminders', { p_now: THU_2110 }));
    expect(error).toMatchObject({ message: 'FORBIDDEN', code: '42501' });
  });

  test('anon may not execute due_reminders', async () => {
    await db.query('begin');
    try {
      await db.query('set local role anon');
      await expect(db.query('select * from due_reminders(now())')).rejects.toThrow(
        /permission denied for function due_reminders/,
      );
    } finally {
      await db.query('rollback');
    }
  });

  test('reminder_log: a signed-in user sees no rows and cannot insert; the service role can', async () => {
    await db.query(`insert into reminder_log (user_id, kind, sent_for) values ($1, 'daily', '2026-11-26')`, [
      fx.p1,
    ]);
    const p1 = await as('p1@test');
    expect((await p1.query('select * from reminder_log')).rows).toEqual([]);
    const error = await failure(
      p1.query(`insert into reminder_log (user_id, kind, sent_for) values ($1, 'daily', '2026-11-27')`, [
        fx.p1,
      ]),
    );
    expect(error.message).toMatch(/row-level security/);

    const rows = await asService<{ n: string }>(
      `with ins as (
         insert into reminder_log (user_id, kind, sent_for) values ($1, 'daily', '2026-11-26'), ($1, 'daily', '2026-11-27')
         on conflict (user_id, kind, sent_for) do nothing returning 1)
       select count(*) as n from ins`,
      [fx.p1],
    );
    expect(rows).toEqual([{ n: '1' }]);
  });

  test('reminder_log rejects an unknown kind', async () => {
    await expect(
      db.query(`insert into reminder_log (user_id, kind, sent_for) values ($1, 'monthly', '2026-11-26')`, [fx.p1]),
    ).rejects.toThrow(/reminder_log_kind_check/);
  });

  test('reminder_log rows go with the user', async () => {
    const user = await createTestUser({ email: 'gone@test', fullName: 'Gone', role: 'student', groupId: fx.g1 });
    await db.query(`insert into reminder_log (user_id, kind, sent_for) values ($1, 'daily', '2026-11-26')`, [
      user.id,
    ]);
    await db.query('delete from auth.users where id = $1', [user.id]);
    const left = await db.query('select 1 from reminder_log where user_id = $1', [user.id]);
    expect(left.rowCount).toBe(0);
  });
});

describe('0013_reminders: ensure_reminder_schedule', () => {
  test('without pg_cron/pg_net (local cluster, CI) it schedules nothing and says so', async () => {
    const [row] = await asService<{ ensure_reminder_schedule: boolean }>('select ensure_reminder_schedule()');
    expect(row).toEqual({ ensure_reminder_schedule: false });
    const admin = await as('admin@test');
    expect(await admin.rpc('ensure_reminder_schedule')).toBe(false);
  });

  test('a non-admin user gets FORBIDDEN', async () => {
    const p1 = await as('p1@test');
    const error = await failure(p1.rpc('ensure_reminder_schedule'));
    expect(error).toMatchObject({ message: 'FORBIDDEN', code: '42501' });
  });
});
