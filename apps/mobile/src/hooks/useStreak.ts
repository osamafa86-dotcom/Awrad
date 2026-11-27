import { getStudentSummary } from '@awrad/supabase-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';

export interface UseStreak {
  /** Current streak (BR-04) as computed by the server; null until loaded or if it failed. */
  streak: number | null;
  refetch(): Promise<void>;
}

export function useStreak(): UseStreak {
  const [streak, setStreak] = useState<number | null>(null);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const summary = await getStudentSummary(supabase);
      if (mounted.current) setStreak(summary.currentStreak);
    } catch {
      // The chip is informative only; keep the last known value.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refetch();
    return () => {
      mounted.current = false;
    };
  }, [refetch]);

  return { streak, refetch };
}
