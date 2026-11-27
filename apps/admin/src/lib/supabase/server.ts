import { createServerClient, type TypedClient } from '@awrad/supabase-client';
import { cookies } from 'next/headers';

import { supabaseEnv } from '../env';
import { adminCookieOptions } from './cookies';
import { fetchProfile, type CurrentProfile } from './profile';

export type { CurrentProfile };

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** Supabase client for Server Components and Server Actions; the session lives in cookies. */
export async function createClient(): Promise<TypedClient> {
  const { url, anonKey } = supabaseEnv();
  const store = await cookies();
  return createServerClient(
    url,
    anonKey,
    {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            // why: options are @supabase/ssr's cookie attributes, the same shape Next's cookie store takes.
            store.set(name, value, options as Parameters<CookieStore['set']>[2]);
          }
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the session on every request.
        }
      },
    },
    adminCookieOptions(url),
  );
}

/**
 * The signed-in user's profile, or null when signed out. Any failure (no session, Supabase
 * unreachable, missing row) counts as signed out: it never throws into a page.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return await fetchProfile(supabase, data.user.id);
  } catch {
    return null;
  }
}
