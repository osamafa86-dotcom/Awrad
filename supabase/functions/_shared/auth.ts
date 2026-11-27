// Supabase clients for Edge Functions (Deno only: reads Deno.env). The runtime injects SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY; the service-role key never leaves the function.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Acts as the caller: anon key plus the request's Authorization header, so RLS and auth.uid() apply. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: NO_SESSION,
  });
}

/** Bypasses RLS. Only for the steps the caller was checked for. */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: NO_SESSION });
}

/** No user at all: for the public auth endpoints (sending a sign-in code). */
export function anonClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: NO_SESSION });
}

/** The caller behind the request's JWT and whether they are an active admin (`is_admin()`); null without one. */
export async function callerOf(req: Request): Promise<{ id: string; isAdmin: boolean } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = userClient(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const admin = await client.rpc('is_admin');
  return { id: data.user.id, isAdmin: !admin.error && admin.data === true };
}
