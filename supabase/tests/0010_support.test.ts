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

// Seeded weekly habits (supabase/seed.sql): a6..a8 tristate, a9 = 2-item checklist.
const H = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;
const I = (suffix: string) => `00000000-0000-4000-8000-000000000${suffix}`;
const WEEKLY_ENTRIES = JSON.stringify([
  ...[H('a6'), H('a7'), H('a8')].map((habit_id) => ({ habit_id, status: 'done' })),
  { habit_id: H('a9'), status: 'done', checked_item_ids: [I('201'), I('202')] },
]);

// G1 (Asia/Riyadh, weeks start on Sunday): Thu 2026-11-26 is in the week starting Sun 2026-11-22.
const NOW = '2026-11-26T10:00:00Z';
const THIS_WEEK = '2026-11-22';

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

/** p1 saves this week's weekly log through save_log, as the student does in the app. */
async function saveWeekly(support: string | null): Promise<string> {
  const p1 = await as('p1@test');
  return p1.rpc<string>(
    'save_log',
    {
      p_period: 'weekly',
      p_period_start: THIS_WEEK,
      p_entries: WEEKLY_ENTRIES,
      p_review_text: 'مراجعة',
      p_support_request_text: support,
    },
    { settings: { 'app.test_now': NOW } },
  );
}

interface SupportRow {
  support_status: string;
  handled_by: string | null;
  handled_at: Date | null;
  handled_note: string | null;
}

// Since 0016 the internal note is in the staff-only support_notes table, not on the logs row.
async function supportOf(logId: string): Promise<SupportRow> {
  const result = await db.query<SupportRow>(
    `select l.support_status, l.handled_by, l.handled_at, n.note as handled_note
       from logs l left join support_notes n on n.log_id = l.id where l.id = $1`,
    [logId],
  );
  return result.rows[0]!;
}

function handle(client: UserClient, logId: string, note: string | null): Promise<unknown> {
  return client.rpc('handle_support_request', { p_log_id: logId, p_note: note });
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  fx = await seedFixture();
});

beforeEach(async () => {
  await db.query('delete from logs');
  await db.query(`delete from audit_log where action = 'support.handle'`);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0010_support: handle_support_request', () => {
  test('a supervisor of another group → FORBIDDEN, and nothing changes', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    const error = await failure(handle(await as('sup2@test'), logId, 'لا'));
    expect(error).toMatchObject({ message: 'FORBIDDEN', code: '42501' });
    expect(await supportOf(logId)).toMatchObject({ support_status: 'open', handled_by: null });
  });

  test('the student (owner) cannot mark their own request handled → FORBIDDEN', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    const error = await failure(handle(await as('p1@test'), logId, null));
    expect(error).toMatchObject({ message: 'FORBIDDEN', code: '42501' });
  });

  test('the group supervisor marks it handled with a trimmed note and one audit row', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle(await as('sup1@test'), logId, '  تواصلتُ معه  ');
    const row = await supportOf(logId);
    expect(row).toMatchObject({
      support_status: 'handled',
      handled_by: fx.sup1,
      handled_note: 'تواصلتُ معه',
    });
    expect(row.handled_at).toBeInstanceOf(Date);
    const audit = await db.query(
      `select actor_id, target from audit_log where action = 'support.handle'`,
    );
    expect(audit.rows).toEqual([{ actor_id: fx.sup1, target: { table: 'logs', id: logId } }]);
  });

  test('the admin marks it handled; an empty or blank note is stored as null', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle(await as('admin@test'), logId, '   ');
    expect(await supportOf(logId)).toMatchObject({
      support_status: 'handled',
      handled_by: fx.admin,
      handled_note: null,
    });
    const audit = await db.query(`select actor_id from audit_log where action = 'support.handle'`);
    expect(audit.rows).toEqual([{ actor_id: fx.admin }]);
  });

  test('a log without a request (support_status none) or an unknown id → INVALID_ITEM', async () => {
    const logId = await saveWeekly(null);
    const admin = await as('admin@test');
    expect(await failure(handle(admin, logId, null))).toMatchObject({
      message: 'INVALID_ITEM',
      code: '22023',
    });
    expect(
      await failure(handle(admin, '00000000-0000-4000-8000-00000000dead', null)),
    ).toMatchObject({ message: 'INVALID_ITEM' });
  });

  test('BR-10: the student edits the text after handling → open again, handled fields cleared', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle(await as('sup1@test'), logId, 'تمّ');
    await saveWeekly('أحتاج مساعدة أخرى');
    expect(await supportOf(logId)).toEqual({
      support_status: 'open',
      handled_by: null,
      handled_at: null,
      handled_note: null,
    });
  });

  test('BR-10: a re-save with the same text keeps it handled', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle(await as('admin@test'), logId, 'تمّ');
    await saveWeekly('أحتاج مساعدة');
    expect(await supportOf(logId)).toMatchObject({
      support_status: 'handled',
      handled_by: fx.admin,
      handled_note: 'تمّ',
    });
  });

  test('anon cannot execute it', async () => {
    const result = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('anon', 'handle_support_request(uuid, text)', 'execute') as allowed`,
    );
    expect(result.rows[0]!.allowed).toBe(false);
  });
});
