// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Final review admin I-4 (spec §13 «cookies آمنة (اللوحة)»): the dashboard's Supabase session cookie carries a staff
// refresh token. The admin never reads Supabase in the browser (no browser client; Server Components and Server
// Actions only), so the cookie is HttpOnly; it is Secure whenever the deployment is https, SameSite=Lax.
const client = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })),
}));
vi.mock('@awrad/supabase-client', () => client);
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

import { proxy } from '../../proxy';
import { adminCookieOptions } from '@/lib/supabase/cookies';
import { createClient } from '@/lib/supabase/server';

beforeEach(() => {
  client.createServerClient.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://api.awrad.example');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
});

describe('adminCookieOptions', () => {
  it('https deployment: HttpOnly, Secure, SameSite=Lax, whole site', () => {
    expect(adminCookieOptions('https://api.awrad.example')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('a local http stack (dev, e2e on 127.0.0.1) keeps HttpOnly but cannot use Secure', () => {
    expect(adminCookieOptions('http://127.0.0.1:54321')).toMatchObject({ httpOnly: true, secure: false });
  });
});

describe('both server-side call sites pass them', () => {
  it('Server Components and Server Actions (lib/supabase/server)', async () => {
    await createClient();
    expect(client.createServerClient).toHaveBeenCalledWith(
      'https://api.awrad.example',
      'anon',
      expect.anything(),
      adminCookieOptions('https://api.awrad.example'),
    );
  });

  it('the role guard that refreshes the session on every request (proxy.ts)', async () => {
    await proxy(new NextRequest('https://admin.awrad.example/login'));
    expect(client.createServerClient).toHaveBeenCalledWith(
      'https://api.awrad.example',
      'anon',
      expect.anything(),
      adminCookieOptions('https://api.awrad.example'),
    );
  });
});
