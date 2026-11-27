import type { Session } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSession } from '../src/hooks/useSession';

type AuthCb = (event: string, session: Session | null) => void;
let authCb: AuthCb | undefined;
const mockUnsubscribe = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn<{ select: typeof mockSelect }, [string]>(() => ({ select: mockSelect }));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCb) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      signOut: () => mockSignOut(),
      getSession: jest.fn(),
    },
    from: (t: string) => mockFrom(t),
  },
}));

const session = { user: { id: 'u1' } } as unknown as Session;
const PROFILE = { id: 'u1', full_name: 'طالب', is_active: true, is_tracked: true };

describe('useSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authCb = undefined;
    mockSingle.mockResolvedValue({ data: PROFILE, error: null });
  });

  it('starts loading, then reports signed-out when the initial session is empty', async () => {
    const { result } = await renderHook(() => useSession());
    expect(result.current.loading).toBe(true);
    await act(() => authCb!('INITIAL_SESSION', null));
    expect(result.current).toMatchObject({ session: null, profile: null, loading: false });
  });

  it('loads the profile row for the user once auth reports a session', async () => {
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(result.current.profile).toEqual(PROFILE));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
    expect(result.current).toMatchObject({ session, loading: false, error: null });
  });

  it('exposes a profile error without leaving loading stuck', async () => {
    const failure = { code: 'PGRST116', message: 'no rows' };
    mockSingle.mockResolvedValue({ data: null, error: failure });
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current).toMatchObject({ profile: null, loading: false });
  });

  it('does not refetch the profile on a token refresh for the same user', async () => {
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(() => authCb!('TOKEN_REFRESHED', { user: { id: 'u1' } } as unknown as Session));
    expect(result.current.loading).toBe(false);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('clears the profile on sign-out events', async () => {
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(() => authCb!('SIGNED_OUT', null));
    expect(result.current).toMatchObject({ session: null, profile: null, loading: false });
  });

  it('refreshProfile reloads the row', async () => {
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    mockSingle.mockResolvedValue({ data: { ...PROFILE, full_name: 'جديد' }, error: null });
    await act(() => result.current.refreshProfile());
    expect(result.current.profile?.full_name).toBe('جديد');
  });

  it('signOut delegates to supabase.auth.signOut', async () => {
    const { result } = await renderHook(() => useSession());
    await act(() => result.current.signOut());
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('turns a thrown fetch error into error state instead of sticking on loading', async () => {
    const failure = new Error('network down');
    mockSingle.mockRejectedValue(failure);
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current).toMatchObject({ profile: null, loading: false });
  });

  it('ignores a profile fetch that resolves after sign-out', async () => {
    let resolve!: (v: unknown) => void;
    mockSingle.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(mockSingle).toHaveBeenCalled());
    await act(() => authCb!('SIGNED_OUT', null));
    await act(async () => resolve({ data: PROFILE, error: null }));
    expect(result.current).toMatchObject({ session: null, profile: null, loading: false });
  });

  it('ignores the first user\'s profile when another user signs in before it resolves', async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    mockSingle.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    const { result } = await renderHook(() => useSession());
    await act(() => authCb!('INITIAL_SESSION', session));
    await waitFor(() => expect(resolvers).toHaveLength(1));
    const other = { user: { id: 'u2' } } as unknown as Session;
    await act(() => authCb!('SIGNED_IN', other));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => resolvers[0]!({ data: PROFILE, error: null }));
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => resolvers[1]!({ data: { ...PROFILE, id: 'u2' }, error: null }));
    expect(result.current.profile?.id).toBe('u2');
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = await renderHook(() => useSession());
    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
