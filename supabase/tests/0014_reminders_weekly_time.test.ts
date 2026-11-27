import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { adminDb, resetTestData, seedFixture, type Fixture } from './helpers';

// Ruling REM-3: the two reminders are independent switches (spec §12). Daily is off when reminder_time is
// null; weekly is governed by weekly_reminder alone and fires at coalesce(reminder_time,
// default_reminder_time) on the last day of the group week. Fixture groups: Asia/Riyadh, weeks from Sunday.
const SAT_2110 = '2026-11-28T18:10:00Z'; // Saturday 21:10 in Riyadh: last day of a Sunday week
const SAT_1910 = '2026-11-28T16:10:00Z'; // Saturday 19:10 in Riyadh

interface Due {
  user_id: string;
  kind: 'daily' | 'weekly';
  sent_for: string;
  tokens: string[];
}

let db: pg.Client;
let fx: Fixture;

async function due(now: string, settings: Record<string, string> = {}): Promise<Due[]> {
  await db.query('begin');
  try {
    await db.query('set local role service_role');
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    for (const [key, value] of Object.entries(settings)) {
      await db.query('select set_config($1, $2, true)', [key, value]);
    }
    const result = await db.query<Due>('select * from due_reminders($1)', [now]);
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
  await db.query(`update app_settings set value = '"21:00"' where key = 'default_reminder_time'`);
  await db.query(`update profiles set reminder_time = '21:00', weekly_reminder = true where id = $1`, [fx.p1]);
  await db.query(`insert into push_tokens (user_id, token, platform) values ($1, 'ExponentPushToken[a]', 'ios')`, [
    fx.p1,
  ]);
});

afterAll(async () => {
  await db.query(`update app_settings set value = '"21:00"' where key = 'default_reminder_time'`);
  await db.end();
});

describe('0014_reminders_weekly_time: the weekly reminder does not need the daily one', () => {
  test('daily off, weekly on: the weekly reminder is still due at the default hour', async () => {
    await db.query('update profiles set reminder_time = null where id = $1', [fx.p1]);
    expect(await due(SAT_2110)).toEqual([
      { user_id: fx.p1, kind: 'weekly', sent_for: '2026-11-22', tokens: ['ExponentPushToken[a]'] },
    ]);
  });

  test('daily off: the weekly hour follows default_reminder_time', async () => {
    await db.query('update profiles set reminder_time = null where id = $1', [fx.p1]);
    await db.query(`update app_settings set value = '"19:00"' where key = 'default_reminder_time'`);
    expect(await due(SAT_2110)).toEqual([]);
    expect((await due(SAT_1910)).map((row) => row.kind)).toEqual(['weekly']);
  });

  test('daily on: the weekly reminder fires at the user reminder_time, not the default', async () => {
    await db.query(`update profiles set reminder_time = '19:00' where id = $1`, [fx.p1]);
    expect(await due(SAT_2110)).toEqual([]);
    expect((await due(SAT_1910)).map((row) => row.kind)).toEqual(['daily', 'weekly']);
  });

  test('both off: nothing is due', async () => {
    await db.query('update profiles set reminder_time = null, weekly_reminder = false where id = $1', [fx.p1]);
    expect(await due(SAT_2110)).toEqual([]);
  });

  test('app.test_now pins both the hour and the local day', async () => {
    // p_now is a Thursday at 03:00 Riyadh; app.test_now (Saturday 21:10) wins for both checks.
    const rows = await due('2026-11-26T00:00:00Z', { 'app.test_now': SAT_2110 });
    expect(rows.map((row) => [row.kind, row.sent_for])).toEqual([
      ['daily', '2026-11-28'],
      ['weekly', '2026-11-22'],
    ]);
  });
});
