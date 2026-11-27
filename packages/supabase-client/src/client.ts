import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { createServerClient as createSsrServerClient } from '@supabase/ssr';
import type { Database } from './database.types';

export type { Database };
export type TypedClient = SupabaseClient<Database>;

/** Browser / native client. Expo passes a SecureStore adapter; web omits it (localStorage default). */
export function createBrowserClient(
  url: string,
  anonKey: string,
  storage?: SupportedStorage,
): TypedClient {
  return createClient<Database>(url, anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  // why: options are opaque cookie attributes owned by @supabase/ssr; we only forward them. `headers`
  // (cache-control etc.) is optional so simple callers may ignore it; middleware should apply it.
  setAll(
    cookies: {
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }[],
    headers?: Record<string, string>,
  ): void;
}

/** Server-side client (Next.js admin) that persists the session in cookies via @supabase/ssr. */
export function createServerClient(
  url: string,
  anonKey: string,
  cookies: CookieAdapter,
): TypedClient {
  return createSsrServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet, headers) => cookies.setAll(toSet, headers),
    },
  });
}
