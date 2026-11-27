import { beforeEach, describe, expect, it, vi } from 'vitest';

// The admin passes its session-cookie attributes (spec §13 «cookies آمنة», final review admin I-4) through this
// wrapper; @supabase/ssr merges them over its defaults (httpOnly false, no Secure) for every cookie it writes.
const ssr = vi.hoisted(() => ({ createServerClient: vi.fn(() => ({})) }));
vi.mock('@supabase/ssr', () => ssr);

import { createServerClient } from '../client';

const adapter = { getAll: () => [], setAll: () => undefined };

beforeEach(() => ssr.createServerClient.mockClear());

describe('createServerClient', () => {
  it('forwards the cookie attributes it is given', () => {
    const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
    createServerClient('https://api.example.org', 'anon', adapter, cookieOptions);
    expect(ssr.createServerClient).toHaveBeenCalledWith(
      'https://api.example.org',
      'anon',
      expect.objectContaining({ cookieOptions }),
    );
  });

  it('leaves the library defaults alone when given none', () => {
    createServerClient('http://127.0.0.1:54321', 'anon', adapter);
    const options = (ssr.createServerClient.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(options.cookieOptions).toBeUndefined();
  });
});
