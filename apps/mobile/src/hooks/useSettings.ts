import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { useAppSession } from './SessionProvider';

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AppSettings {
  backfillDays: number;
  thresholdPct: number;
  hijriAdjustment: number;
  weekStartsOn: WeekStart;
  /** The student's zone (BR-08): profile, then group, then Asia/Riyadh. */
  timezone: string;
}

export interface UseSettings extends AppSettings {
  loading: boolean;
}

const FALLBACK_TIMEZONE = 'Asia/Riyadh';
// The migration defaults (0001_core.sql), used only if the settings cannot be read; the server enforces anyway.
const DEFAULTS: Omit<AppSettings, 'timezone'> = {
  backfillDays: 2,
  thresholdPct: 100,
  hijriAdjustment: 0,
  weekStartsOn: 0,
};

interface Loaded {
  shared: Omit<AppSettings, 'timezone' | 'weekStartsOn'>;
  group: { timezone: string | null; weekStartsOn: WeekStart } | null;
}

// One fetch per group, shared by every screen (module-level store).
const cache = new Map<string, Promise<Loaded>>();

/** Test hook: forget cached settings (e.g. between test cases or after sign-out). */
export function resetSettingsCache(): void {
  cache.clear();
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function load(groupId: string | null): Promise<Loaded> {
  const settingsReq = supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['backfill_days', 'streak_threshold_pct', 'hijri_adjustment_days']);
  const groupReq = groupId
    ? supabase.from('groups').select('timezone, week_starts_on').eq('id', groupId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [settings, group] = await Promise.all([settingsReq, groupReq]);
  const byKey = new Map((settings.data ?? []).map((r) => [r.key, r.value as unknown]));
  return {
    shared: {
      backfillDays: num(byKey.get('backfill_days'), DEFAULTS.backfillDays),
      thresholdPct: num(byKey.get('streak_threshold_pct'), DEFAULTS.thresholdPct),
      hijriAdjustment: num(byKey.get('hijri_adjustment_days'), DEFAULTS.hijriAdjustment),
    },
    group: group.data
      ? {
          timezone: group.data.timezone,
          weekStartsOn: num(group.data.week_starts_on, 0) as WeekStart,
        }
      : null,
  };
}

function loadCached(groupId: string | null): Promise<Loaded> {
  const key = groupId ?? '';
  let p = cache.get(key);
  if (!p) {
    p = load(groupId).catch((e: unknown) => {
      cache.delete(key); // let the next screen retry
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

/** `app_settings` + the student's group (BR-05, BR-08, BR-09), fetched once and shared. */
export function useSettings(): UseSettings {
  const { profile } = useAppSession();
  const groupId = profile?.group_id ?? null;
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded | null } | null>(null);

  useEffect(() => {
    let live = true;
    const key = groupId ?? '';
    loadCached(groupId).then(
      (value) => live && setLoaded({ key, value }),
      () => live && setLoaded({ key, value: null }),
    );
    return () => {
      live = false;
    };
  }, [groupId]);

  const current = loaded && loaded.key === (groupId ?? '') ? loaded : null;
  const value = current?.value;
  return {
    ...DEFAULTS,
    ...value?.shared,
    weekStartsOn: value?.group?.weekStartsOn ?? DEFAULTS.weekStartsOn,
    timezone: profile?.timezone ?? value?.group?.timezone ?? FALLBACK_TIMEZONE,
    loading: current === null,
  };
}
