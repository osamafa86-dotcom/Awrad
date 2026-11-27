import { addDays, todayIn, type DayState } from '@awrad/domain';
import { getCalendar } from '@awrad/supabase-client';
import { useMemo } from 'react';

import { supabase } from '../lib/supabase';
import { useAppSession } from './SessionProvider';
import { useAsyncData } from './useAsyncData';
import { monthBounds } from '../lib/month';
import { useSettings } from './useSettings';

export interface CalendarDay {
  date: string;
  state: DayState;
  completionPct: number | null;
  isToday: boolean;
  /** After the student's today: never logged, never rendered as «missing». */
  isFuture: boolean;
}

export interface UseCalendar {
  /** Every day of the month, in order; empty until loaded. */
  days: CalendarDay[];
  loading: boolean;
  error: boolean;
  refetch(): Promise<void>;
}

/** F-31: the student's day states for a Gregorian month. */
export function useCalendar(month: string): UseCalendar {
  const settings = useSettings();
  const { session } = useAppSession();
  const uid = session?.user.id ?? null;
  const today = settings.loading ? null : todayIn(settings.timezone);
  const { from, to } = monthBounds(month);
  const key = uid && today ? `${uid}|${month}|${today}` : null;
  const q = useAsyncData(key, () => getCalendar(supabase, uid ?? '', from, to));

  const days = useMemo<CalendarDay[]>(() => {
    if (!q.data || !today) return [];
    const byDate = new Map(q.data.map((d) => [d.date, d]));
    const out: CalendarDay[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const row = byDate.get(date);
      const isFuture = date > today;
      out.push({
        date,
        // The server fills days up to today only; a day it did not return is not logged.
        state: row?.state ?? 'missing',
        completionPct: row?.completionPct ?? null,
        isToday: date === today,
        isFuture,
      });
    }
    return out;
  }, [q.data, today, from, to]);

  return { days, loading: q.loading, error: q.error, refetch: q.refetch };
}
