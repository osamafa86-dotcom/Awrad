import { addDays, todayIn, weekStartFor } from '@awrad/domain';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  DELETION_REQUESTER,
  OTHER_GROUP_NAME,
  PERMANENT_DELETION,
  SEEDED_LOGS,
  SEEDED_SUPPORT,
  TEST_GROUP_NAME,
  TEST_HABIT_PREFIXES,
  TEST_TIMEZONE,
  TEST_USERS,
  type TestUserKey,
} from './users';

/** Service-role client for the signed-in tier, or null when no Supabase stack is configured. */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

async function ensureGroup(db: SupabaseClient, name: string): Promise<string> {
  const found = check(await db.from('groups').select('id').eq('name', name).limit(1).maybeSingle());
  if (found.data) return found.data.id as string;
  const created = await db.from('groups').insert({ name }).select('id').single();
  if (created.error) throw created.error;
  return created.data.id as string;
}

/** Pending invitation for `email`, reusing one a previous (interrupted) run left behind. */
async function ensureInvitation(db: SupabaseClient, row: Record<string, unknown> & { email: string }) {
  const pending = check(
    await db.from('invitations').select('id').eq('email', row.email).is('accepted_at', null).limit(1).maybeSingle(),
  );
  if (pending.data) check(await db.from('invitations').update(row).eq('id', pending.data.id));
  else check(await db.from('invitations').insert(row));
}

/**
 * A client signed in as `email`, without the sign-in screens: the service role mints a magic link and its
 * hashed token is verified on a fresh anon client (E2E_SUPABASE_ANON_KEY).
 */
async function sessionFor(db: SupabaseClient, email: string): Promise<SupabaseClient> {
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('E2E_SUPABASE_ANON_KEY is needed to seed logs through save_log');
  let link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  // why: GoTrue may refuse a new link within `max_frequency` (1s) of the previous one for the same user, and
  // the seed asks for the admin's twice (seedLogs, then resetPermanentDeletionFixture).
  for (let attempt = 1; link.error && attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  }
  if (link.error) throw link.error;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
  if (verified.error) throw verified.error;
  return client;
}

type Outcome = (typeof SEEDED_LOGS)[number]['outcome'];

/** A habit a test created (TEST_HABIT_PREFIXES on its slug or name). */
function isTestHabit(habit: { slug: string; name: string }): boolean {
  return TEST_HABIT_PREFIXES.some((prefix) => habit.slug.startsWith(prefix) || habit.name.startsWith(prefix));
}

/**
 * Removes test habits an interrupted run left behind, before any log is saved: save_log needs an entry
 * for every active habit (MISSING_ENTRY), and a seeded log that refers to one would stop its spec's own
 * cleanup (HABIT_HAS_LOGS). Only the ones no log refers to are deleted (the delete guard refuses the
 * others); those are skipped with a message. Items go with their habit (on delete cascade).
 */
async function removeLeftoverTestHabits(db: SupabaseClient): Promise<void> {
  const habits = check(await db.from('habits').select('id, slug, name')).data as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  const leftovers = habits.filter(isTestHabit).map((habit) => habit.id);
  if (leftovers.length === 0) return;
  // One `limit 1` probe per leftover (there are few): a single `.in()` could be cut off at max_rows.
  const withLogs = new Set<string>();
  for (const id of leftovers) {
    const probe = check(await db.from('log_entries').select('habit_id').eq('habit_id', id).limit(1));
    if ((probe.data ?? []).length > 0) withLogs.add(id);
  }
  const unlogged = leftovers.filter((id) => !withLogs.has(id));
  if (unlogged.length > 0) check(await db.from('habits').delete().in('id', unlogged));
  if (withLogs.size > 0) {
    console.warn(`seed: skipped ${withLogs.size} leftover test habit(s) that logs refer to (HABIT_HAS_LOGS)`);
  }
}

/**
 * save_log's p_entries for a `frequency` log on `date`: every active habit but test ones done (checklists
 * with every active item checked), or, for `failed`, every tristate habit not_done, so the day is failed under any
 * streak_threshold_pct (the checklists alone stay below it). Habits are data (AGENTS.md §3).
 */
