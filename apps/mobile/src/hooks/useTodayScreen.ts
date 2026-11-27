import { addDays, computeDayStatus, isWithinBackfill, type HabitDef } from '@awrad/domain';
import { useCallback, useEffect, useState } from 'react';

import { localToday } from '../lib/clock';
import { draftKey, isNewerDraft } from '../lib/drafts';
import {
  buildSaveInput,
  entriesFromDraft,
  entriesFromLog,
  firstUnspecified,
  markAllDone as allDone,
  remainingCount,
  type DayDraft,
  type EntryMap,
  type HabitEntryState,
  type StoredDraft,
} from '../lib/today';
import { useAppSession } from './SessionProvider';
import { useActiveHabits } from './useActiveHabits';
import { useDraft } from './useDraft';
import { useLog } from './useLog';
import { useSaveLog, type SaveError } from './useSaveLog';

// The habit list the payload was built from is stale: reload it (keeping the student's edits).
const STALE_HABIT_ERRORS: ReadonlySet<SaveError> = new Set([
  'INACTIVE_HABIT',
  'INVALID_ITEM',
  'FREQUENCY_MISMATCH',
  'MISSING_ENTRY',
]);
import { useSettings, type UseSettings } from './useSettings';
import { useStreak } from './useStreak';

export type BannerState =
  | { kind: 'achieved' | 'failed' | 'neutral'; completionPct: number | null; remaining: number }
  /** `draftKept`: unsaved edits are on this device. */
  | { kind: 'error'; code: SaveError; draftKept: boolean };

export interface TodayScreenState {
  settings: UseSettings;
  /** The date shown (`YYYY-MM-DD`), null until the student's "today" is known. */
  date: string | null;
  today: string | null;
  canPrev: boolean;
  canNext: boolean;
  goPrev(): void;
  goNext(): void;
  habits: HabitDef[];
  loading: boolean;
  loadError: boolean;
  retryLoad(): void;
  entries: EntryMap;
  note: string;
  setNote(note: string): void;
  setEntry(habitId: string, entry: HabitEntryState): void;
  markAllDone(): void;
  canSave: boolean;
  /** The first tristate habit still without a status (the disabled-save reason). */
  missingHabit: HabitDef | null;
  saving: boolean;
  save(): Promise<void>;
  banner: BannerState | null;
  /** The edits shown came back from this device's unsaved draft (newer than any saved log): not saved yet. */
  draftRestored: boolean;
  streak: number | null;
}

/**
 * State and actions of the daily log screen (F-10…F-16). `readOnly` (Task 2.6) disables editing,
 * navigation and drafts. `initialDate` defaults to the student's today (BR-08).
 */
