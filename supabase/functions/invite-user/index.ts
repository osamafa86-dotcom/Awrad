// POST /functions/v1/invite-user (F-01). Deno entry for the Supabase Edge Runtime only; the logic and
// its tests live in handler.ts. Runs with verify_jwt (the default), so only signed-in callers reach it.
import { anonClient, callerOf, serviceClient } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';
import { handleInvite, type CreateUserResult, type InviteDeps } from './handler.ts';

async function parse(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function deps(req: Request): InviteDeps {
  const admin = serviceClient();
  return {
    caller: () => callerOf(req),
    insertInvitation: async (row) => {
      const { data, error } = await admin.from('invitations').insert(row).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    deleteInvitation: async (id) => {
      const { error } = await admin.from('invitations').delete().eq('id', id);
      if (error) throw error;
    },
    createUser: async ({ email, full_name }): Promise<CreateUserResult> => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (!error && data.user) return { ok: true, id: data.user.id };
      const exists =
        error?.code === 'email_exists' || /already (been )?registered/i.test(error?.message ?? '');
      return { ok: false, reason: exists ? 'EMAIL_EXISTS' : 'FAILED' };
    },
    sendWelcome: async (email) => {
      // The sign-in code email is the welcome: it tells the new student how to sign in (F-01, F-02).
      const { error } = await anonClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      return !error;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  try {
    const { status, body } = await handleInvite(await parse(req), deps(req));
    return json(status, body);
  } catch (error) {
    // Anything outside the handler's own error paths (e.g. a missing env var): still a JSON answer.
    console.error('invite-user: unexpected failure', error);
    return json(500, { code: 'INVITE_FAILED' });
  }
});
