// POST /functions/v1/send-reminders (spec §12). Deno entry for the Supabase Edge Runtime only; the logic and its
// tests live in handler.ts. Called by the hourly pg_cron job (pg_net) with `Authorization: Bearer <CRON_SECRET>`,
// not a user JWT, so it is deployed without verify_jwt (supabase/config.jsonc; the staging router's NO_VERIFY_JWT).
import { serviceClient } from '../_shared/auth.ts';
import { json } from '../_shared/cors.ts';
import { handleRequest, type DueReminder, type SendDeps } from './handler.ts';

function deps(): SendDeps {
  const admin = serviceClient();
  return {
    dueReminders: async (now) => {
      const { data, error } = await admin.rpc('due_reminders', { p_now: now.toISOString() });
      if (error) throw error;
      return (data ?? []) as DueReminder[];
    },
    fetch: (url, init) => fetch(url, init),
    deleteTokens: async (tokens) => {
      const { error } = await admin.from('push_tokens').delete().in('token', tokens);
      if (error) throw error;
    },
    logSent: async (rows) => {
      const { error } = await admin
        .from('reminder_log')
        .upsert(rows, { onConflict: 'user_id,kind,sent_for', ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  try {
    const { status, body } = await handleRequest(
      { authorization: req.headers.get('Authorization'), secret: Deno.env.get('CRON_SECRET'), now: new Date() },
      deps(),
    );
    // Counts only: never tokens, ids or emails.
    if (status === 200) console.log('send-reminders', JSON.stringify(body));
    return json(status, body);
  } catch (error) {
    console.error('send-reminders: failed', error instanceof Error ? error.message : 'unknown error');
    return json(500, { code: 'SEND_FAILED' });
  }
});
