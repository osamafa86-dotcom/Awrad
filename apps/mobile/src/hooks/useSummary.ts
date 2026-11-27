import { addDays, todayIn } from '@awrad/domain';
import { getStudentSummary, type StudentSummary } from '@awrad/supabase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { useAppSession } from './SessionProvider';
import { useAsyncData } from './useAsyncData';
import { useSettings } from './useSettings';

export type SummaryRange = '30d' | '90d' | 'all';

export const SUMMARY_RANGE_KEY = 'pref:summary:range';
export const DEFAULT_RANGE: SummaryRange = '30d';

/** BR-03 window: today and the N-1 days before it (30d → today-29, 90d → today-89); `all` is unbounded. */
export function rangeBounds(range: SummaryRange, today: string): { from?: string; to?: string } {
  if (range === 'all') return {};
  return { from: addDays(today, range === '30d' ? -29 : -89), to: today };
}

export interface UseSummary {
  data: StudentSummary | null;
  loading: boolean;
  error: boolean;
  refetch(): Promise<void>;
}

/** F-30/F-32/F-33: the student's own summary for the chosen range, windowed to the student's "today" (BR-08). */
export function useSummary(range: SummaryRange, enabled = true): UseSummary {
  const settings = useSettings();
  const { session } = useAppSession();
  const uid = session?.user.id ?? null;
  const today = settings.loading ? null : todayIn(settings.timezone);
  const key = enabled && uid && today ? `${uid}|${range}|${today}` : null;
  return useAsyncData(key, () => {
    const { from, to } = rangeBounds(range, today ?? '');
    return getStudentSummary(supabase, { from, to });
  });
}

function isRange(v: string | null): v is SummaryRange {
  return v === '30d' || v === '90d' || v === 'all';
}

/** The last chosen range, remembered per device (a convenience only; storage may be unavailable). */
export function useSummaryRange(): { range: SummaryRange; loaded: boolean; setRange(r: SummaryRange): void } {
  const [range, setRangeState] = useState<SummaryRange>(DEFAULT_RANGE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SUMMARY_RANGE_KEY).then(
      (v) => {
        if (!live) return;
        if (isRange(v)) setRangeState(v);
        setLoaded(true);
      },
      () => live && setLoaded(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const setRange = useCallback((r: SummaryRange) => {
    setRangeState(r);
    AsyncStorage.setItem(SUMMARY_RANGE_KEY, r).catch(() => {});
  }, []);

  return { range, loaded, setRange };
}
