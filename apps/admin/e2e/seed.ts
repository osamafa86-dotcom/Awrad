import { addDays, todayIn } from '@awrad/domain';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { OTHER_GROUP_NAME, SEEDED_LOGS, TEST_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

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
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
  if (verified.error) throw verified.error;
  return client;
}

type Outcome = (typeof SEEDED_LOGS)[number]['outcome'];

/**
 * save_log's p_entries for `date`: every active daily habit done (checklists with every active item
 * checked), or, for `failed`, the first tristate habit not_done. Habits are data (AGENTS.md §3).
 */
async function dailyEntries(client: SupabaseClient, date: string, outcome: Outcome) {
  const habits = check(
    await client
      .from('habits')
      .select('id, kind')
      .eq('frequency', 'daily')
      .lte('active_from', date)
      .or(`active_to.is.null,active_to.gte.${date}`)
      .order('sort_order'),
  ).data as Array<{ id: string; kind: 'tristate' | 'checklist' }>;
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
  const failing = outcome === 'failed' ? habits.find((h) => h.kind === 'tristate')?.id : undefined;
  return habits.map((h) =>
    h.kind === 'checklist'
      ? { habit_id: h.id, status: 'done', checked_item_ids: items.filter((i) => i.habit_id === h.id).map((i) => i.id) }
      : { habit_id: h.id, status: h.id === failing ? 'not_done' : 'done' },
  );
}

/**
 * The known logs the overview spec reads (SEEDED_LOGS), written like every other log: through save_log
 * (AGENTS.md §3), as the admin, who may write for others and outside the backfill window. Re-running
 * converges (save_log upserts). The days are relative to today, so a stack kept across days keeps older
 * logs too; CI starts a fresh stack every run.
 */
async function seedLogs(db: SupabaseClient, ids: Map<string, string>): Promise<void> {
  const admin = await sessionFor(db, TEST_USERS.admin.email);
  const today = todayIn(TEST_TIMEZONE);
  for (const log of SEEDED_LOGS) {
    const date = addDays(today, -log.daysAgo);
    const saved = await admin.rpc('save_log', {
      p_user_id: ids.get(log.user),
      p_period: 'daily',
      p_period_start: date,
      p_entries: await dailyEntries(admin, date, log.outcome),
    });
    if (saved.error) throw saved.error;
  }
}

/**
 * Playwright global setup: brings the tier (b) accounts to a known state. Every step converges,
 * so a run interrupted half-way is repaired by the next one: the group and invitation are reused, the
 * auth user is created only if missing (the `handle_new_user` trigger builds its profile from the
 * invitation), then the profile and the supervisor link are set explicitly.
 */
export default async function seed(): Promise<void> {
  const db = serviceClient();
  if (!db) return;

  const groupId = await ensureGroup(db, TEST_GROUP_NAME);
  await ensureGroup(db, OTHER_GROUP_NAME);
  // A month before today, so the seeded logs fall after joining (streaks count from joined_at).
  const joinedAt = addDays(todayIn(TEST_TIMEZONE), -30);
  const ids = new Map<string, string>();
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = new Map(listed.data.users.map((user) => [user.email?.toLowerCase(), user.id]));

  for (const [key, user] of Object.entries(TEST_USERS)) {
    const profile = {
      full_name: user.fullName,
      role: user.role,
      group_id: user.inGroup ? groupId : null,
      is_tracked: user.isTracked,
      joined_at: joinedAt,
    };

    let userId = existing.get(user.email);
    if (!userId) {
      await ensureInvitation(db, { email: user.email, ...profile });
      const created = await db.auth.admin.createUser({
        email: user.email,
        email_confirm: true,
        user_metadata: { full_name: user.fullName },
      });
      if (created.error) throw created.error;
      userId = created.data.user.id;
    }

    ids.set(key, userId);
    check(await db.from('profiles').update({ ...profile, is_active: true }).eq('id', userId));
    if (user.role === 'supervisor') {
      check(
        await db
          .from('group_supervisors')
          .upsert({ group_id: groupId, user_id: userId }, { onConflict: 'group_id,user_id', ignoreDuplicates: true }),
      );
    }
  }

  await seedLogs(db, ids);
}
