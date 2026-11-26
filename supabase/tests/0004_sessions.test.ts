import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  createTestGroup,
  createTestUser,
  resetTestData,
  type UserClient,
} from './helpers';

let db: pg.Client;
let g1: string;
let g2: string;
let s1: string;
let s2: string;
const ids: Record<string, string> = {};
const clients: UserClient[] = [];

async function as(email: string): Promise<UserClient> {
  const client = await clientAs(email);
  clients.push(client);
  return client;
}

// pg would serialize a JS array as a Postgres array literal, so jsonb arguments go as JSON text.
function rows(...items: unknown[]): string {
  return JSON.stringify(items);
}

async function failure(promise: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { message: string; code?: string };
  }
  throw new Error('expected the call to fail');
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  g1 = (await createTestGroup('G1')).id;
  g2 = (await createTestGroup('G2')).id;
  ids.admin = (await createTestUser({ email: 'admin@test', fullName: 'Admin', role: 'admin' })).id;
  ids.sup1 = (
    await createTestUser({
      email: 'sup1@test',
      fullName: 'Sup 1',
      role: 'supervisor',
      groupId: g1,
      supervises: [g1],
    })
  ).id;
  ids.sup2 = (
    await createTestUser({
      email: 'sup2@test',
      fullName: 'Sup 2',
      role: 'supervisor',
      groupId: g2,
      supervises: [g2],
    })
  ).id;
  ids.p1 = (
    await createTestUser({ email: 'p1@test', fullName: 'P1', role: 'student', groupId: g1 })
  ).id;
  ids.p2 = (
    await createTestUser({ email: 'p2@test', fullName: 'P2', role: 'student', groupId: g2 })
  ).id;
  ids.p3 = (
    await createTestUser({
      email: 'p3@test',
      fullName: 'P3',
      role: 'student',
      groupId: g1,
      isTracked: false,
    })
  ).id;
  s1 = (
    await db.query<{ id: string }>(
      `insert into sessions (group_id, session_date) values ($1, '2026-11-20') returning id`,
      [g1],
    )
  ).rows[0]!.id;
  s2 = (
    await db.query<{ id: string }>(
      `insert into sessions (group_id, session_date) values (null, '2026-11-21') returning id`,
    )
  ).rows[0]!.id;
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0004_sessions', () => {
  test('attendance unique (session_id, user_id)', async () => {
    const insert = () =>
      db.query(`insert into attendance (session_id, user_id, status) values ($1, $2, 'present')`, [
        s2,
        ids.p1,
      ]);
    await insert();
    expect((await failure(insert())).code).toBe('23505');
    await db.query('delete from attendance');
  });

  test("push_tokens.platform rejects 'web'", async () => {
    const error = await failure(
      db.query(`insert into push_tokens (user_id, token, platform) values ($1, 't', 'web')`, [
        ids.p1,
      ]),
    );
    expect(error.code).toBe('23514');
  });

  test('set_attendance inserts 3 rows then updates one without duplicates', async () => {
    const admin = await as('admin@test');
    const first = await admin.rpc('set_attendance', {
      p_session_id: s2,
      p_rows: rows(
        { user_id: ids.p1, status: 'present' },
        { user_id: ids.p2, status: 'present' },
        { user_id: ids.sup1, status: 'absent' },
      ),
    });
    expect(first).toBe(3);
    const second = await admin.rpc('set_attendance', {
      p_session_id: s2,
      p_rows: rows({ user_id: ids.p1, status: 'absent' }),
    });
    expect(second).toBe(1);

    const stored = await db.query<{ user_id: string; status: string; recorded_by: string }>(
      'select user_id, status, recorded_by from attendance where session_id = $1',
      [s2],
    );
    expect(stored.rows).toHaveLength(3);
    const p1Row = stored.rows.find((row) => row.user_id === ids.p1)!;
    expect(p1Row.status).toBe('absent');
    expect(p1Row.recorded_by).toBe(ids.admin);

    const audit = await db.query(
      `select 1 from audit_log where action = 'attendance.set' and actor_id = $1
         and target = jsonb_build_object('table', 'sessions', 'id', $2::uuid)`,
      [ids.admin, s2],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    await db.query('delete from attendance');
  });

  test('supervisor of another group in a G1 session -> FORBIDDEN', async () => {
    const sup2 = await as('sup2@test');
    const error = await failure(
      sup2.rpc('set_attendance', {
        p_session_id: s1,
        p_rows: rows({ user_id: ids.p1, status: 'present' }),
      }),
    );
    expect(error.message).toBe('FORBIDDEN');
    expect(error.code).toBe('42501');
  });

  test('shared session: sup1 marks p1 ok, p2 -> FORBIDDEN', async () => {
    const sup1 = await as('sup1@test');
    const ok = await sup1.rpc('set_attendance', {
      p_session_id: s2,
      p_rows: rows({ user_id: ids.p1, status: 'present' }),
    });
    expect(ok).toBe(1);
    const error = await failure(
      sup1.rpc('set_attendance', {
        p_session_id: s2,
        p_rows: rows({ user_id: ids.p2, status: 'present' }),
      }),
    );
    expect(error.message).toBe('FORBIDDEN');
    expect(error.code).toBe('42501');
  });

  test('user from another group in G1 session via admin -> INVALID_ITEM', async () => {
    const admin = await as('admin@test');
    const error = await failure(
      admin.rpc('set_attendance', {
        p_session_id: s1,
        p_rows: rows({ user_id: ids.p2, status: 'present' }),
      }),
    );
    expect(error.message).toBe('INVALID_ITEM');
    expect(error.code).toBe('22023');
  });

  test('untracked user -> INVALID_ITEM', async () => {
    const admin = await as('admin@test');
    const error = await failure(
      admin.rpc('set_attendance', {
        p_session_id: s2,
        p_rows: rows({ user_id: ids.p3, status: 'present' }),
      }),
    );
    expect(error.message).toBe('INVALID_ITEM');
    expect(error.code).toBe('22023');
  });

  test('student caller -> FORBIDDEN', async () => {
    const p1 = await as('p1@test');
    const error = await failure(
      p1.rpc('set_attendance', {
        p_session_id: s2,
        p_rows: rows({ user_id: ids.p1, status: 'present' }),
      }),
    );
    expect(error.message).toBe('FORBIDDEN');
    expect(error.code).toBe('42501');
  });

  test('unknown session -> FORBIDDEN', async () => {
    const admin = await as('admin@test');
    const error = await failure(
      admin.rpc('set_attendance', {
        p_session_id: '00000000-0000-0000-0000-000000000000',
        p_rows: rows({ user_id: ids.p1, status: 'present' }),
      }),
    );
    expect(error.message).toBe('FORBIDDEN');
  });

  test('malformed row / bad status -> INVALID_ITEM', async () => {
    const admin = await as('admin@test');
    const bad = [
      rows({ user_id: ids.p1, status: 'late' }),
      rows({ user_id: 'not-a-uuid', status: 'present' }),
      rows({ status: 'present' }),
      rows('x'),
      JSON.stringify({ user_id: ids.p1, status: 'present' }),
    ];
    for (const p_rows of bad) {
      const error = await failure(admin.rpc('set_attendance', { p_session_id: s2, p_rows }));
      expect(error.message).toBe('INVALID_ITEM');
      expect(error.code).toBe('22023');
    }
  });

  test('request_account_deletion twice -> one open request', async () => {
    const p1 = await as('p1@test');
    const a = await p1.rpc<string>('request_account_deletion');
    const b = await p1.rpc<string>('request_account_deletion');
    expect(a).toBe(b);
    const open = await db.query(
      'select 1 from deletion_requests where user_id = $1 and handled_at is null',
      [ids.p1],
    );
    expect(open.rowCount).toBe(1);
  });
});