async function entriesFor(client: SupabaseClient, frequency: 'daily' | 'weekly', date: string, outcome: Outcome) {
  const habits = (
    check(
      await client
        .from('habits')
        .select('id, slug, name, kind')
        .eq('frequency', frequency)
        .lte('active_from', date)
        .or(`active_to.is.null,active_to.gte.${date}`)
        .order('sort_order'),
    ).data as Array<{ id: string; slug: string; name: string; kind: 'tristate' | 'checklist' }>
  ).filter((habit) => !isTestHabit(habit));
  const items = check(
    await client
      .from('habit_items')
      .select('id, habit_id')
      .in(
        'habit_id',
        habits.map((h) => h.id),
      )
      .lte('active_from', date)
      .or(`active_to.is.null,active_to.gte.${date}`),
  ).data as Array<{ id: string; habit_id: string }>;
  const failed = outcome === 'failed';
  if (failed && !habits.some((h) => h.kind === 'tristate')) {
    // Without one the "failed" day would silently be saved as all done.
    throw new Error(`seed: no active ${frequency} tristate habit on ${date} to mark not_done`);
  }
  return habits.map((h) =>
    h.kind === 'checklist'
      ? { habit_id: h.id, status: 'done', checked_item_ids: items.filter((i) => i.habit_id === h.id).map((i) => i.id) }
      : { habit_id: h.id, status: failed ? 'not_done' : 'done' },
  );
}

