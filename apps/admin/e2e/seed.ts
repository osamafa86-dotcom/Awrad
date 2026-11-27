import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { TEST_GROUP_NAME, TEST_USERS } from './users';

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

async function ensureGroup(db: SupabaseClient): Promise<string> {
  const found = check(await db.from('groups').select('id').eq('name', TEST_GROUP_NAME).limit(1).maybeSingle());
  if (found.data) return found.data.id as string;
  const created = await db.from('groups').insert({ name: TEST_GROUP_NAME }).select('id').single();
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
 * Playwright global setup: brings the three tier (b) accounts to a known state. Every step converges,
 * so a run interrupted half-way is repaired by the next one: the group and invitation are reused, the
 * auth user is created only if missing (the `handle_new_user` trigger builds its profile from the
 * invitation), then the profile and the supervisor link are set explicitly.
 */
export default async function seed(): Promise<void> {
  const db = serviceClient();
  if (!db) return;

  const groupId = await ensureGroup(db);
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = new Map(listed.data.users.map((user) => [user.email?.toLowerCase(), user.id]));

  for (const user of Object.values(TEST_USERS)) {
    const profile = {
      full_name: user.fullName,
      role: user.role,
      group_id: user.inGroup ? groupId : null,
      is_tracked: user.isTracked,
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

    check(await db.from('profiles').update({ ...profile, is_active: true }).eq('id', userId));
    if (user.role === 'supervisor') {
      check(
        await db
          .from('group_supervisors')
          .upsert({ group_id: groupId, user_id: userId }, { onConflict: 'group_id,user_id', ignoreDuplicates: true }),
      );
    }
  }
}
