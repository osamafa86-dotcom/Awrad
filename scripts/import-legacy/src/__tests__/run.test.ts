import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  clientAs,
  createTestUser,
  resetTestData,
  seedFixture,
} from '../../../../supabase/tests/helpers.ts';
import {
  buildMapping,
  planImport,
  type ImportPlan,
  type LegacyData,
  type MappingFile,
} from '../map.ts';
import { parseAttendanceCsv, parseDailyCsv, parseWeeklyCsv } from '../parse.ts';
import { buildReport, formatSummary } from '../report.ts';
import {
  createAuthUser,
  executeImport,
  findExistingLogs,
  IMPORTED_SUPPORT_NOTE,
  loadCatalog,
  resolveAdmin,
  type Db,
} from '../run.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const data: LegacyData = {
  daily: parseDailyCsv(fixture('daily.sample.csv')),
  weekly: parseWeeklyCsv(fixture('weekly.sample.csv')),
  attendance: parseAttendanceCsv(fixture('attendance.sample.csv')),
};

const emptyPlan = (): ImportPlan => ({
  toImport: [],
  attendance: [],
  duplicatesResolved: [],
  unmappedNames: [],
  invalidDates: [],
  rowErrors: [],
  accountsToCreate: [],
  ignoredColumns: [],
  weeksInferred: [],
});

describe('executeImport in dry-run mode', () => {
  it('performs no database call at all, so save_log is never called', async () => {
    const query = vi.fn();
    const fetchMock = vi.fn();
    const plan: ImportPlan = {
      ...emptyPlan(),
      toImport: [
        {
          source: 'daily',
          row: 2,
          name: 'أحمد',
          target: {
            kind: 'profile',
            profileId: '00000000-0000-4000-8000-0000000000d1',
            weekStartsOn: 0,
          },
          period: 'daily',
          periodStart: '2025-03-01',
          entries: [{ habit_id: '00000000-0000-4000-8000-0000000000a1', status: 'done' }],
        },
      ],
      accountsToCreate: [{ name: 'يوسف', groupId: null }],
    };
    const result = await executeImport(plan, {
      dryRun: true,
      db: { query } as unknown as Db,
      fetch: fetchMock,
    });
    expect(query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dryRun: true,
      logsSaved: 0,
      attendanceSaved: 0,
      accountsCreated: [],
    });
  });
});

describe('the dry-run report', () => {
  it('summarises the plan in Arabic and says nothing was written', async () => {
    const plan: ImportPlan = {
      ...emptyPlan(),
      duplicatesResolved: [
        { source: 'daily', row: 3, name: 'أحمد', periodStart: '2025-03-02', keptRow: 4 },
      ],
      unmappedNames: [
        {
          name: 'خالد المثالى',
          rows: 2,
          suggestions: [{ profileId: 'p-1', fullName: 'خالد المثالي', distance: 0 }],
        },
      ],
      invalidDates: [{ source: 'daily', row: 7, name: 'خالد', value: '30/02/2025' }],
      rowErrors: [
        {
          source: 'daily',
          row: 9,
          name: 'أحمد',
          date: '2025-03-02',
          code: 'INACTIVE_HABIT',
          column: 'كتاب قديم',
          value: 'تم',
        },
      ],
    };
    const result = await executeImport(plan, { dryRun: true });
    const report = buildReport(plan, result, { files: { daily: 'daily.csv' }, generatedAt: 'now' });
    expect(report).toMatchObject({
      mode: 'dry-run',
      counts: { duplicatesResolved: 1, unmappedNames: 1, invalidDates: 1, rowErrors: 1 },
    });
    const text = formatSummary(report);
    expect(text).toContain('لم يُكتب شيء في قاعدة البيانات');
    expect(text).toContain('خالد المثالى (2 صفّ) — هل هو: خالد المثالي (p-1)؟');
    expect(text).toContain('اليومي صفّ 7: خالد «30/02/2025»');
    expect(text).toContain('عادة غير نشطة في ذلك التاريخ');
    expect(text).toContain('--execute');
  });
});

