import type { Frequency, HabitDef } from '@awrad/domain';
import { fetchActiveHabits } from '@awrad/supabase-client';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

export interface UseActiveHabits {
  habits: HabitDef[];
  loading: boolean;
  error: unknown;
  refetch(): void;
}

/** Habits (and their items) active on `date` (BR-07), in sort order. `null` date waits. */
export function useActiveHabits(date: string | null, frequency: Frequency): UseActiveHabits {
  const [state, setState] = useState<{ key: string; habits: HabitDef[]; error: unknown } | null>(
    null,
  );
  const [nonce, setNonce] = useState(0);
  const key = date ? `${frequency}:${date}` : null;

  useEffect(() => {
    if (!date || !key) return;
    let live = true;
    fetchActiveHabits(supabase, date, frequency).then(
      (habits) =>
        live &&
        setState({
          key,
          habits: [...habits].sort((a, b) => a.sortOrder - b.sortOrder),
          error: null,
        }),
      (error: unknown) => live && setState({ key, habits: [], error }),
    );
    return () => {
      live = false;
    };
  }, [date, frequency, key, nonce]);

  const refetch = useCallback(() => {
    setState(null);
    setNonce((n) => n + 1);
  }, []);

  const current = state && state.key === key ? state : null;
  return {
    habits: current?.habits ?? [],
    loading: current === null,
    error: current?.error ?? null,
    refetch,
  };
}
