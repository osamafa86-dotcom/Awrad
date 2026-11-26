// Shared database test harness for every supabase/tests/*.test.ts file.
// Talks to the local cluster (run `pnpm db:reset` first) with plain `pg`; no Docker, no supabase-js.
import pg from 'pg';
import { queryAsUser, rpcResult, rpcStatement } from './sql';

export const DB_URL: string =
  process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54329/awrad';

// Dates cross our boundaries as 'YYYY-MM-DD' strings (AGENTS.md §3), so keep `date` columns as
// text instead of letting pg turn them into local-midnight JS Dates.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

type Role = 'student' | 'supervisor' | 'admin';

/** A connected superuser client (bypasses RLS and the profile guard). The caller must `end()` it. */
export async function adminDb(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function withAdmin<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = await adminDb();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/**
 * Creates an auth user the way production does: a pending invitation, then the `auth.users` row
 * (the `handle_new_user` trigger provisions the profile from the invitation), then optional
 * `group_supervisors` rows. `isTracked` defaults per spec §5: true, except false for admins.
 * Idempotent per email: an existing user is returned unchanged if its role, group_id and
 * is_tracked match the options; a mismatch throws (two tests disagreeing about one email).
 */
export async function createTestUser(opts: {
  email: string;
  fullName: string;
  role: Role;
  groupId?: string | null;
  isTracked?: boolean;
  joinedAt?: string;
  supervises?: string[];
}): Promise<{ id: string }> {
  const email = opts.email.toLowerCase();
  const wanted = {
    role: opts.role,
    group_id: opts.groupId ?? null,
    is_tracked: opts.isTracked ?? opts.role !== 'admin',
  };
  return withAdmin(async (db) => {
    const existing = await db.query<{ id: string } & typeof wanted>(
      `select u.id, p.role, p.group_id, p.is_tracked
       from auth.users u left join profiles p on p.id = u.id where u.email = $1`,
      [email],
    );
    const found = existing.rows[0];
    if (found) {
      const { id, ...actual } = found;
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        throw new Error(
          `createTestUser: ${email} already exists as ${JSON.stringify(actual)}, ` +
            `not ${JSON.stringify(wanted)}`,
        );
      }
      return { id };
    }

    await db.query('begin');
    try {
      await db.query(
        `insert into invitations (email, full_name, role, group_id, is_tracked, joined_at)
         values ($1, $2, $3, $4, $5, coalesce($6::date, current_date))`,
        [
          email,
          opts.fullName,
          wanted.role,
          wanted.group_id,
          wanted.is_tracked,
          opts.joinedAt ?? null,
        ],
      );
      const user = await db.query<{ id: string }>(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
        [email, { full_name: opts.fullName }],
      );
      const id = user.rows[0]!.id;
      for (const groupId of opts.supervises ?? []) {
        await db.query('insert into group_supervisors (group_id, user_id) values ($1, $2)', [
          groupId,
          id,
        ]);
      }
      await db.query('commit');
      return { id };
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  });
}

/** Inserts a group; omitted options use the column defaults (Asia/Riyadh, week starts on 0). */
export async function createTestGroup(
  name: string,
  opts: { timezone?: string; weekStartsOn?: number } = {},
): Promise<{ id: string }> {
  return withAdmin(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into groups (name, timezone, week_starts_on)
       values ($1, coalesce($2, 'Asia/Riyadh'), coalesce($3::smallint, 0)) returning id`,
      [name, opts.timezone ?? null, opts.weekStartsOn ?? null],
    );
    return { id: result.rows[0]!.id };
  });
}

/** Per-call options: transaction-local settings, e.g. `{ 'app.test_now': '2026-11-26T10:00:00Z' }`. */
export interface CallOptions {
  settings?: Record<string, string>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- why: SQL rows are untyped unless the caller picks a shape, as in pg itself */
export interface UserClient {
  /** Runs one statement in its own transaction as this user (role `authenticated` + JWT claims). */
  query<T extends pg.QueryResultRow = any>(
    sql: string,
    params?: unknown[],
    opts?: CallOptions,
  ): Promise<pg.QueryResult<T>>;
  /**
   * Calls `select * from <fn>(name => value, ...)` as this user. Returns the bare value for a
   * scalar-returning function (e.g. `is_admin` → boolean; `null` if no row), otherwise the rows
   * array (set-returning / `returns table` functions).
   */
  rpc<T = any>(fn: string, args?: Record<string, unknown>, opts?: CallOptions): Promise<T>;
  end(): Promise<void>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Opens a dedicated connection acting as the (existing) auth user with this email. */
export async function clientAs(email: string): Promise<UserClient> {
  const client = await adminDb();
  const found = await client.query<{ id: string }>('select id from auth.users where email = $1', [
    email.toLowerCase(),
  ]);
  const userId = found.rows[0]?.id;
  if (!userId) {
    await client.end();
    throw new Error(`clientAs: no auth user with email ${email}`);
  }
  return {
    query: (sql, params, opts) => queryAsUser(client, userId, sql, params, opts?.settings),
    rpc: async (fn, args, opts) => {
      const { sql, params } = rpcStatement(fn, args);
      return rpcResult(fn, await queryAsUser(client, userId, sql, params, opts?.settings));
    },
    end: () => client.end(),
  };
}

/**
 * Empties all test data so each file starts clean: every table in `public` except the seeded
 * ones (app_settings, habits, habit_items) plus auth.users, with CASCADE and identity reset.
 * Note: CASCADE also empties any table holding a foreign key into a truncated table.
 */
export async function resetTestData(): Promise<void> {
  const keep = ['app_settings', 'habits', 'habit_items'];
  await withAdmin(async (db) => {
    const tables = await db.query<{ name: string }>(
      `select format('%I.%I', schemaname, tablename) as name from pg_tables
       where schemaname = 'public' and tablename <> all($1::text[])`,
      [keep],
    );
    const names = ['auth.users', ...tables.rows.map((row) => row.name)];
    await db.query(`truncate table ${names.join(', ')} restart identity cascade`);
  });
}

export interface Fixture {
  g1: string;
  g2: string;
  admin: string;
  sup1: string;
  sup2: string;
  p1: string;
  p2: string;
}

/** Returns the id of the group with this name, creating it (with defaults) if it does not exist. */
async function ensureGroup(name: string): Promise<string> {
  const found = await withAdmin((db) =>
    db.query<{ id: string }>('select id from groups where name = $1 order by created_at limit 1', [
      name,
    ]),
  );
  return found.rows[0]?.id ?? (await createTestGroup(name)).id;
}

/**
 * The shared RLS fixture (idempotent; call after `resetTestData()`): groups G1, G2; an admin with
 * no group (not tracked); supervisors sup1 (member and supervisor of G1) and sup2 (of G2); students
 * p1 (G1) and p2 (G2). Emails are `<name>@test`; returns the ids.
 */
export async function seedFixture(): Promise<Fixture> {
  const g1 = await ensureGroup('G1');
  const g2 = await ensureGroup('G2');
  const admin = await createTestUser({
    email: 'admin@test',
    fullName: 'Admin',
    role: 'admin',
    isTracked: false,
  });
  const sup1 = await createTestUser({
    email: 'sup1@test',
    fullName: 'Sup 1',
    role: 'supervisor',
    groupId: g1,
    supervises: [g1],
  });
  const sup2 = await createTestUser({
    email: 'sup2@test',
    fullName: 'Sup 2',
    role: 'supervisor',
    groupId: g2,
    supervises: [g2],
  });
  const p1 = await createTestUser({
    email: 'p1@test',
    fullName: 'P1',
    role: 'student',
    groupId: g1,
  });
  const p2 = await createTestUser({
    email: 'p2@test',
    fullName: 'P2',
    role: 'student',
    groupId: g2,
  });
  return {
    g1,
    g2,
    admin: admin.id,
    sup1: sup1.id,
    sup2: sup2.id,
    p1: p1.id,
    p2: p2.id,
  };
}
