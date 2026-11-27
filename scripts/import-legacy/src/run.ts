// Executing an import plan over a direct Postgres connection (SUPABASE_DB_URL), as spec §14 says:
// accounts for allowed missing names, then per student one transaction calling save_log() under an
// admin claims session (so the editing window does not apply), attendance through set_attendance(),
// and joined_at moved back to the oldest imported date. Safe to re-run (BR-12 upserts, lookups).
import type pg from 'pg';
import type {
  GroupInfo,
  HabitInfo,
  ImportPlan,
  PlannedAttendance,
  PlannedLog,
  ProfileInfo,
  Source,
  StudentTarget,
} from './map.ts';

/** The slice of pg.Client this module needs (a single connection: transactions span calls). */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** How accounts are created: GoTrue's admin API (staging/production), or `auth.users` directly (local shim only). */
export type AuthConfig =
  { mode: 'gotrue'; url: string; serviceRoleKey: string } | { mode: 'direct' };

export interface ExecuteOptions {
  dryRun: boolean;
  db?: Db;
  /** The acting admin (profiles.id): the `sub` of the claims session and the audit actor. */
  adminId?: string;
  auth?: AuthConfig;
  fetch?: FetchLike;
}

export interface ImportFailure {
  source: Source | 'account';
  row: number;
  name: string;
  /** The RPC error code (FUTURE_DATE, INACTIVE_HABIT, …) or the error message. */
  code: string;
}

export interface ExecuteResult {
  dryRun: boolean;
  accountsCreated: { name: string; email: string }[];
  accountsReused: string[];
  logsSaved: number;
  attendanceSaved: number;
  joinedAtUpdated: number;
  failures: ImportFailure[];
}

export const LEGACY_EMAIL_DOMAIN = 'legacy.awrad.local';
/** The title of the shared sessions the attendance grid is imported into (data, not UI). */
export const IMPORTED_SESSION_TITLE = 'مجلس مستورد من الجداول القديمة';

// ───────────── catalogue ─────────────
export async function loadCatalog(
  db: Db,
): Promise<{ habits: HabitInfo[]; profiles: ProfileInfo[]; groups: GroupInfo[] }> {
  const habits = await db.query<Omit<HabitInfo, 'items'>>(
    `select id, slug, name, kind::text as kind, frequency::text as frequency,
            active_from::text as "activeFrom", active_to::text as "activeTo"
       from habits order by frequency, sort_order, slug`,
  );
  const items = await db.query<HabitInfo['items'][number] & { habitId: string }>(
    `select id, habit_id as "habitId", name, active_from::text as "activeFrom",
            active_to::text as "activeTo"
       from habit_items order by sort_order, name`,
  );
  const profiles = await db.query<ProfileInfo>(
    `select p.id, p.full_name as "fullName", p.group_id as "groupId",
            coalesce(g.week_starts_on, 0)::int as "weekStartsOn"
       from profiles p left join groups g on g.id = p.group_id order by p.full_name`,
  );
  const groups = await db.query<GroupInfo>(
    `select id, name, week_starts_on::int as "weekStartsOn" from groups order by name`,
  );
  return {
    habits: habits.rows.map((h) => ({
      ...h,
      items: items.rows
        .filter((i) => i.habitId === h.id)
        .map(({ id, name, activeFrom, activeTo }) => ({ id, name, activeFrom, activeTo })),
    })),
    profiles: profiles.rows,
    groups: groups.rows,
  };
}

/** The acting admin: the active admin with this email, or the only active admin. */
export async function resolveAdmin(db: Db, email?: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `select p.id from profiles p join auth.users u on u.id = p.id
      where p.role = 'admin' and p.is_active and ($1::text is null or lower(u.email) = lower($1))
      order by p.created_at`,
    [email ?? null],
  );
  if (result.rows.length === 1) return result.rows[0]!.id;
  if (email) throw new Error(`لا مدير فعّال بالبريد ${email}`);
  throw new Error(
    result.rows.length === 0
      ? 'لا يوجد مدير فعّال في قاعدة البيانات'
      : 'يوجد أكثر من مدير فعّال: حدّد المنفّذ بـ --admin <البريد>',
  );
}

