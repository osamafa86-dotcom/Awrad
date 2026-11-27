import type { CookieOptions } from '@awrad/supabase-client';

/**
 * Attributes of the dashboard's Supabase session cookies (spec §13 «cookies آمنة (اللوحة)», final review admin I-4).
 * - HttpOnly: the admin reads Supabase only on the server (Server Components, Server Actions, proxy.ts) — there is
 *   no browser client — so no script needs the cookie, and an injected one cannot steal the staff refresh token.
 * - Secure whenever the deployment is https (the Supabase URL is https on staging and production); a local http
 *   stack (dev, the e2e server on 127.0.0.1) cannot set a Secure cookie, so it is left off there.
 * - SameSite=Lax and the whole site, as @supabase/ssr's defaults.
 */
export function adminCookieOptions(supabaseUrl: string): CookieOptions {
  return {
    httpOnly: true,
    secure: supabaseUrl.startsWith('https:'),
    sameSite: 'lax',
    path: '/',
  };
}
