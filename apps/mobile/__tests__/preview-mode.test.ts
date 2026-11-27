// PREVIEW-2: with EXPO_PUBLIC_PREVIEW=1 the app reads from the in-memory fake (dev-only screenshots).
import { ar } from '../src/messages/ar';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEYS = ['EXPO_PUBLIC_PREVIEW', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;

type SupabaseModule = typeof import('../src/lib/supabase');

function loadModule(): SupabaseModule {
  let mod: SupabaseModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<SupabaseModule>('../src/lib/supabase');
  });
  return mod!;
}

describe('preview mode', () => {
  const saved = KEYS.map((k) => process.env[k]);

  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  afterAll(() => {
    KEYS.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  });

  it('serves the fake client with a signed-in, active, tracked student and needs no Supabase env', async () => {
    process.env.EXPO_PUBLIC_PREVIEW = '1';
    const { supabase } = loadModule();
    const { PREVIEW_USER_ID } = jest.requireActual<typeof import('../src/preview/fixtures')>('../src/preview/fixtures');

    const { data } = await supabase.auth.getSession();
    expect(data.session?.user.id).toBe(PREVIEW_USER_ID);

    const profile = await supabase.from('profiles').select('*').eq('id', PREVIEW_USER_ID).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({ full_name: 'أحمد محمد', role: 'student', is_active: true, is_tracked: true });
  });

  it('announces the preview session to auth listeners, as supabase-js does on subscribe', async () => {
    process.env.EXPO_PUBLIC_PREVIEW = '1';
    const { supabase } = loadModule();
    const events: Array<[string, string | undefined]> = [];
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      events.push([event, session?.user.id]);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(events[0]?.[0]).toBe('INITIAL_SESSION');
    expect(events[0]?.[1]).toBeTruthy();
    data.subscription.unsubscribe();
  });

  it('pins the preview "today" to the fixture date', async () => {
    process.env.EXPO_PUBLIC_PREVIEW = '1';
    let clock: typeof import('../src/lib/clock') | undefined;
    // A fresh module registry: the clock is pinned by loading the preview client.
    jest.isolateModules(() => {
      jest.requireActual('../src/lib/supabase');
      clock = jest.requireActual<typeof import('../src/lib/clock')>('../src/lib/clock');
    });
    expect(clock!.localToday('Asia/Riyadh')).toBe('2026-11-26');
  });

  it('still fails fast with the missing-env message when preview is off and the env is unset', () => {
    expect(() => loadModule()).toThrow(ar.errors.missingEnv);
  });
});
