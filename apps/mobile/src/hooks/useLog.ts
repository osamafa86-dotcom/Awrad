import type { EntryInput, EntryStatus, Frequency } from '@awrad/domain';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { useAppSession } from './SessionProvider';

export interface LogRow {
  id: string;
  period: Frequency;
  period_start: string;
  note: string | null;
}

interface NestedLog extends LogRow {
  log_entries: Array<{
    habit_id: string;
    status: EntryStatus;
    log_entry_items: Array<{ habit_item_id: string }> | null;
  }> | null;
}

export interface UseLog {
  log: LogRow | null;
  entries: EntryInput[];
  loading: boolean;
  error: unknown;
  refetch(): Promise<void>;
}

interface Loaded {
  key: string;
  log: LogRow | null;
  entries: EntryInput[];
  error: unknown;
}

/** The signed-in student's log for one period, with entries and checked items, in one nested select. */
export function useLog(period: Frequency, periodStart: string | null): UseLog {
  const { profile } = useAppSession();
  const uid = profile?.id ?? null;
  const key = uid && periodStart ? `${uid}:${period}:${periodStart}` : null;
  const [state, setState] = useState<Loaded | null>(null);

  const fetchLog = useCallback(async (): Promise<Loaded | null> => {
    if (!uid || !periodStart || !key) return null;
    try {
      const { data, error } = await supabase
        .from('logs')
        .select('*, log_entries(*, log_entry_items(*))')
        .eq('user_id', uid)
        .eq('period', period)
        .eq('period_start', periodStart)
        .maybeSingle();
      if (error) return { key, log: null, entries: [], error };
      // why: a string-literal nested select is not inferred as an embed by the generated typings.
      const row = data as unknown as NestedLog | null;
      if (!row) return { key, log: null, entries: [], error: null };
      const entries: EntryInput[] = (row.log_entries ?? []).map((e) => ({
        habitId: e.habit_id,
        status: e.status,
        checkedItemIds: (e.log_entry_items ?? []).map((i) => i.habit_item_id),
      }));
      const log: LogRow = {
        id: row.id,
        period: row.period,
        period_start: row.period_start,
        note: row.note,
      };
      return { key, log, entries, error: null };
    } catch (error) {
      return { key, log: null, entries: [], error };
    }
  }, [uid, period, periodStart, key]);

  useEffect(() => {
    let live = true;
    void fetchLog().then((loaded) => {
      if (live && loaded) setState(loaded);
    });
    return () => {
      live = false;
    };
  }, [fetchLog]);

  const refetch = useCallback(async () => {
    const loaded = await fetchLog();
    if (loaded) setState(loaded);
  }, [fetchLog]);

  const current = state && state.key === key ? state : null;
  return {
    log: current?.log ?? null,
    entries: current?.entries ?? [],
    loading: current === null,
    error: current?.error ?? null,
    refetch,
  };
}
