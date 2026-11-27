import { useEffect } from 'react';

import { ensurePushOnSignIn } from '../lib/notifications';

/** The profile fields that decide whether this device should receive reminders. */
export interface ReminderProfile {
  id: string;
  reminder_time: string | null;
  weekly_reminder: boolean;
}

/**
 * Final review mobile I2: reminders are on by default (the invitation sets reminder_time; weekly is on), yet nothing
 * arrives on a device without a push token. Once the signed-in tabs show, register this device for a student whose
 * reminders are on — asking for permission once per user on this device, silently re-registering when it is granted.
 */
export function usePushOnSignIn(profile: ReminderProfile | null): void {
  const uid = profile?.id ?? null;
  const wants = profile !== null && (profile.reminder_time !== null || profile.weekly_reminder);
  useEffect(() => {
    if (!uid) return;
    void ensurePushOnSignIn(uid, wants).catch(() => undefined);
  }, [uid, wants]);
}