describe('createAuthUser (GoTrue admin API)', () => {
  const key = 'service-role-secret-value';

  it('posts the user to /auth/v1/admin/users with the service role key and returns its id', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 'new-user-id' }), { status: 200 }),
    );
    const userId = await createAuthUser(
      { url: 'https://example.supabase.co/', serviceRoleKey: key },
      { email: 'legacy-3@legacy.awrad.local', fullName: 'يوسف النموذجي' },
      fetchMock,
    );
    expect(userId).toBe('new-user-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/auth/v1/admin/users');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'legacy-3@legacy.awrad.local',
      email_confirm: true,
      user_metadata: { full_name: 'يوسف النموذجي' },
    });
  });

  it('fails with the status and GoTrue message, never the key', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ msg: 'A user with this email already exists' }), {
          status: 422,
        }),
    );
    const error = (await createAuthUser(
      { url: 'https://example.supabase.co', serviceRoleKey: key },
      { email: 'legacy-1@legacy.awrad.local', fullName: 'س' },
      fetchMock,
    ).then(
      () => null,
      (e: unknown) => e,
    )) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/422/);
    expect(error.message).toMatch(/already exists/);
    expect(error.message).not.toContain(key);
  });
});

describe('executeImport against the local database', () => {
  let db: pg.Client;
  let ids: { ahmad: string; khalid: string; g1: string; adminId: string };
  let plan: ImportPlan;

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: string }>(`select count(*) as n from ${sql}`, params)).rows[0]!.n);
  const snapshot = async () => ({
    logs: await count('logs'),
    entries: await count('log_entries'),
    items: await count('log_entry_items'),
    sessions: await count('sessions'),
    attendance: await count('attendance'),
    users: await count('auth.users'),
    invitations: await count('invitations'),
  });
  const run = () =>
    executeImport(plan, { dryRun: false, db, adminId: ids.adminId, auth: { mode: 'direct' } });

  beforeAll(async () => {
    await resetTestData();
    const fx = await seedFixture();
    const ahmad = await createTestUser({
      email: 'ahmad@test',
      fullName: 'أحمد التجريبي',
      role: 'student',
      groupId: fx.g1,
      joinedAt: '2026-01-01',
    });
    const khalid = await createTestUser({
      email: 'khalid@test',
      fullName: 'خالد المثالي',
      role: 'student',
      groupId: fx.g1,
      joinedAt: '2024-06-01',
    });
    db = await adminDb();
    ids = {
      ahmad: ahmad.id,
      khalid: khalid.id,
      g1: fx.g1,
      adminId: await resolveAdmin(db, 'admin@test'),
    };
    const file: MappingFile = JSON.parse(
      readFileSync(new URL('../../mapping.example.json', import.meta.url), 'utf8'),
    );
    file.students = {
      'أحمد التجريبي': ids.ahmad,
      'خالد المثالي': ids.khalid,
      'يوسف النموذجي': { createMissingAsInactive: true, groupId: ids.g1 },
    };
    const catalog = await loadCatalog(db);
    plan = planImport(
      data,
      buildMapping(data, catalog.habits, catalog.profiles, { file, groups: catalog.groups }),
    );
  });

  afterAll(async () => {
    await db?.end();
  });

  it('imports every planned log and attendance mark through save_log / set_attendance', async () => {
    const result = await run();
    expect(result.failures).toEqual([]);
    expect(result.logsSaved).toBe(12);
    expect(result.attendanceSaved).toBe(5);
    const logs = await db.query<{ period: string; period_start: string }>(
      'select period::text, period_start from logs where user_id = $1 order by period, period_start',
      [ids.ahmad],
    );
    expect(logs.rows.map((r) => `${r.period} ${r.period_start}`)).toEqual([
      'daily 2025-03-01',
      'daily 2025-03-02',
      'daily 2025-03-03',
      'weekly 2025-03-02',
      'weekly 2025-03-09',
    ]);
    const audit = await count(`audit_log where action = 'log.admin_save' and actor_id = $1`, [
      ids.adminId,
    ]);
    expect(audit).toBe(12);
  });

  it('stores the newest duplicate and a blank cell as not_required', async () => {
    const entries = await db.query<{ slug: string; status: string; items: string }>(
      `select h.slug, e.status::text, count(i.habit_item_id)::text as items
         from logs l join log_entries e on e.log_id = l.id join habits h on h.id = e.habit_id
         left join log_entry_items i on i.entry_id = e.id
        where l.user_id = $1 and l.period = 'daily' and l.period_start = $2
        group by h.slug, h.sort_order, e.status order by h.sort_order`,
      [ids.khalid, '2025-03-01'],
    );
    expect(entries.rows.map((r) => `${r.slug} ${r.status} ${r.items}`)).toEqual([
      'quran_wird not_done 0',
      'adhkar not_required 0',
      'qiyam not_required 0',
      'tafsir_ibn_juzayy done 0',
      'sahihayn done 0',
    ]);
    const kept = await db.query<{ status: string; items: string }>(
      `select e.status::text, count(i.habit_item_id)::text as items
         from logs l join log_entries e on e.log_id = l.id
         left join log_entry_items i on i.entry_id = e.id
        where l.user_id = $1 and l.period_start = '2025-03-02' and l.period = 'daily'
          and e.habit_id = (select id from habits where slug = 'adhkar')
        group by e.status`,
      [ids.ahmad],
    );
    // Row 4 (22:30) wins over row 3 (21:00): three morning/evening/prayer adhkar of thirteen.
    expect(kept.rows).toEqual([{ status: 'not_done', items: '3' }]);
  });

  it('moves joined_at back to the oldest imported date, never forward', async () => {
    const rows = await db.query<{ id: string; joined_at: string }>(
      'select id, joined_at from profiles where id = any($1)',
      [[ids.ahmad, ids.khalid]],
    );
    const joined = Object.fromEntries(rows.rows.map((r) => [r.id, r.joined_at]));
    expect(joined[ids.ahmad]).toBe('2025-03-01');
    expect(joined[ids.khalid]).toBe('2024-06-01');
  });

  it('creates an inactive account with a placeholder email for an allowed missing name', async () => {
    const created = await db.query(
      `select u.email, p.full_name, p.role::text, p.group_id, p.is_active, p.is_tracked, p.joined_at
         from auth.users u join profiles p on p.id = u.id where u.email like 'legacy-%'`,
    );
    expect(created.rows).toEqual([
      {
        email: 'legacy-1@legacy.awrad.local',
        full_name: 'يوسف النموذجي',
        role: 'student',
        group_id: ids.g1,
        is_active: false,
        is_tracked: true,
        joined_at: '2025-03-01',
      },
    ]);
    const invitation = await count(
      `invitations where email = 'legacy-1@legacy.awrad.local' and role = 'student' and is_tracked`,
    );
    expect(invitation).toBe(1);
    const yusufLogs = await count(
      `logs l join auth.users u on u.id = l.user_id where u.email = 'legacy-1@legacy.awrad.local'`,
    );
    expect(yusufLogs).toBe(3);
  });

  it('records attendance on shared imported sessions', async () => {
    const marks = await db.query<{ session_date: string; status: string }>(
      `select s.session_date, a.status::text from attendance a join sessions s on s.id = a.session_id
        where a.user_id = $1 and s.group_id is null order by s.session_date`,
      [ids.khalid],
    );
    expect(marks.rows).toEqual([
      { session_date: '2025-03-02', status: 'excused' },
      { session_date: '2025-03-09', status: 'present' },
    ]);
    expect(await count('sessions')).toBe(2);
  });

  it('shows the imported history in the student summary', async () => {
    const admin = await clientAs('admin@test');
    try {
      const summary = await admin.rpc<{ days_logged: number }>('get_student_summary', {
        p_user_id: ids.ahmad,
        p_from: null,
        p_to: null,
      });
      expect(summary.days_logged).toBe(3);
    } finally {
      await admin.end();
    }
  });

  it('is safe to run twice: no duplicated rows and no second account', async () => {
    const before = await snapshot();
    const again = await run();
    expect(again.failures).toEqual([]);
    expect(again.accountsCreated).toEqual([]);
    expect(again.accountsReused).toEqual(['يوسف النموذجي']);
    expect(await snapshot()).toEqual(before);
  });

  it('switches a reused placeholder account back off if an interrupted run left it active', async () => {
    await db.query(
      `update profiles set is_active = true
        where id = (select id from auth.users where email = 'legacy-1@legacy.awrad.local')`,
    );
    const again = await run();
    expect(again.accountsReused).toEqual(['يوسف النموذجي']);
    const active = await db.query<{ is_active: boolean }>(
      `select p.is_active from profiles p join auth.users u on u.id = p.id
        where u.email = 'legacy-1@legacy.awrad.local'`,
    );
    expect(active.rows).toEqual([{ is_active: false }]);
  });

  it('creates accounts through GoTrue when configured: invitation, auth user, then inactive', async () => {
    // Stands in for GoTrue: inserting the auth user is what fires handle_new_user.
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { email: string; user_metadata: unknown };
      const user = await db.query<{ id: string }>(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
        [body.email, body.user_metadata],
      );
      return new Response(JSON.stringify({ id: user.rows[0]!.id }), { status: 200 });
    });
    const [log] = plan.toImport;
    const target = {
      kind: 'create' as const,
      name: 'زيد التجريبي',
      groupId: ids.g1,
      weekStartsOn: 0,
    };
    const viaGoTrue: ImportPlan = {
      ...emptyPlan(),
      toImport: [{ ...log!, name: target.name, target }],
      accountsToCreate: [{ name: target.name, groupId: ids.g1 }],
    };
    const result = await executeImport(viaGoTrue, {
      dryRun: false,
      db,
      adminId: ids.adminId,
      auth: { mode: 'gotrue', url: 'http://gotrue.test', serviceRoleKey: 'k' },
      fetch: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.accountsCreated).toEqual([
      { name: 'زيد التجريبي', email: 'legacy-2@legacy.awrad.local' },
    ]);
    expect(result.logsSaved).toBe(1);
    const profile = await db.query(
      `select p.is_active, p.group_id, i.accepted_at is not null as accepted
         from profiles p join auth.users u on u.id = p.id join invitations i on i.email = u.email
        where u.email = 'legacy-2@legacy.awrad.local'`,
    );
    expect(profile.rows).toEqual([{ is_active: false, group_id: ids.g1, accepted: true }]);
  });

  it('reports a log save_log rejects and still saves the student’s other logs', async () => {
    const [first] = plan.toImport;
    const bad: ImportPlan = {
      ...emptyPlan(),
      toImport: [
        { ...first!, row: 90, periodStart: '2099-01-01' },
        // A day not imported yet: an existing log would be skipped, not saved (FIN-9).
        { ...first!, row: 91, periodStart: '2025-02-01' },
      ],
    };
    const result = await executeImport(bad, {
      dryRun: false,
      db,
      adminId: ids.adminId,
      auth: { mode: 'direct' },
    });
    expect(result.logsSaved).toBe(1);
    expect(result.failures).toEqual([
      { source: 'daily', row: 90, name: first!.name, code: 'FUTURE_DATE' },
    ]);
  });

  // Ruling FIN-2: legacy notes, reviews and support requests are imported; imported support requests are marked
  // handled at once (with a staff note saying so), so the support inbox is not flooded with years of old requests.
  it('saves the note, the review and the support request, and closes imported support requests', async () => {
    const [daily] = plan.toImport.filter((l) => l.period === 'daily' && l.target.kind === 'profile');
    const [weekly] = plan.toImport.filter((l) => l.period === 'weekly' && l.target.kind === 'profile');
    const texts: ImportPlan = {
      ...emptyPlan(),
      toImport: [
        { ...daily!, periodStart: '2025-02-10', note: 'ملاحظة قديمة' },
        {
          ...weekly!,
          periodStart: '2025-02-09',
          reviewText: 'مراجعة قديمة',
          supportRequestText: 'طلب قديم',
        },
      ],
    };
    const result = await executeImport(texts, { dryRun: false, db, adminId: ids.adminId, auth: { mode: 'direct' } });
    expect(result.failures).toEqual([]);
    expect(result.supportHandled).toBe(1);
    const user = (daily!.target as { profileId: string }).profileId;
    const rows = await db.query(
      `select l.period::text, l.note, l.review_text, l.support_request_text, l.support_status::text,
              l.handled_by, n.note as internal
         from logs l left join support_notes n on n.log_id = l.id
        where l.user_id = $1 and l.period_start in ('2025-02-10', '2025-02-09') order by l.period`,
      [user],
    );
    expect(rows.rows).toEqual([
      {
        period: 'daily',
        note: 'ملاحظة قديمة',
        review_text: null,
        support_request_text: null,
        support_status: 'none',
        handled_by: null,
        internal: null,
      },
      {
        period: 'weekly',
        note: null,
        review_text: 'مراجعة قديمة',
        support_request_text: 'طلب قديم',
        support_status: 'handled',
        handled_by: ids.adminId,
        internal: IMPORTED_SUPPORT_NOTE,
      },
    ]);
  });

  // Ruling FIN-9: an import never overwrites a log that exists (a student's own entry since the app went live, or
  // an earlier import): the row is skipped and reported, and a re-run stays idempotent.
  it('never overwrites an existing log: a student-made log is skipped, reported, and left as it was', async () => {
    const student = await clientAs('ahmad@test');
    const [legacy] = plan.toImport.filter((l) => l.period === 'daily' && l.name === 'أحمد التجريبي');
    const day = '2025-04-01';
    try {
      await db.query('update profiles set joined_at = $2 where id = $1', [ids.ahmad, '2025-03-01']);
      const habitsToday = await db.query<{ id: string; kind: string }>(
        `select id, kind::text from habits where frequency = 'daily' and active_from <= $1
            and (active_to is null or active_to >= $1)`,
        [day],
      );
      await student.rpc(
        'save_log',
        {
          p_period: 'daily',
          p_period_start: day,
          p_entries: JSON.stringify(habitsToday.rows.map((h) => ({ habit_id: h.id, status: 'not_required' }))),
          p_note: 'كتبها الطالب في التطبيق',
        },
        { settings: { 'app.test_now': `${day}T12:00:00Z` } },
      );
    } finally {
      await student.end();
    }
    const before = await db.query(
      `select l.note, l.updated_at, array_agg(e.status::text order by e.habit_id) as statuses
         from logs l join log_entries e on e.log_id = l.id
        where l.user_id = $1 and l.period = 'daily' and l.period_start = $2 group by l.id`,
      [ids.ahmad, day],
    );

    const overlapping: ImportPlan = {
      ...emptyPlan(),
      toImport: [{ ...legacy!, row: 77, periodStart: day, note: 'من الجدول' }, { ...legacy!, row: 78, periodStart: '2025-04-02' }],
    };
    const result = await executeImport(overlapping, { dryRun: false, db, adminId: ids.adminId, auth: { mode: 'direct' } });
    expect(result.skippedExisting).toEqual([{ source: 'daily', row: 77, name: legacy!.name, periodStart: day }]);
    expect(result.logsSaved).toBe(1);
    const after = await db.query(
      `select l.note, l.updated_at, array_agg(e.status::text order by e.habit_id) as statuses
         from logs l join log_entries e on e.log_id = l.id
        where l.user_id = $1 and l.period = 'daily' and l.period_start = $2 group by l.id`,
      [ids.ahmad, day],
    );
    expect(after.rows).toEqual(before.rows);

    const again = await executeImport(overlapping, { dryRun: false, db, adminId: ids.adminId, auth: { mode: 'direct' } });
    expect(again.logsSaved).toBe(0);
    expect(again.skippedExisting.map((s) => s.row)).toEqual([77, 78]);

    const report = buildReport(overlapping, again, { files: {} });
    expect(report.counts.skippedExisting).toBe(2);
    expect(formatSummary(report)).toContain('سجلّات موجودة تُركت كما هي: 2');
  });

  it('a dry run lists the logs that exist already (read-only check)', async () => {
    const [legacy] = plan.toImport.filter((l) => l.period === 'daily' && l.name === 'أحمد التجريبي');
    const preview: ImportPlan = { ...emptyPlan(), toImport: [{ ...legacy!, row: 79, periodStart: '2025-04-01' }] };
    const existing = await findExistingLogs(db, preview);
    expect(existing).toEqual([{ source: 'daily', row: 79, name: legacy!.name, periodStart: '2025-04-01' }]);
  });
});

// Ruling FIN-5: on the server the summary goes to an ops log that is pushed to git, so it carries counts only.
describe('the counts-only summary', () => {
  it('prints the numbers and no name, email or value from the sheets', async () => {
    const plan: ImportPlan = {
      ...emptyPlan(),
      unmappedNames: [{ name: 'خالد المثالى', rows: 2, suggestions: [{ profileId: 'p-1', fullName: 'خالد المثالي', distance: 0 }] }],
      accountsToCreate: [{ name: 'يوسف النموذجي', groupId: null }],
      invalidDates: [{ source: 'daily', row: 7, name: 'سالم', value: '30/02/2025' }],
    };
    const result = await executeImport(plan, { dryRun: true });
    const text = formatSummary(buildReport(plan, result, { files: {} }), '/import/report.json', { countsOnly: true });
    expect(text).toContain('أسماء غير مطابقة (لن تُستورد): 1');
    expect(text).toContain('/import/report.json');
    for (const secret of ['خالد', 'يوسف', 'سالم', '30/02/2025', 'p-1']) expect(text).not.toContain(secret);
  });
});

