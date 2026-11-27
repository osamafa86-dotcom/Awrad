import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  createTestUser,
  resetTestData,
  seedFixture,
  type Fixture,
  type UserClient,
} from './helpers';

let db: pg.Client;
let fx: Fixture;
const clients: UserClient[] = [];
/** app_settings as seeded: resetTestData keeps the table, so every test puts it back for the other files. */
let seeded: Array<{ key: string; value: unknown }>;

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

async function settings(): Promise<Record<string, unknown>> {
  const result = await db.query<{ key: string; value: unknown }>('select key, value from app_settings');
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

async function audits(action: string): Promise<Array<{ actor_id: string; target: unknown; diff: unknown }>> {
  const result = await db.query(
    'select actor_id, target, diff from audit_log where action = $1 order by id',
    [action],
  );
  return result.rows;
}

function updateSettings(client: UserClient, values: unknown): Promise<unknown> {
  return client.rpc('update_app_settings', { p_values: JSON.stringify(values) });
}

interface GroupInput {
  id?: string | null;
  name: string;
  timezone?: string;
  weekStartsOn?: number;
  supervisorIds?: string[];
}

function upsertGroup(client: UserClient, input: GroupInput): Promise<string> {
  return client.rpc<string>('upsert_group', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_timezone: input.timezone ?? 'Asia/Riyadh',
    p_week_starts_on: input.weekStartsOn ?? 0,
    p_supervisor_ids: input.supervisorIds ?? [],
  });
}

async function groupRow(id: string) {
  const result = await db.query<{ name: string; timezone: string; week_starts_on: number }>(
    'select name, timezone, week_starts_on from groups where id = $1',
    [id],
  );
  return result.rows[0];
}

async function supervisorsOf(id: string): Promise<string[]> {
  const result = await db.query<{ user_id: string }>(
    'select user_id from group_supervisors where group_id = $1 order by user_id',
    [id],
  );
  return result.rows.map((row) => row.user_id);
}

const sorted = (ids: string[]) => [...ids].sort();

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
  seeded = (await db.query('select key, value from app_settings')).rows;
});

beforeEach(async () => {
  await db.query(`delete from audit_log where action in ('settings.update', 'group.create', 'group.update')`);
});

