import { createServerClient } from '@awrad/supabase-client';
import { NextResponse, type NextRequest } from 'next/server';

import { resolveAccess, type AccessProfile } from '@/lib/access';
import { supabaseEnv } from '@/lib/env';
import { adminCookieOptions } from '@/lib/supabase/cookies';
import { fetchProfile } from '@/lib/supabase/profile';

/**
 * Role guard (GUARD-1) for every page request: refreshes the Supabase session cookie, then applies
 * resolveAccess(). RLS stays the security boundary; this keeps each role on the screens meant for it.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Cache-Control etc. that @supabase/ssr asks for whenever it writes the session cookie.
  let sessionHeaders: Record<string, string> = {};
  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient(
    url,
    anonKey,
    {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          // why: options are @supabase/ssr's cookie attributes, the same shape Next's cookie store takes.
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        }
        sessionHeaders = headers ?? {};
        for (const [key, value] of Object.entries(sessionHeaders)) response.headers.set(key, value);
      },
    },
    adminCookieOptions(url),
  );

  let signedIn = false;
  let profile: AccessProfile | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      signedIn = true;
      profile = await fetchProfile(supabase, data.user.id);
    }
  } catch {
    // Any auth failure (no session, Supabase unreachable) counts as signed out.
  }

  const { pathname, search } = request.nextUrl;
  const access = resolveAccess({ pathname, search, signedIn, profile });
  if (access.kind === 'allow') return response;

  const redirect = NextResponse.redirect(new URL(access.to, request.url));
  // Carry a refreshed (or cleared) session cookie, and its no-cache headers, over to the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const [key, value] of Object.entries(sessionHeaders)) redirect.headers.set(key, value);
  return redirect;
}

export const config = {
  // Every page; not Next's assets or static files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
};