// ───────────── accounts ─────────────
/** Creates a confirmed user through GoTrue's admin endpoint and returns its id. */
export async function createAuthUser(
  config: { url: string; serviceRoleKey: string },
  user: { email: string; fullName: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const response = await fetchImpl(`${config.url.replace(/\/+$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    }),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const reason = body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? '';
    throw new Error(`رفض GoTrue إنشاء ${user.email}: ${response.status} ${String(reason)}`.trim());
  }
  if (typeof body?.id !== 'string') throw new Error(`ردّ GoTrue بلا معرّف للمستخدم ${user.email}`);
  return body.id;
}

async function transaction<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query('begin');
  try {
    const result = await fn();
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    throw error;
  }
}

/**
 * The inactive account of a legacy name: reused if an earlier run created it (placeholder email +
 * the same full name), otherwise an invitation (student, the mapped group, tracked) and the auth
 * user, whose profile handle_new_user provisions from it, then switched off.
 */
async function ensureLegacyAccount(
  db: Db,
  account: { name: string; groupId: string | null },
  adminId: string,
  auth: AuthConfig,
  fetchImpl: FetchLike,
): Promise<{ id: string; email: string | null }> {
  const existing = await db.query<{ id: string }>(
    `select p.id from profiles p join auth.users u on u.id = p.id
      where u.email ~ $1 and p.full_name = $2 order by p.created_at limit 1`,
    [`^legacy-[0-9]+@${LEGACY_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`, account.name],
  );
  if (existing.rows[0]) {
    // A run interrupted between creating and switching off leaves the account active: fix it here.
    await db.query('update profiles set is_active = false where id = $1 and is_active', [
      existing.rows[0].id,
    ]);
    return { id: existing.rows[0].id, email: null };
  }

  const next = await db.query<{ n: number }>(
    `select coalesce(max(substring(email from $1)::int), 0)::int + 1 as n from auth.users`,
    [`^legacy-([0-9]+)@${LEGACY_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`],
  );
  const email = `legacy-${next.rows[0]!.n}@${LEGACY_EMAIL_DOMAIN}`;
  const insertInvitation = () =>
    db.query(
      `insert into invitations (email, full_name, role, group_id, is_tracked, invited_by)
       values ($1, $2, 'student', $3, true, $4)`,
      [email, account.name, account.groupId, adminId],
    );
  const deactivate = (id: string) =>
    db.query('update profiles set is_active = false where id = $1', [id]);

  if (auth.mode === 'direct') {
    const id = await transaction(db, async () => {
      await insertInvitation();
      const user = await db.query<{ id: string }>(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
        [email, { full_name: account.name }],
      );
      await deactivate(user.rows[0]!.id);
      return user.rows[0]!.id;
    });
    return { id, email };
  }
  // GoTrue inserts auth.users itself (handle_new_user then accepts the invitation).
  await insertInvitation();
  let id: string;
  try {
    id = await createAuthUser(auth, { email, fullName: account.name }, fetchImpl);
  } catch (error) {
    await db.query('delete from invitations where email = $1 and accepted_at is null', [email]);
    throw error;
  }
  await deactivate(id);
  return { id, email };
}

// ───────────── writes ─────────────
async function asAdmin(db: Db, adminId: string): Promise<void> {
  await db.query('set local role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: adminId, role: 'authenticated' }),
  ]);
}

async function asSystem(db: Db): Promise<void> {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}

/**
 * save_log and set_attendance refuse inactive users (INACTIVE_USER / INVALID_ITEM); legacy
 * accounts are inactive by design, so inside the caller's transaction they are switched on and
 * back off around the writes — no other session ever sees them active.
 */
async function withActive(db: Db, userIds: string[], fn: () => Promise<void>): Promise<void> {
  const inactive = await db.query<{ id: string }>(
    'select id from profiles where id = any($1::uuid[]) and not is_active for update',
    [userIds],
  );
  const ids = inactive.rows.map((r) => r.id);
  if (ids.length > 0)
    await db.query('update profiles set is_active = true where id = any($1::uuid[])', [ids]);
  await fn();
  if (ids.length > 0)
    await db.query('update profiles set is_active = false where id = any($1::uuid[])', [ids]);
}

async function tryStatement(db: Db, sql: string, params: unknown[]): Promise<string | null> {
  await db.query('savepoint import_row');
  try {
    await db.query(sql, params);
    await db.query('release savepoint import_row');
    return null;
  } catch (error) {
    await db.query('rollback to savepoint import_row');
    return error instanceof Error ? error.message : String(error);
  }
}

function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of list) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

/**
 * Writes the plan. Dry-run (the default of the CLI) returns at once: no query, no request.
 * One failing log or mark (save_log / set_attendance error) is reported and skipped through a
 * savepoint; the student's other rows are still saved.
 */
export async function executeImport(
  plan: ImportPlan,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const result: ExecuteResult = {
    dryRun: options.dryRun,
    accountsCreated: [],
    accountsReused: [],
    logsSaved: 0,
    attendanceSaved: 0,
    joinedAtUpdated: 0,
    failures: [],
  };
  if (options.dryRun) return result;
  const { db, adminId } = options;
  if (!db || !adminId) throw new Error('التنفيذ يحتاج اتصالًا بقاعدة البيانات ومديرًا منفّذًا');
  const fetchImpl = options.fetch ?? fetch;

  // 1) accounts for the names the mapping allows to create
  const created = new Map<string, string>();
  if (plan.accountsToCreate.length > 0 && !options.auth) {
    throw new Error(
      'إنشاء الحسابات يحتاج SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY (أو IMPORT_AUTH_MODE=direct محليًا)',
    );
  }
  for (const account of plan.accountsToCreate) {
    try {
      const { id, email } = await ensureLegacyAccount(
        db,
        account,
        adminId,
        options.auth!,
        fetchImpl,
      );
      created.set(account.name, id);
      if (email) result.accountsCreated.push({ name: account.name, email });
      else result.accountsReused.push(account.name);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      result.failures.push({ source: 'account', row: 0, name: account.name, code });
    }
  }
  const userOf = (target: StudentTarget) =>
    target.kind === 'profile' ? target.profileId : (created.get(target.name) ?? null);

  const oldest = new Map<string, string>();
  const saw = (userId: string, date: string) => {
    const current = oldest.get(userId);
    if (current === undefined || date < current) oldest.set(userId, date);
  };

  // 2) logs: one transaction per student
  const withUser = (list: PlannedLog[]) => list.filter((log) => userOf(log.target) !== null);
  for (const [userId, logs] of groupBy(withUser(plan.toImport), (log) => userOf(log.target)!)) {
    await transaction(db, () =>
      withActive(db, [userId], async () => {
        await asAdmin(db, adminId);
        for (const log of logs) {
          const code = await tryStatement(
            db,
            `select save_log(p_period => $1::habit_frequency, p_period_start => $2::date,
                             p_entries => $3::jsonb, p_user_id => $4::uuid)`,
            [log.period, log.periodStart, JSON.stringify(log.entries), userId],
          );
          if (code)
            result.failures.push({ source: log.source, row: log.row, name: log.name, code });
          else {
            result.logsSaved += 1;
            saw(userId, log.periodStart);
          }
        }
        await asSystem(db);
      }),
    );
  }

  // 3) attendance: one shared imported session per date, one transaction per session
  const marks = plan.attendance.filter((mark) => userOf(mark.target) !== null);
  for (const [date, rows] of groupBy(marks, (mark) => mark.date)) {
    await transaction(db, async () => {
      const found = await db.query<{ id: string }>(
        `select id from sessions where group_id is null and session_date = $1 and title = $2
          order by created_at limit 1`,
        [date, IMPORTED_SESSION_TITLE],
      );
      const sessionId =
        found.rows[0]?.id ??
        (
          await db.query<{ id: string }>(
            `insert into sessions (group_id, session_date, title, created_by)
             values (null, $1, $2, $3) returning id`,
            [date, IMPORTED_SESSION_TITLE, adminId],
          )
        ).rows[0]!.id;
      const users = rows.map((mark: PlannedAttendance) => userOf(mark.target)!);
      await withActive(db, users, async () => {
        await asAdmin(db, adminId);
        for (const [i, mark] of rows.entries()) {
          const code = await tryStatement(db, 'select set_attendance($1::uuid, $2::jsonb)', [
            sessionId,
            JSON.stringify([{ user_id: users[i], status: mark.status }]),
          ]);
          if (code)
            result.failures.push({ source: 'attendance', row: mark.row, name: mark.name, code });
          else {
            result.attendanceSaved += 1;
            saw(users[i]!, date);
          }
        }
        await asSystem(db);
      });
    });
  }

  // 4) joined_at = least(joined_at, oldest imported date) (spec §14 item 7)
  for (const [userId, date] of oldest) {
    const updated = await db.query(
      'update profiles set joined_at = $2::date where id = $1 and joined_at > $2::date returning id',
      [userId, date],
    );
    result.joinedAtUpdated += updated.rows.length;
  }
  return result;
}
