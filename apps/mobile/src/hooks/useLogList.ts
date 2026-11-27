import { addDays, isWithinBackfill, toHijri, todayIn, type DayState } from '@awrad/domain';
import { getCalendar } from '@awrad/supabase-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatDayMonth, formatHijriSpan } from '../lib/format';
import { supabase } from '../lib/supabase';
import { ar } from '../messages/ar';
import { useAppSession } from './SessionProvider';
import { useAsyncData } from './useAsyncData';
import { useSettings } from './useSettings';

export const LOG_PAGE_SIZE = 20;
/** `get_calendar` accepts at most 62 days per call. */
const MAX_CHUNK_DAYS = 62;

export interface DailyLogRow {
  period: 'daily';
  date: string;
  hijri: string;
  gregorian: string;
  /** From `get_calendar`; `unknown` when the state could not be read. */
  state: DayState | 'unknown';
  completionPct: number | null;
  /** BR-05: within the backfill window. */
  editable: boolean;
  isToday: boolean;
}

export interface WeeklyLogRow {
  period: 'weekly';
  weekStart: string;
  weekEnd: string;
  /** «الأسبوع من … إلى …» */
  label: string;
  /** The Hijri month(s) the week covers. */
  hijriRange: string;
  /** BR-06: today <= weekEnd + weeklyGraceDays. */
  editable: boolean;
}

export type LogListRow = DailyLogRow | WeeklyLogRow;
export type LogListRows<P extends 'daily' | 'weekly'> = P extends 'daily' ? DailyLogRow[] : WeeklyLogRow[];

export interface UseLogList<P extends 'daily' | 'weekly'> {
  rows: LogListRows<P>;
  /** True until the first page is shown (not while a further page loads). */
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  hasMore: boolean;
  loadMore(): void;
  /** Back to the first page, fresh from the server. */
  refetch(): Promise<void>;
}

interface RawLog {
  period_start: string;
}
interface PageResult {
  raw: RawLog[];
  states: Map<string, { state: DayState; completionPct: number | null }>;
}
interface Accumulated {
  scope: string;
  pages: PageResult[];
  hasMore: boolean;
}

/** Windows of at most 62 days covering `[from, to]`. */
export function calendarChunks(from: string, to: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let start = from; start <= to; ) {
    const end = addDays(start, MAX_CHUNK_DAYS - 1);
    const chunkEnd = end < to ? end : to;
    out.push([start, chunkEnd]);
    start = addDays(chunkEnd, 1);
  }
  return out;
}

function gregorianLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return ar.today.gregorianDate(d ?? 1, ar.today.gregorianMonths[(m ?? 1) - 1] ?? '', y ?? 0);
}

/**
 * F-40: the student's logs, newest first, 20 per page. Pages accumulate as `loadMore` is called
 * (starting at `page`); daily rows also carry their day state from `get_calendar`, fetched in
 * ≤ 62-day chunks per page and cached by `[from, to]` until the next `refetch`.
 */
export function useLogList<P extends 'daily' | 'weekly'>(period: P, page = 0): UseLogList<P> {
  const settings = useSettings();
  const { session } = useAppSession();
  const uid = session?.user.id ?? null;
  const today = settings.loading ? null : todayIn(settings.timezone);
  const scope = uid && today ? `${uid}|${period}|${today}` : null;

  const [last, setLast] = useState(page);
  const [scopeOfLast, setScopeOfLast] = useState<string | null>(null);
  const chunkCache = useRef(new Map<string, ReturnType<typeof getCalendar>>());
  const [acc, setAcc] = useState<Accumulated | null>(null);

  // A different student/period/day starts over.
  useEffect(() => {
    if (scope !== scopeOfLast) {
      setScopeOfLast(scope);
      setLast(page);
      setAcc(null);
      chunkCache.current.clear();
    }
  }, [scope, scopeOfLast, page]);

  const key = scope && scope === scopeOfLast ? `${scope}|${last}` : null;
  const q = useAsyncData<PageResult>(key, async () => {
    const from = last * LOG_PAGE_SIZE;
    const { data, error } = await supabase
      .from('logs')
      .select('id, period, period_start, note, updated_at')
      .eq('user_id', uid ?? '')
      .eq('period', period)
      .order('period_start', { ascending: false })
      .range(from, from + LOG_PAGE_SIZE - 1);
    if (error) throw error;
    const raw = (data ?? []) as RawLog[];
    const states: PageResult['states'] = new Map();
    if (period === 'daily' && raw.length > 0) {
      const dates = raw.map((r) => r.period_start).sort();
      const chunks = calendarChunks(dates[0] ?? '', dates[dates.length - 1] ?? '');
      try {
        const results = await Promise.all(
          chunks.map(([a, b]) => {
            const cacheKey = `${a}|${b}`;
            let hit = chunkCache.current.get(cacheKey);
            if (!hit) {
              hit = getCalendar(supabase as never, uid ?? '', a, b);
              chunkCache.current.set(cacheKey, hit);
              hit.catch(() => chunkCache.current.delete(cacheKey));
            }
            return hit;
          }),
        );
        for (const r of results.flat()) states.set(r.date, r);
      } catch {
        // The list is still useful without day states: rows fall back to `unknown`.
      }
    }
    return { raw, states };
  });

  // Fold each arrived page into the accumulated list (once per page, in order).
  const { data } = q;
  useEffect(() => {
    if (!data || !key || !scope) return;
    setAcc((a) => {
      const base = a && a.scope === scope ? a : { scope, pages: [], hasMore: false };
      const pages = [...base.pages];
      pages[last - page] = data;
      return { scope, pages, hasMore: data.raw.length === LOG_PAGE_SIZE };
    });
  }, [data, key, scope, last, page]);

  const current = acc && acc.scope === scope ? acc : null;
  const loadedPages = current?.pages.filter(Boolean) ?? [];

  const rows = loadedPages.flatMap((p) =>
    p.raw.map((r): LogListRow => {
      const date = r.period_start;
      if (period === 'daily') {
        const s = p.states.get(date);
        return {
          period: 'daily',
          date,
          hijri: toHijri(date, settings.hijriAdjustment).formatted,
          gregorian: gregorianLabel(date),
          state: s?.state ?? 'unknown',
          completionPct: s?.completionPct ?? null,
          editable: today !== null && isWithinBackfill(date, today, settings.backfillDays),
          isToday: date === today,
        };
      }
      const weekEnd = addDays(date, 6);
      return {
        period: 'weekly',
        weekStart: date,
        weekEnd,
        label: ar.weekly.title(formatDayMonth(date), formatDayMonth(weekEnd)),
        hijriRange: formatHijriSpan(date, weekEnd, settings.hijriAdjustment),
        editable: today !== null && today <= addDays(weekEnd, settings.weeklyGraceDays),
      };
    }),
  ) as LogListRows<P>;

  // The page in flight is `last`; its result is folded in one render later.
  const lastFolded = current ? current.pages[last - page] !== undefined : false;
  const busy = q.loading || (q.data !== null && !lastFolded);
  const firstLoaded = loadedPages.length > 0;
  const hasMore = current?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!hasMore || busy || q.error) return;
    setLast((l) => l + 1);
  }, [hasMore, busy, q.error]);

  const { refetch: refetchPage } = q;
  const refetch = useCallback(async () => {
    chunkCache.current.clear();
    setAcc(null);
    if (last === page) await refetchPage();
    else setLast(page);
  }, [last, page, refetchPage]);

  return {
    rows,
    loading: !firstLoaded && !q.error,
    loadingMore: firstLoaded && busy,
    error: q.error,
    hasMore,
    loadMore,
    refetch,
  };
}
