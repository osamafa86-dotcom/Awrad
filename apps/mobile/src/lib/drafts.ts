import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Unsaved edits live on the device until a successful save (useDraft). They are keyed by user (final review mobile
 * I3): on a shared phone one student's statuses, note or support request must never surface for the next one (D14).
 */
export function draftKey(userId: string, period: 'daily' | 'weekly', date: string): string {
  return `draft:${userId}:${period}:${date}`;
}

/** Drafts written before the user was part of the key; nobody can tell whose they are. */
const UNATTRIBUTED = /^draft:(?:daily|weekly):\d{4}-\d{2}-\d{2}$/;

/** Removes every draft of this user (sign-out) and the unattributable old ones. Never throws. */
export async function clearDrafts(userId: string | null): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const doomed = keys.filter(
      (key) => UNATTRIBUTED.test(key) || (userId !== null && key.startsWith(`draft:${userId}:`)),
    );
    if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
  } catch {
    // Best effort: an unreadable store has nothing we could remove.
  }
}

/**
 * Final review mobile I4: for a day (or week) that already has a saved log, an unsaved edit kept on the device wins
 * only if it was made after the log was last saved. A draft or log without a readable time never wins.
 */
export function isNewerDraft(draftSavedAt: string | undefined, logUpdatedAt: string | null | undefined): boolean {
  if (!draftSavedAt || !logUpdatedAt) return false;
  const draft = Date.parse(draftSavedAt);
  const log = Date.parse(logUpdatedAt);
  return Number.isFinite(draft) && Number.isFinite(log) && draft > log;
}
