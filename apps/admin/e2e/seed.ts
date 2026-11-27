import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { TEST_GROUP_NAME, TEST_USERS } from './users';

/** Service-role client for the signed-in tier, or null when no Supabase stack is configured. */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureGroup(db: SupabaseClient): Promise<string> {
  const found = await db.from('groups').select('id').eq('name', TEST_GROUP_NAME).maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data.id as string;
  const created = await db.from('groups').insert({ name: TEST_GROUP_NAME }).select('id').single();
  if (created.error) throw created.error;
  return created.data.id as string;
}

/**
 * Playwright global setup: invites the three tier (b) users and creates their auth accounts; the
 * `handle_new_user` trigger builds each profile from its invitation. Idempotent: users that already
 * exist are skipped.
 */
export default async function seed(): Promise<void> {
  const db = serviceClient();
  if (!db) return;

  const groupId = await ensureGroup(db);
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = new Set(listed.data.users.map((user) => user.email?.toLowerCase()));

  for (const user of Object.values(TEST_USERS)) {
    if (existing.has(user.email)) continue;
    const invited = await db.from('invitations').insert({
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      group_id: user.inGroup ? groupId : null,
      is_tracked: user.isTracked,
    });
    if (invited.error) throw invited.error;
    const created = await db.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (created.error) throw created.error;
    if (user.role === 'supervisor') {
      const linked = await db
        .from('group_supervisors')
        .upsert({ group_id: groupId, user_id: created.data.user.id }, { onConflict: 'group_id,user_id' });
      if (linked.error) throw linked.error;
    }
  }
}