afterEach(async () => {
  for (const row of seeded) {
    await db.query('update app_settings set value = $2 where key = $1', [row.key, JSON.stringify(row.value)]);
  }
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0011_settings: update_app_settings', () => {
  test('a supervisor or a student → FORBIDDEN, and nothing changes', async () => {
    for (const email of ['sup1@test', 'p1@test']) {
      const error = await failure(updateSettings(await as(email), { backfill_days: 5 }));
      expect(error).toMatchObject({ message: 'FORBIDDEN', code: '42501' });
    }
    expect((await settings()).backfill_days).toBe(2);
    expect(await audits('settings.update')).toEqual([]);
  });

  test('a deactivated admin → FORBIDDEN', async () => {
    await createTestUser({ email: 'admin-off@test', fullName: 'Off', role: 'admin', isTracked: false });
    await db.query(`update profiles set is_active = false where id = (select id from auth.users where email = 'admin-off@test')`);
    const error = await failure(updateSettings(await as('admin-off@test'), { backfill_days: 5 }));
    expect(error).toMatchObject({ message: 'FORBIDDEN' });
  });

  test('the admin changes only the keys given; setting_int reads the new value', async () => {
    const admin = await as('admin@test');
    await updateSettings(admin, { backfill_days: 5 });
    expect(await settings()).toEqual({
      streak_threshold_pct: 100,
      backfill_days: 5,
      weekly_grace_days: 3,
      excused_counts_as_absent: false,
      hijri_adjustment_days: 0,
      default_reminder_time: '21:00',
    });
    const read = await db.query<{ v: number }>(`select setting_int('backfill_days') as v`);
    expect(read.rows[0]!.v).toBe(5);
  });

  test('all six keys at once, each at an edge of its range', async () => {
    const admin = await as('admin@test');
    await updateSettings(admin, {
      streak_threshold_pct: 50,
      backfill_days: 14,
      weekly_grace_days: 0,
      excused_counts_as_absent: true,
      hijri_adjustment_days: -2,
      default_reminder_time: '05:30',
    });
    expect(await settings()).toEqual({
      streak_threshold_pct: 50,
      backfill_days: 14,
      weekly_grace_days: 0,
      excused_counts_as_absent: true,
      hijri_adjustment_days: -2,
      default_reminder_time: '05:30',
    });
    const bool = await db.query<{ v: boolean }>(`select setting_bool('excused_counts_as_absent') as v`);
    expect(bool.rows[0]!.v).toBe(true);
  });

  test('one audit row settings.update with {old, new} for the changed keys only', async () => {
    const admin = await as('admin@test');
    // backfill_days changes; weekly_grace_days is sent with its current value.
    await updateSettings(admin, { backfill_days: 7, weekly_grace_days: 3, default_reminder_time: '20:15' });
    expect(await audits('settings.update')).toEqual([
      {
        actor_id: fx.admin,
        target: { table: 'app_settings' },
        diff: {
          backfill_days: { old: 2, new: 7 },
          default_reminder_time: { old: '21:00', new: '20:15' },
        },
      },
    ]);
  });

  test('nothing changed (same values, or an empty object) → no audit row', async () => {
    const admin = await as('admin@test');
    await updateSettings(admin, { backfill_days: 2, excused_counts_as_absent: false });
    await updateSettings(admin, {});
    expect(await audits('settings.update')).toEqual([]);
  });

  test.each([
    ['an unknown key', { unknown_key: 1 }],
    ['streak_threshold_pct below 50', { streak_threshold_pct: 49 }],
    ['streak_threshold_pct above 100', { streak_threshold_pct: 101 }],
    ['streak_threshold_pct not an integer', { streak_threshold_pct: 75.5 }],
    ['backfill_days below 0', { backfill_days: -1 }],
    ['backfill_days above 14', { backfill_days: 15 }],
    ['backfill_days as a string', { backfill_days: '5' }],
    ['weekly_grace_days above 7', { weekly_grace_days: 8 }],
    ['weekly_grace_days below 0', { weekly_grace_days: -1 }],
    ['hijri_adjustment_days below −2', { hijri_adjustment_days: -3 }],
    ['hijri_adjustment_days above 2', { hijri_adjustment_days: 3 }],
    ['excused_counts_as_absent not a boolean', { excused_counts_as_absent: 'true' }],
    ['default_reminder_time 24:00', { default_reminder_time: '24:00' }],
    ['default_reminder_time 9:00 (one-digit hour)', { default_reminder_time: '9:00' }],
    ['default_reminder_time 21:60', { default_reminder_time: '21:60' }],
    ['default_reminder_time not a string', { default_reminder_time: 2100 }],
    ['a null value', { backfill_days: null }],
  ])('%s → INVALID_ITEM, and no key changes', async (_label, values) => {
    const admin = await as('admin@test');
    // A valid key beside the invalid one: the whole call is refused.
    const error = await failure(updateSettings(admin, { weekly_grace_days: 5, ...values }));
    expect(error).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
    expect((await settings()).weekly_grace_days).toBe(3);
    expect(await audits('settings.update')).toEqual([]);
  });

  test('p_values that is not an object → INVALID_ITEM', async () => {
    const admin = await as('admin@test');
    for (const values of [[1, 2], 'x', 5]) {
      expect(await failure(updateSettings(admin, values))).toMatchObject({ message: 'INVALID_ITEM' });
    }
  });

  test('anon cannot execute it; authenticated can', async () => {
    const result = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'update_app_settings(jsonb)', 'execute') as anon,
              has_function_privilege('authenticated', 'update_app_settings(jsonb)', 'execute') as authenticated`,
    );
    expect(result.rows[0]).toEqual({ anon: false, authenticated: true });
  });
});

describe('0011_settings: upsert_group', () => {
  test('a supervisor → FORBIDDEN on create and on update', async () => {
    const sup1 = await as('sup1@test');
    expect(await failure(upsertGroup(sup1, { name: 'مجموعة المشرف' }))).toMatchObject({
      message: 'FORBIDDEN',
      code: '42501',
    });
    expect(await failure(upsertGroup(sup1, { id: fx.g1, name: 'اسم جديد' }))).toMatchObject({
      message: 'FORBIDDEN',
    });
    expect((await groupRow(fx.g1))!.name).toBe('G1');
  });

  test('create: trimmed name, zone, week start, supervisors, and a group.create audit row', async () => {
    const admin = await as('admin@test');
    const id = await upsertGroup(admin, {
      name: '  مجموعة الفجر  ',
      timezone: 'Asia/Amman',
      weekStartsOn: 1,
      supervisorIds: [fx.sup1, fx.admin],
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await groupRow(id)).toEqual({ name: 'مجموعة الفجر', timezone: 'Asia/Amman', week_starts_on: 1 });
    expect(await supervisorsOf(id)).toEqual(sorted([fx.sup1, fx.admin]));
    expect(await audits('group.create')).toEqual([
      {
        actor_id: fx.admin,
        target: { table: 'groups', id },
        diff: {
          name: { old: null, new: 'مجموعة الفجر' },
          timezone: { old: null, new: 'Asia/Amman' },
          week_starts_on: { old: null, new: 1 },
          supervisors: { added: sorted([fx.sup1, fx.admin]), removed: [] },
        },
      },
    ]);
  });

  test('update: the supervisors set is replaced exactly, and the audit diff names what changed', async () => {
    const admin = await as('admin@test');
    const id = await upsertGroup(admin, { name: 'مجموعة العصر', supervisorIds: [fx.sup1, fx.sup2] });
    await upsertGroup(admin, {
      id,
      name: 'مجموعة العصر',
      timezone: 'Africa/Cairo',
      weekStartsOn: 6,
      supervisorIds: [fx.sup2, fx.admin],
    });
    expect(await groupRow(id)).toEqual({ name: 'مجموعة العصر', timezone: 'Africa/Cairo', week_starts_on: 6 });
    expect(await supervisorsOf(id)).toEqual(sorted([fx.sup2, fx.admin]));
    // Other groups' supervisors are untouched.
    expect(await supervisorsOf(fx.g1)).toEqual([fx.sup1]);
    expect(await audits('group.update')).toEqual([
      {
        actor_id: fx.admin,
        target: { table: 'groups', id },
        diff: {
          timezone: { old: 'Asia/Riyadh', new: 'Africa/Cairo' },
          week_starts_on: { old: 0, new: 6 },
          supervisors: { added: [fx.admin], removed: [fx.sup1] },
        },
      },
    ]);
  });

  test('update: a rename alone, then removing every supervisor; an unchanged save writes no audit row', async () => {
    const admin = await as('admin@test');
    await upsertGroup(admin, { id: fx.g2, name: 'G2 الجديدة', supervisorIds: [fx.sup2] });
    await upsertGroup(admin, { id: fx.g2, name: 'G2 الجديدة', supervisorIds: [] });
    await upsertGroup(admin, { id: fx.g2, name: 'G2 الجديدة', supervisorIds: [] });
    expect(await supervisorsOf(fx.g2)).toEqual([]);
    expect((await audits('group.update')).map((row) => row.diff)).toEqual([
      { name: { old: 'G2', new: 'G2 الجديدة' } },
      { supervisors: { added: [], removed: [fx.sup2] } },
    ]);
    // Put G2 back for the tests below.
    await db.query(`update groups set name = 'G2' where id = $1`, [fx.g2]);
    await db.query('insert into group_supervisors (group_id, user_id) values ($1, $2)', [fx.g2, fx.sup2]);
  });

  test('a duplicated supervisor id is stored once', async () => {
    const admin = await as('admin@test');
    const id = await upsertGroup(admin, { name: 'مجموعة المغرب', supervisorIds: [fx.sup1, fx.sup1] });
    expect(await supervisorsOf(id)).toEqual([fx.sup1]);
  });

  test('the name must be unique among groups (ignoring case and spaces), but a group may keep its own', async () => {
    const admin = await as('admin@test');
    expect(await failure(upsertGroup(admin, { name: 'G1' }))).toMatchObject({
      message: 'INVALID_ITEM',
      code: '22023',
    });
    expect(await failure(upsertGroup(admin, { name: ' g1 ' }))).toMatchObject({ message: 'INVALID_ITEM' });
    expect(await failure(upsertGroup(admin, { id: fx.g2, name: 'G1', supervisorIds: [fx.sup2] }))).toMatchObject({
      message: 'INVALID_ITEM',
    });
    await upsertGroup(admin, { id: fx.g1, name: 'G1', weekStartsOn: 0, supervisorIds: [fx.sup1] });
    expect(await groupRow(fx.g1)).toEqual({ name: 'G1', timezone: 'Asia/Riyadh', week_starts_on: 0 });
  });

  test.each([
    ['an empty name', { name: '   ' }],
    ['an unknown timezone', { name: 'مجموعة', timezone: 'Mars/Olympus' }],
    ['a week start of 7', { name: 'مجموعة', weekStartsOn: 7 }],
    ['a week start of −1', { name: 'مجموعة', weekStartsOn: -1 }],
  ])('%s → INVALID_ITEM', async (_label, input) => {
    const admin = await as('admin@test');
    expect(await failure(upsertGroup(admin, input))).toMatchObject({ message: 'INVALID_ITEM', code: '22023' });
  });

  test('null name, timezone or week start → INVALID_ITEM', async () => {
    const admin = await as('admin@test');
    const call = (args: Record<string, unknown>) =>
      admin.rpc('upsert_group', {
        p_id: null,
        p_name: 'مجموعة',
        p_timezone: 'Asia/Riyadh',
        p_week_starts_on: 0,
        p_supervisor_ids: [],
        ...args,
      });
    for (const args of [{ p_name: null }, { p_timezone: null }, { p_week_starts_on: null }]) {
      expect(await failure(call(args))).toMatchObject({ message: 'INVALID_ITEM' });
    }
  });

  test('supervisors must be active supervisor or admin profiles', async () => {
    const admin = await as('admin@test');
    const off = await createTestUser({ email: 'sup-off@test', fullName: 'Off', role: 'supervisor' });
    await db.query('update profiles set is_active = false where id = $1', [off.id]);
    for (const ids of [[fx.p1], [off.id], ['00000000-0000-4000-8000-00000000dead'], [fx.sup1, fx.p2]]) {
      expect(await failure(upsertGroup(admin, { name: 'مجموعة الطلاب', supervisorIds: ids }))).toMatchObject({
        message: 'INVALID_ITEM',
      });
    }
    const exists = await db.query(`select 1 from groups where name = 'مجموعة الطلاب'`);
    expect(exists.rowCount).toBe(0);
  });

  test('an unknown group id → INVALID_ITEM', async () => {
    const admin = await as('admin@test');
    expect(
      await failure(upsertGroup(admin, { id: '00000000-0000-4000-8000-00000000beef', name: 'مجموعة' })),
    ).toMatchObject({ message: 'INVALID_ITEM' });
  });

  test('anon cannot execute it; authenticated can', async () => {
    const result = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'upsert_group(uuid, text, text, int, uuid[])', 'execute') as anon,
              has_function_privilege('authenticated', 'upsert_group(uuid, text, text, int, uuid[])', 'execute') as authenticated`,
    );
    expect(result.rows[0]).toEqual({ anon: false, authenticated: true });
  });
});
