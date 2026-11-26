import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminDb, clientAs, createTestGroup, createTestUser, resetTestData } from './helpers';

let db: pg.Client;
let g1: string;
let g2: string;

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  g1 = (await createTestGroup('G1')).id;
  g2 = (await createTestGroup('G2')).id;
});

afterAll(async () => {
  await db?.end();
});

async function profileOf(id: string) {
  const result = await db.query('select * from profiles where id = $1', [id]);
  return result.rows[0];
}

async function insertAuthUser(email: string, fullName?: string): Promise<string> {
  const meta = fullName ? { full_name: fullName } : {};
  const result = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [email, meta],
  );
  return result.rows[0]!.id;
}

describe('0001 core schema', () => {
  test('app_settings seeded with six defaults', async () => {
    const rows = await db.query('select key, value from app_settings order by key');
    expect(Object.fromEntries(rows.rows.map((r) => [r.key, r.value]))).toEqual({
      backfill_days: 2,
      default_reminder_time: '21:00',
      excused_counts_as_absent: false,
      hijri_adjustment_days: 0,
      streak_threshold_pct: 100,
      weekly_grace_days: 3,
    });
  });

  test('groups.week_starts_on rejects 7', async () => {
    await expect(
      db.query(`insert into groups (name, week_starts_on) values ('bad week', 7)`),
    ).rejects.toThrow(/violates check constraint/);
  });

  test('new auth user with matching invitation gets profile with role/group and invitation.accepted_at set', async () => {
    const inv = await db.query<{ id: string }>(
      `insert into invitations (email, full_name, role, group_id)
       values ('Invited.Sup@Test', 'مشرف مدعو', 'supervisor', $1) returning id`,
      [g1],
    );
    const id = await insertAuthUser('invited.sup@test', 'اسم من البيانات الوصفية');

    expect(await profileOf(id)).toMatchObject({
      full_name: 'مشرف مدعو',
      role: 'supervisor',
      group_id: g1,
      is_active: true,
    });
    const accepted = await db.query('select accepted_at from invitations where id = $1', [
      inv.rows[0]!.id,
    ]);
    expect(accepted.rows[0].accepted_at).toBeInstanceOf(Date);
  });

  test('new auth user without invitation gets inactive student profile', async () => {
    const id = await insertAuthUser('stranger@test', 'زائر بلا دعوة');

    expect(await profileOf(id)).toMatchObject({
      full_name: 'زائر بلا دعوة',
      role: 'student',
      group_id: null,
      is_active: false,
      is_tracked: true,
    });

    // An empty metadata name falls back to the email.
    const blank = await insertAuthUser('blank.name@test', '');
    expect((await profileOf(blank)).full_name).toBe('blank.name@test');
  });

  test('with several pending invitations for one email, the latest wins and only it is accepted', async () => {
    const inv = await db.query<{ id: string; role: string }>(
      `insert into invitations (email, full_name, role, group_id, created_at) values
         ('twice@test', 'الدعوة القديمة', 'student', $1, now() - interval '2 days'),
         ('TWICE@test', 'الدعوة الأحدث', 'supervisor', $2, now() - interval '1 day')
       returning id, role`,
      [g1, g2],
    );
    const id = await insertAuthUser('twice@test');

    expect(await profileOf(id)).toMatchObject({
      full_name: 'الدعوة الأحدث',
      role: 'supervisor',
      group_id: g2,
    });
    const accepted = await db.query(
      'select role, accepted_at is not null as accepted from invitations where id = any($1)',
      [inv.rows.map((row) => row.id)],
    );
    expect(Object.fromEntries(accepted.rows.map((r) => [r.role, r.accepted]))).toEqual({
      student: false,
      supervisor: true,
    });
  });

  test('an already-accepted invitation is ignored: the new user gets an inactive student profile', async () => {
    await db.query(
      `insert into invitations (email, full_name, role, group_id, accepted_at)
       values ('used@test', 'دعوة مستعملة', 'admin', $1, now())`,
      [g1],
    );
    const id = await insertAuthUser('used@test', 'مستخدم جديد');

    expect(await profileOf(id)).toMatchObject({
      full_name: 'مستخدم جديد',
      role: 'student',
      group_id: null,
      is_active: false,
    });
  });

  test('non-admin cannot change own role/group_id/full_name/is_active/is_tracked/joined_at', async () => {
    const student = await createTestUser({
      email: 'guarded.student@test',
      fullName: 'طالب محمي',
      role: 'student',
      groupId: g1,
    });
    await createTestUser({ email: 'guard.admin@test', fullName: 'مدير', role: 'admin' });
    const asStudent = await clientAs('guarded.student@test');
    const asAdmin = await clientAs('guard.admin@test');
    try {
      const forbidden: Array<[string, unknown]> = [
        ['role', 'admin'],
        ['group_id', g2],
        ['full_name', 'اسم آخر'],
        ['is_active', false],
        ['is_tracked', false],
        ['joined_at', '2020-01-01'],
      ];
      for (const [column, value] of forbidden) {
        await expect(
          asStudent.query(`update profiles set ${column} = $1 where id = auth.uid()`, [value]),
        ).rejects.toThrow('FORBIDDEN');
      }

      await asStudent.query(
        `update profiles set reminder_time = '20:30', timezone = 'Africa/Cairo',
         weekly_reminder = false where id = auth.uid()`,
      );
      expect(await profileOf(student.id)).toMatchObject({
        role: 'student',
        group_id: g1,
        full_name: 'طالب محمي',
        reminder_time: '20:30:00',
        timezone: 'Africa/Cairo',
        weekly_reminder: false,
      });

      // The guard exempts admins: they may move a student between groups.
      await asAdmin.query('update profiles set group_id = $1 where id = $2', [g2, student.id]);
      expect((await profileOf(student.id)).group_id).toBe(g2);
    } finally {
      await asStudent.end();
      await asAdmin.end();
    }
  });

  // Since 0005 RLS filters the row away from anon before the profile guard trigger can run, so the
  // update affects 0 rows (BR-11: zero rows, not an error); the trigger's anon rule stays as depth.
  test('anon requests get no system bypass: changing a profile role changes nothing', async () => {
    const { id } = await createTestUser({
      email: 'anon.target@test',
      fullName: 'هدف',
      role: 'student',
      groupId: g1,
    });
    await db.query('begin');
    try {
      await db.query('set local role anon');
      await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      const result = await db.query(`update profiles set role = 'admin' where id = $1`, [id]);
      expect(result.rowCount).toBe(0);
    } finally {
      await db.query('rollback');
    }
    expect((await profileOf(id)).role).toBe('student');
  });

  test('new profile gets reminder_time = default_reminder_time (21:00) and joined_at/is_tracked from invitation', async () => {
    const { id } = await createTestUser({
      email: 'joined@test',
      fullName: 'طالب قديم',
      role: 'student',
      groupId: g1,
      joinedAt: '2025-09-01',
      isTracked: true,
    });

    expect(await profileOf(id)).toMatchObject({
      reminder_time: '21:00:00',
      weekly_reminder: true,
      joined_at: '2025-09-01',
      is_tracked: true,
      is_active: true,
    });
  });

  test('invitation with role admin and is_tracked=false provisions an untracked admin profile', async () => {
    const admin = await createTestUser({
      email: 'untracked.admin@test',
      fullName: 'الشيخ',
      role: 'admin',
      isTracked: false,
    });
    const student = await createTestUser({
      email: 'tracked.student@test',
      fullName: 'طالب متابع',
      role: 'student',
      groupId: g1,
    });

    expect(await profileOf(admin.id)).toMatchObject({
      role: 'admin',
      group_id: null,
      is_tracked: false,
      is_active: true,
    });
    const tracked = await db.query(
      'select is_tracked_member($1) as admin, is_tracked_member($2) as student',
      [admin.id, student.id],
    );
    expect(tracked.rows[0]).toEqual({ admin: false, student: true });
  });

  test('is_admin() and current_user_role() reflect the calling user', async () => {
    await createTestUser({ email: 'role.admin@test', fullName: 'مدير', role: 'admin' });
    await createTestUser({
      email: 'role.student@test',
      fullName: 'طالب',
      role: 'student',
      groupId: g1,
    });
    const asAdmin = await clientAs('role.admin@test');
    const asStudent = await clientAs('role.student@test');
    try {
      expect(await asAdmin.rpc('is_admin')).toBe(true);
      expect(await asAdmin.rpc('current_user_role')).toBe('admin');
      expect(await asStudent.rpc('is_admin')).toBe(false);
      expect(await asStudent.rpc('current_user_role')).toBe('student');
    } finally {
      await asAdmin.end();
      await asStudent.end();
    }
  });

  test('a deactivated admin is no longer is_admin()', async () => {
    const { id } = await createTestUser({
      email: 'retired.admin@test',
      fullName: 'مدير سابق',
      role: 'admin',
    });
    await db.query('update profiles set is_active = false where id = $1', [id]);
    const asRetired = await clientAs('retired.admin@test');
    try {
      expect(await asRetired.rpc('is_admin')).toBe(false);
      expect(await asRetired.rpc('current_user_role')).toBe('admin');
    } finally {
      await asRetired.end();
    }
  });

  test('createTestUser refuses to reuse an email with a different role or group', async () => {
    const first = await createTestUser({
      email: 'reused@test',
      fullName: 'طالب',
      role: 'student',
      groupId: g1,
    });
    await expect(
      createTestUser({ email: 'Reused@test', fullName: 'طالب', role: 'student', groupId: g1 }),
    ).resolves.toEqual(first);
    await expect(
      createTestUser({ email: 'reused@test', fullName: 'طالب', role: 'supervisor', groupId: g1 }),
    ).rejects.toThrow(/already exists/);
  });

  test('is_supervisor_of() is true only for groups listed in group_supervisors', async () => {
    await createTestUser({
      email: 'sup.g1@test',
      fullName: 'مشرف المجموعة الأولى',
      role: 'supervisor',
      groupId: g2,
      supervises: [g1],
    });
    const asSupervisor = await clientAs('sup.g1@test');
    try {
      expect(await asSupervisor.rpc('is_supervisor_of', { p_group: g1 })).toBe(true);
      expect(await asSupervisor.rpc('is_supervisor_of', { p_group: g2 })).toBe(false);
    } finally {
      await asSupervisor.end();
    }
  });
});
