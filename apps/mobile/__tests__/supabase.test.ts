import { ar } from '../src/messages/ar';

const mockCreateBrowserClient = jest.fn(() => ({ kind: 'client' }));
jest.mock('@awrad/supabase-client', () => ({ createBrowserClient: mockCreateBrowserClient }));

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));

const KEYS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;

function loadModule(): typeof import('../src/lib/supabase') {
  let mod: typeof import('../src/lib/supabase') | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<typeof import('../src/lib/supabase')>('../src/lib/supabase');
  });
  return mod!;
}

describe('supabase client', () => {
  const saved = KEYS.map((k) => process.env[k]);

  beforeEach(() => {
    mockCreateBrowserClient.mockClear();
    for (const k of KEYS) delete process.env[k];
  });

  afterAll(() => {
    KEYS.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  });

  it('fails fast with the Arabic missing-env message when the variables are not set', () => {
    expect(() => loadModule()).toThrow(ar.errors.missingEnv);
    expect(mockCreateBrowserClient).not.toHaveBeenCalled();
  });

  it('fails when only one variable is set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(() => loadModule()).toThrow(ar.errors.missingEnv);
  });

  it('creates the client with the configured URL and anon key', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { supabase } = loadModule();
    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.anything(),
    );
    expect(supabase).toEqual({ kind: 'client' });
  });

  it('uses a SecureStore adapter on native and localStorage (no adapter) on web', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { nativeStorage, storageFor } = loadModule();
    expect(storageFor('web')).toBeUndefined();
    expect(storageFor('ios')).toBe(nativeStorage);
    expect(storageFor('android')).toBe(nativeStorage);
    await nativeStorage.setItem('k', 'v');
    await expect(nativeStorage.getItem('k')).resolves.toBe('v');
    await nativeStorage.removeItem('k');
    await expect(nativeStorage.getItem('k')).resolves.toBeNull();
  });
});
