import type { Session } from '@supabase/supabase-js';
import type { Database } from '@awrad/supabase-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface SessionState {
  session: Session | null;
  profile: Profile | null;
  /** True until we know who the user is AND (when signed in) their profile has loaded. */
  loading: boolean;
  error: unknown;
}

export interface UseSession extends SessionState {
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

const INITIAL: SessionState = { session: null, profile: null, loading: true, error: null };

/** Auth session + the signed-in user's `profiles` row. Call once near the root. */
export function useSession(): UseSession {
  const [state, setState] = useState<SessionState>(INITIAL);
  const userId = useRef<string | null>(null);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
    // Ignore a result for a user who has since signed out or been replaced.
    if (!mounted.current || userId.current !== uid) return;
    setState((s) => ({ ...s, profile: error ? null : data, error: error ?? null, loading: false }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!next) {
        userId.current = null;
        setState({ session: null, profile: null, loading: false, error: null });
        return;
      }
      const uid = next.user.id;
      if (uid === userId.current && event !== 'USER_UPDATED') {
        // Token refresh / repeated SIGNED_IN for the same user: keep the profile, swap the session.
        setState((s) => ({ ...s, session: next }));
        return;
      }
      userId.current = uid;
      setState({ session: next, profile: null, loading: true, error: null });
      // Never call supabase from inside this callback synchronously (it can deadlock auth).
      setTimeout(() => void loadProfile(uid), 0);
    });
    return () => {
      mounted.current = false;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!userId.current) return;
    // Retrying after a failed load shows the loading state again; a quiet refresh does not.
    setState((s) => (s.error ? { ...s, loading: true, error: null } : s));
    await loadProfile(userId.current);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { ...state, signOut, refreshProfile };
}