/** The start of the current week of the test group (its week_starts_on), in TEST_TIMEZONE. */
async function currentWeekStart(db: SupabaseClient): Promise<string> {
  const group = check(
    await db.from('groups').select('week_starts_on').eq('name', TEST_GROUP_NAME).limit(1).single(),
  ).data as { week_starts_on: 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  return weekStartFor(todayIn(TEST_TIMEZONE), group.week_starts_on);
}

/** One daily log for `userId`, `daysAgo` days before today in TEST_TIMEZONE, saved by `admin` through save_log. */
async function saveDailyLog(admin: SupabaseClient, userId: string | undefined, daysAgo: number, outcome: Outcome) {
  const date = addDays(todayIn(TEST_TIMEZONE), -daysAgo);
  const saved = await admin.rpc('save_log', {
    p_user_id: userId,
    p_period: 'daily',
    p_period_start: date,
    p_entries: await entriesFor(admin, 'daily', date, outcome),
  });
  if (saved.error) throw saved.error;
}

/**
 * The known logs the overview spec reads (SEEDED_LOGS), written like every other log: through save_log
 * (AGENTS.md §3), as the admin, who may write for others and outside the backfill window. Re-running
 * converges (save_log upserts). The days are relative to today, so a stack kept across days keeps older
 * logs too; CI starts a fresh stack every run.
 */
async function seedLogs(db: SupabaseClient, ids: Map<string, string>): Promise<void> {
  const admin = await sessionFor(db, TEST_USERS.admin.email);
  try {
    for (const log of SEEDED_LOGS) await saveDailyLog(admin, ids.get(log.user), log.daysAgo, log.outcome);

    // SEEDED_SUPPORT: a weekly log with a review and a support request → support_status 'open'.
    const week = await currentWeekStart(db);
    const weekly = await admin.rpc('save_log', {
      p_user_id: ids.get(SEEDED_SUPPORT.user),
      p_period: 'weekly',
      p_period_start: week,
      p_entries: await entriesFor(admin, 'weekly', week, 'achieved'),
      p_review_text: SEEDED_SUPPORT.review,
      p_support_request_text: SEEDED_SUPPORT.request,
    });
    if (weekly.error) throw weekly.error;
  } finally {
    // This session only (the signed-in sessions the setup project saves stay valid).
    await admin.auth.signOut({ scope: 'local' });
  }
}

type GroupIds = Record<'test' | 'other', string>;

/**
 * Brings one TEST_USERS account to its known state: the auth user is created only if missing (the
 * `handle_new_user` trigger builds its profile from a pending invitation), then the profile and the
 * supervisor link are set explicitly. Returns the profile id.
 */
async function ensureUser(
  db: SupabaseClient,
  key: TestUserKey,
  groupIds: GroupIds,
  joinedAt: string,
  existingId: string | undefined,
): Promise<string> {
  const user = TEST_USERS[key];
  const profile = {
    full_name: user.fullName,
    role: user.role,
    group_id: user.group ? groupIds[user.group] : null,
    is_tracked: user.isTracked,
    joined_at: joinedAt,
  };

  let userId = existingId;
  if (!userId) {
    // A deleted account leaves its accepted invitation behind (support.spec.ts deletes p4, privacy.spec.ts p5).
    check(await db.from('invitations').delete().eq('email', user.email).not('accepted_at', 'is', null));
    await ensureInvitation(db, { email: user.email, ...profile });
    const created = await db.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
  }

  check(await db.from('profiles').update({ ...profile, is_active: true }).eq('id', userId));
  if (user.role === 'supervisor' && user.group) {
    check(
      await db
        .from('group_supervisors')
        .upsert(
          { group_id: groupIds[user.group], user_id: userId },
          { onConflict: 'group_id,user_id', ignoreDuplicates: true },
        ),
    );
  }
  return userId;
}

async function userIdOf(db: SupabaseClient, email: string): Promise<string | undefined> {
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  return listed.data.users.find((user) => user.email?.toLowerCase() === email)?.id;
}

/**
 * What support.spec.ts starts from, restored with the service role (test fixture, not app writes):
 * p1's seeded weekly request back to 'open' with the handled fields cleared, and DELETION_REQUESTER
 * present (re-created after a run deleted it) with one open deletion request. Converges when run again,
 * so the seed and every project's run of the spec start from the same state.
 */
export async function resetSupportFixtures(db: SupabaseClient | null = serviceClient()): Promise<void> {
  if (!db) return;
  const p1 = await userIdOf(db, TEST_USERS[SEEDED_SUPPORT.user].email);
  if (!p1) throw new Error('seed: p1 is missing; run the global setup first');
  check(
    await db
      .from('logs')
      .update({
        support_request_text: SEEDED_SUPPORT.request,
        support_status: 'open',
        handled_by: null,
        handled_at: null,
        handled_note: null,
      })
      .eq('user_id', p1)
      .eq('period', 'weekly')
      .eq('period_start', await currentWeekStart(db)),
  );

  const groupIds: GroupIds = {
    test: await ensureGroup(db, TEST_GROUP_NAME),
    other: await ensureGroup(db, OTHER_GROUP_NAME),
  };
  const email = TEST_USERS[DELETION_REQUESTER].email;
  const requester = await ensureUser(
    db,
    DELETION_REQUESTER,
    groupIds,
    addDays(todayIn(TEST_TIMEZONE), -30),
    await userIdOf(db, email),
  );
  const open = check(
    await db.from('deletion_requests').select('id').eq('user_id', requester).is('handled_at', null).maybeSingle(),
  );
  // Asked "today" every time, so the spec's 30-day deadline is known.
  if (open.data) check(await db.from('deletion_requests').update({ requested_at: new Date().toISOString() }).eq('id', open.data.id));
  else check(await db.from('deletion_requests').insert({ user_id: requester }));
}

/**
 * What privacy.spec.ts starts from: PERMANENT_DELETION's student present (re-created after a run deleted it)
 * with its one daily log, saved through save_log as the admin (upsert, so running it again converges).
 */
export async function resetPermanentDeletionFixture(db: SupabaseClient | null = serviceClient()): Promise<void> {
  if (!db) return;
  const groupIds: GroupIds = {
    test: await ensureGroup(db, TEST_GROUP_NAME),
    other: await ensureGroup(db, OTHER_GROUP_NAME),
  };
  const key = PERMANENT_DELETION.user;
  const userId = await ensureUser(
    db,
    key,
    groupIds,
    addDays(todayIn(TEST_TIMEZONE), -30),
    await userIdOf(db, TEST_USERS[key].email),
  );
  const admin = await sessionFor(db, TEST_USERS.admin.email);
  try {
    await saveDailyLog(admin, userId, PERMANENT_DELETION.daysAgo, PERMANENT_DELETION.outcome);
  } finally {
    await admin.auth.signOut({ scope: 'local' });
  }
}

/**
 * Playwright global setup: brings the tier (b) accounts to a known state (ensureUser), saves the known
 * logs and restores the support and permanent-deletion fixtures. Every step converges, so a run
 * interrupted half-way is repaired by the next one.
 */
export default async function seed(): Promise<void> {
  const db = serviceClient();
  if (!db) return;

  const groupIds = {
    test: await ensureGroup(db, TEST_GROUP_NAME),
    other: await ensureGroup(db, OTHER_GROUP_NAME),
  };
  // A month before today, so the seeded logs fall after joining (streaks count from joined_at).
  const joinedAt = addDays(todayIn(TEST_TIMEZONE), -30);
  const ids = new Map<string, string>();
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = new Map(listed.data.users.map((user) => [user.email?.toLowerCase(), user.id]));

  for (const key of Object.keys(TEST_USERS) as TestUserKey[]) {
    ids.set(key, await ensureUser(db, key, groupIds, joinedAt, existing.get(TEST_USERS[key].email)));
  }

  await removeLeftoverTestHabits(db);
  await seedLogs(db, ids);
  await resetSupportFixtures(db);
  await resetPermanentDeletionFixture(db);
}
