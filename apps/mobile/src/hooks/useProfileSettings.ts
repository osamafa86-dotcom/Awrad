import { useCallback, useState } from 'react';

import { supabase } from '../lib/supabase';
import { useAppSession } from './SessionProvider';

/** The only profile columns a student may change (RLS + trigger; anything else raises FORBIDDEN). */
export interface ProfileSettingsPatch {
  reminder_time?: string | null;
  weekly_reminder?: boolean;
  timezone?: string | null;
}

export interface UseProfileSettings {
  reminderTime: string | null;
  weeklyReminder: boolean;
  timezone: string | null;
  loading: boolean;
  error: boolean;
  /** Optimistic write; resolves false (and rolls back) on failure. */
  update(partial: ProfileSettingsPatch): Promise<boolean>;
}

/** Postgres returns `HH:MM:SS`; the UI and the writes use `HH:MM`. */
const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

/** Reminder / timezone preferences of the signed-in student (F-50). */
export function useProfileSettings(): UseProfileSettings {
  const { session, profile, refreshProfile } = useAppSession();
  const [local, setLocal] = useState<ProfileSettingsPatch>({});
  const [error, setError] = useState(false);
  const uid = session?.user.id ?? profile?.id ?? null;

  const update = useCallback(
    async (partial: ProfileSettingsPatch): Promise<boolean> => {
      if (!uid) return false;
      // Only the three allowed columns ever leave this hook.
      const patch: ProfileSettingsPatch = {};
      if ('reminder_time' in partial) patch.reminder_time = partial.reminder_time ?? null;
      if ('weekly_reminder' in partial) patch.weekly_reminder = partial.weekly_reminder;
      if ('timezone' in partial) patch.timezone = partial.timezone ?? null;

      setError(false);
      setLocal((l) => ({ ...l, ...patch }));
      let failed = false;
      try {
        const { error: err } = await supabase.from('profiles').update(patch).eq('id', uid);
        failed = err !== null && err !== undefined;
      } catch {
        failed = true;
      }
      if (failed) {
        setLocal((l) => {
          const next = { ...l };
          for (const k of Object.keys(patch) as Array<keyof ProfileSettingsPatch>) delete next[k];
          return next;
        });
        setError(true);
        return false;
      }
      await refreshProfile(); // useSettings and the other screens read the new timezone from the profile
      return true;
    },
    [uid, refreshProfile],
  );

  const pick = <K extends keyof ProfileSettingsPatch>(key: K, fromProfile: ProfileSettingsPatch[K]) =>
    key in local ? (local[key] as ProfileSettingsPatch[K]) : fromProfile;

  return {
    reminderTime: hhmm(pick('reminder_time', profile?.reminder_time ?? null)),
    weeklyReminder: pick('weekly_reminder', profile?.weekly_reminder ?? true) ?? true,
    timezone: pick('timezone', profile?.timezone ?? null) ?? null,
    loading: profile === null,
    error,
    update,
  };
}
