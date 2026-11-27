import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  adminDb,
  clientAs,
  resetTestData,
  seedFixture,
  type UserClient,
} from './helpers';

// Final review db I2 / Ruling FIN-8: the support request's internal note («ملاحظة داخلية», F-64) was a column of the
// student's own logs row, so RLS let the student read it and the app's select('*') downloaded it. It now lives in
// the staff-only support_notes table: the admin and the supervisor of the owner's group read it, nobody else.
const H = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;
const I = (suffix: string) => `00000000-0000-4000-8000-000000000${suffix}`;
const WEEKLY_ENTRIES = JSON.stringify([
  ...[H('a6'), H('a7'), H('a8')].map((habit_id) => ({ habit_id, status: 'done' })),
  { habit_id: H('a9'), status: 'done', checked_item_ids: [I('201'), I('202')] },
]);
const NOW = '2026-11-26T10:00:00Z';
const THIS_WEEK = '2026-11-22';
const NOTE = 'الطالب يمرّ بظرف عائلي';

let db: pg.Client;
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

async function handle(email: string, logId: string, note: string | null): Promise<void> {
  await (await as(email)).rpc('handle_support_request', { p_log_id: logId, p_note: note });
}

async function storedNote(logId: string): Promise<string | null> {
  const result = await db.query<{ note: string }>('select note from support_notes where log_id = $1', [logId]);
  return result.rows[0]?.note ?? null;
}

/** Runs one statement as anon, the way PostgREST does for a request without a user. */
async function asAnon(sql: string): Promise<pg.QueryResult> {
  const client = await adminDb();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    return await client.query(sql);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
  await seedFixture();
});

beforeEach(async () => {
  await db.query('delete from logs');
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  await db?.end();
});

describe('0016_support_notes: the internal note is staff-only', () => {
  test('logs no longer carries the note, so no select on logs can return it', async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'logs'`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain('handled_note');
  });

  test('handle_support_request stores the trimmed note in support_notes', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, `  ${NOTE}  `);
    expect(await storedNote(logId)).toBe(NOTE);
  });

  test('the student who owns the log reads neither the note nor the table', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, NOTE);
    const p1 = await as('p1@test');
    expect((await p1.query('select * from support_notes')).rowCount).toBe(0);
    const own = await p1.query('select * from logs where id = $1', [logId]);
    expect(own.rowCount).toBe(1);
    expect(JSON.stringify(own.rows[0])).not.toContain(NOTE);
    expect(own.rows[0]).toMatchObject({ support_status: 'handled' });
  });

  test('the supervisor of the owner group and the admin read it; another group supervisor does not', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, NOTE);
    for (const email of ['sup1@test', 'admin@test']) {
      const rows = await (await as(email)).query('select log_id, note from support_notes');
      expect(rows.rows).toEqual([{ log_id: logId, note: NOTE }]);
    }
    expect((await (await as('sup2@test')).query('select * from support_notes')).rowCount).toBe(0);
  });

  test('anon has no privilege on the table at all', async () => {
    const error = await failure(asAnon('select * from support_notes'));
    expect(error.code).toBe('42501');
  });

  test('nobody writes it directly: not the student, not a supervisor, not the admin', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, NOTE);
    for (const email of ['p1@test', 'sup1@test', 'admin@test']) {
      const client = await as(email);
      expect((await failure(client.query(`update support_notes set note = 'x'`))).code).toBe('42501');
      expect((await failure(client.query('delete from support_notes'))).code).toBe('42501');
      expect(
        (await failure(client.query(`insert into support_notes (log_id, note) values ($1, 'x')`, [logId]))).code,
      ).toBe('42501');
    }
    expect(await storedNote(logId)).toBe(NOTE);
  });

  test('a blank note leaves no row; handling again with a blank note removes the old one', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('admin@test', logId, '   ');
    expect(await storedNote(logId)).toBeNull();
    await handle('admin@test', logId, NOTE);
    expect(await storedNote(logId)).toBe(NOTE);
    await handle('admin@test', logId, null);
    expect(await storedNote(logId)).toBeNull();
  });

  test('BR-10: the student edits the request → open again and the note is removed', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, NOTE);
    await saveWeekly('أحتاج مساعدة أخرى');
    expect(await storedNote(logId)).toBeNull();
    const row = await db.query('select support_status, handled_by from logs where id = $1', [logId]);
    expect(row.rows[0]).toEqual({ support_status: 'open', handled_by: null });
  });

  test('BR-10: a re-save with the same text keeps it handled with its note', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, NOTE);
    await saveWeekly('أحتاج مساعدة');
    expect(await storedNote(logId)).toBe(NOTE);
  });

  test('the note goes with its log (cascade)', async () => {
    const logId = await saveWeekly('أحتاج مساعدة');
    await handle('sup1@test', logId, NOTE);
    await db.query('delete from logs where id = $1', [logId]);
    expect((await db.query('select 1 from support_notes')).rowCount).toBe(0);
  });
});