export function useTodayScreen({
  initialDate,
  readOnly = false,
}: { initialDate?: string; readOnly?: boolean } = {}): TodayScreenState {
  const settings = useSettings();
  const { profile } = useAppSession();
  const uid = profile?.id ?? null;
  const today = settings.loading ? null : localToday(settings.timezone);
  const [chosen, setChosen] = useState<string | null>(initialDate ?? null);
  const date = chosen ?? today;

  const habitsQ = useActiveHabits(date, 'daily');
  const logQ = useLog('daily', date);
  // Keyed by user (mobile I3): another student's unsaved edits on a shared phone are never read here.
  const draftQ = useDraft<StoredDraft<DayDraft>>(date && uid && !readOnly ? draftKey(uid, 'daily', date) : null);
  const saver = useSaveLog();
  const streakQ = useStreak();

  // Local edits for the date shown, hydrated once per date. `dirty` = not saved yet, i.e. kept as a draft;
  // `restored` = hydrated from such a draft; `savedAt` = when it was last edited.
  const [local, setLocal] = useState<
    ({ date: string; dirty: boolean; restored: boolean; savedAt?: string } & DayDraft) | null
  >(null);
  const [banner, setBanner] = useState<{ date: string; state: BannerState } | null>(null);

  const ready = date !== null && !habitsQ.loading && !logQ.loading && draftQ.loaded;
  useEffect(() => {
    if (!ready || !date || local?.date === date) return;
    // The saved server log wins, unless this device holds an unsaved edit made after the log was last saved
    // (mobile I4: «حفظنا مسوّدتك» must stay true for an edit of an already-saved day).
    const draft = draftQ.draft;
    const fromDraft = draft !== null && (!logQ.log || isNewerDraft(draft.savedAt, logQ.log.updated_at));
    const next: DayDraft = fromDraft
      ? { entries: entriesFromDraft(habitsQ.habits, draft), note: draft.note ?? '' }
      : logQ.log
        ? { entries: entriesFromLog(habitsQ.habits, logQ.entries), note: logQ.log.note ?? '' }
        : { entries: entriesFromDraft(habitsQ.habits, null), note: '' };
    setLocal({ date, dirty: fromDraft, restored: fromDraft, savedAt: fromDraft ? draft.savedAt : undefined, ...next });
  }, [ready, date, local?.date, logQ.log, logQ.entries, habitsQ.habits, draftQ.draft]);

  // Keep edits on the device until a successful save (never in read-only mode: no draft key).
  const { setDraft } = draftQ;
  // `setDraft` is keyed by `date`, so only write when `local` belongs to that same date — otherwise
  // navigating would store one day's edits under the next day's key.
  useEffect(() => {
    if (local?.dirty && local.date === date) {
      setDraft({ entries: local.entries, note: local.note, savedAt: local.savedAt });
    }
  }, [local, date, setDraft]);

  const current = local && local.date === date ? local : null;
  const entries = current?.entries ?? {};
  const note = current?.note ?? '';
  const habits = habitsQ.habits;

  const update = useCallback(
    (fn: (d: DayDraft) => DayDraft) => {
      if (readOnly || !date) return;
      // Functional update so quick successive taps never drop one.
      setLocal((l) =>
        l && l.date === date
          ? {
              date,
              dirty: true,
              restored: l.restored,
              savedAt: new Date().toISOString(),
              ...fn({ entries: l.entries, note: l.note }),
            }
          : l,
      );
      // A "saved" banner no longer describes the edited day; an error stays until the next attempt.
      setBanner((b) => (b && b.state.kind !== 'error' ? null : b));
    },
    [readOnly, date],
  );

  const setEntry = useCallback(
    (habitId: string, entry: HabitEntryState) =>
      update((d) => ({ ...d, entries: { ...d.entries, [habitId]: entry } })),
    [update],
  );
  const setNote = useCallback((n: string) => update((d) => ({ ...d, note: n })), [update]);
  const markAllDone = useCallback(
    () => update((d) => ({ ...d, entries: allDone(habits) })),
    [update, habits],
  );

  const missingHabit = firstUnspecified(habits, entries);
  const loading = !ready || current === null;
  const canSave = !readOnly && !loading && habits.length > 0 && missingHabit === null;

  const save = useCallback(async () => {
    if (!canSave || !date || saver.saving) return;
    const input = buildSaveInput(habits, entries, date, note);
    const error = await saver.save(input);
    if (error) {
      // The last code stays in the banner until a new result arrives; the draft stays on the device.
      setBanner({
        date,
        state: { kind: 'error', code: error, draftKept: current?.dirty === true },
      });
      // Removed habits then drop out of the payload; new ones show as unspecified.
      if (STALE_HABIT_ERRORS.has(error)) habitsQ.refetch();
      return;
    }
    // F-15: the day's state right away, computed locally (BR-01/BR-02).
    const status = computeDayStatus(habits, input.entries, date, settings.thresholdPct);
    setBanner({
      date,
      state: {
        kind: status.state,
        completionPct: status.completionPct,
        remaining: remainingCount(habits, input.entries),
      },
    });
    await draftQ.clearDraft();
    // Saved state is clean; edits made while saving are written back as a draft (new object → effect).
    setLocal((l) => {
      if (!l || l.date !== date) return l;
      return l.entries === entries && l.note === note ? { ...l, dirty: false, restored: false } : { ...l };
    });
    void logQ.refetch();
    void streakQ.refetch();
  }, [
    canSave,
    date,
    saver,
    habits,
    entries,
    note,
    current?.dirty,
    settings.thresholdPct,
    draftQ,
    logQ,
    streakQ,
    habitsQ,
  ]);

  const canPrev =
    !readOnly &&
    date !== null &&
    today !== null &&
    isWithinBackfill(addDays(date, -1), today, settings.backfillDays);
  const canNext = !readOnly && date !== null && today !== null && date < today;
  const goPrev = useCallback(() => {
    if (canPrev && date) setChosen(addDays(date, -1));
  }, [canPrev, date]);
  const goNext = useCallback(() => {
    if (canNext && date) setChosen(addDays(date, 1));
  }, [canNext, date]);

  const shownBanner = banner && banner.date === date ? banner.state : null;

  return {
    settings,
    date,
    today,
    canPrev,
    canNext,
    goPrev,
    goNext,
    habits,
    loading,
    loadError: Boolean(habitsQ.error || logQ.error),
    retryLoad: () => {
      setLocal(null); // re-hydrate from the fresh data
      habitsQ.refetch();
      void logQ.refetch();
    },
    entries,
    note,
    setNote,
    setEntry,
    markAllDone,
    canSave,
    missingHabit,
    saving: saver.saving,
    save,
    banner: shownBanner,
    draftRestored: current?.restored === true && current.dirty,
    streak: streakQ.streak,
  };
}
