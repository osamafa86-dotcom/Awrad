import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useSession } from '../src/hooks/useSession';
import { DEVICE_TOKEN_KEY } from '../src/lib/notifications';

// Final review mobile I1 + I3: signing out on a shared phone must stop the signed-out student's reminders on this
// device (delete this device's push_tokens row, by its own token, while the session can still do it under RLS) and
// take their unsaved drafts with them — before the session is cleared.
type AuthCb = (event: string, session: Session | null) => void;
let authCb: AuthCb | undefined;
const order: string[] = [];
const mockDeletes: Array<Record<string, unknown>> = [];

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ status: 'granted' }),
  getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[fresh]' }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } },
}));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCb) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signOut: async () => {
        order.push('auth.signOut');
        return { error: null };
      },
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    },
    from: (table: string) => {
      if (table === 'push_tokens') {
        const filters: Record<string, unknown> = {};
        const chain = {
          delete: () => chain,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
          },
          then: (resolve: (r: { error: null }) => unknown) => {
            order.push('push_tokens.delete');
            mockDeletes.push({ ...filters });
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return chain;
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'u1', is_active: true }, error: null }) }) }),
      };
    },
  },
}));

const session = { user: { id: 'u1' } } as unknown as Session;

async function signedIn() {
  const hook = await renderHook(() => useSession());
  await act(() => authCb!('INITIAL_SESSION', session));
  await waitFor(() => expect(hook.result.current.profile).not.toBeNull());
  return hook;
}

beforeEach(async () => {
  order.length = 0;
  mockDeletes.length = 0;
  await AsyncStorage.clear();
  jest.replaceProperty(Platform, 'OS', 'ios');
});
afterEach(() => jest.restoreAllMocks());

describe('signOut', () => {
  test("deletes only this device's token row, then clears the session", async () => {
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, 'ExponentPushToken[dev]');
    const { result } = await signedIn();
    await act(() => result.current.signOut());
    expect(mockDeletes).toEqual([{ user_id: 'u1', token: 'ExponentPushToken[dev]' }]);
    expect(order).toEqual(['push_tokens.delete', 'auth.signOut']);
  });

  test("removes the user's drafts (and old unkeyed ones) but not another user's", async () => {
    await AsyncStorage.multiSet([
      ['draft:u1:daily:2026-11-26', '{"note":"خاص"}'],
      ['draft:u1:weekly:2026-11-22', '{}'],
      ['draft:daily:2026-11-25', '{}'],
      ['draft:u2:daily:2026-11-26', '{}'],
    ]);
    const { result } = await signedIn();
    await act(() => result.current.signOut());
    const drafts = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('draft:'));
    expect(drafts).toEqual(['draft:u2:daily:2026-11-26']);
  });

  test('a failing token delete does not keep the student signed in', async () => {
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, 'ExponentPushToken[dev]');
    const { supabase } = jest.requireMock('../src/lib/supabase') as {
      supabase: { from: (t: string) => unknown };
    };
    const original = supabase.from;
    supabase.from = (table: string) => {
      if (table === 'push_tokens') throw new Error('offline');
      return (original as (t: string) => unknown)(table);
    };
    try {
      const { result } = await signedIn();
      await act(() => result.current.signOut());
      expect(order).toEqual(['auth.signOut']);
    } finally {
      supabase.from = original;
    }
  });
});
