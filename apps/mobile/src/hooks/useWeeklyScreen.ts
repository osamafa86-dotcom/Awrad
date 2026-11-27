import type { EntryInput, HabitDef, SaveLogInput } from '@awrad/domain';
import { useCallback, useEffect, useState } from 'react';

import {
  entriesFromDraft,
  entriesFromLog,
  firstUnspecified,
  markAllDone as allDone,
  remainingCount,
  toEntryInputs,
  type EntryMap,
  type HabitEntryState,
} from '../lib/today';
import type { BannerState } from './useTodayScreen';
import { useActiveHabits } from './useActiveHabits';
import { useDraft } from './useDraft';
import { useLog } from './useLog';
import { useSaveLog, type SaveError } from './useSaveLog';
import { useSettings, type UseSettings } from './useSettings';
import { useWeek, type Week } from './useWeek';

// The habit list the payload was built from is stale: reload it (keeping the student's edits).
const STALE_HABIT_ERRORS: ReadonlySet<SaveError> = new Set([
  'INACTIVE_HABIT',
  'INVALID_ITEM',
  'FREQUENCY_MISMATCH',
  'MISSING_ENTRY',
]);

interface WeekDraft {
  entries: EntryMap;
  reviewText: string;
  supportRequestText: string;
}

/**
 * The banner state of a saved week: every required habit done → achieved, none required → neutral.
 * (`computeDayStatus` is daily-only, and the streak threshold is a daily setting.)
 */
function weekState(
  habits: HabitDef[],
  entries: EntryInput[],
): { kind: 'achieved' | 'failed' | 'neutral'; completionPct: number | null; remaining: number } {
  const remaining = remainingCount(habits, entries);
  const required = entries.filter((e) => e.status !== 'not_required').length;
  if (required === 0) return { kind: 'neutral', completionPct: null, remaining };
  return { kind: remaining === 0 ? 'achieved' : 'failed', completionPct: null, remaining };
}

/** F-22 / BR-14: texts trimmed and left out when empty. */
export function buildWeeklySaveInput(
  habits: HabitDef[],
  entries: EntryMap,
  weekStart: string,
  reviewText: string,
  supportRequestText: string,
): SaveLogInput {
  const review = reviewText.trim();
  const support = supportRequestText.trim();
  return {
    period: 'weekly',
    periodStart: weekStart,
    entries: toEntryInputs(habits, entries),
    ...(review ? { reviewText: review } : {}),
    ...(support ? { supportRequestText: support } : {}),
  };
}

export interface WeeklyScreenState {
  settings: UseSettings;
  /** The week shown; null until the student's "today" is known. */
  week: Week | null;
  canPrev: boolean;
  canNext: boolean;
  goPrev(): void;
  goNext(): void;
  /** F-24: the previous week is unlogged and still within grace (shown on the current week only). */
  showLastWeekBanner: boolean;
  habits: HabitDef[];
  loading: boolean;
  loadError: boolean;
  retryLoad(): void;
  entries: EntryMap;
  reviewText: string;
  supportRequestText: string;
  setReviewText(text: string): void;
  setSupportRequestText(text: string): void;
  setEntry(habitId: string, entry: HabitEntryState): void;
  markAllDone(): void;
  canSave: boolean;
  missingHabit: HabitDef | null;
  saving: boolean;
  save(): Promise<void>;
  banner: BannerState | null;
}

/** State and actions of the weekly review screen (F-20…F-24); mirrors useTodayScreen, keyed by week. */
export function useWeeklyScreen(): WeeklyScreenState {
  const settings = useSettings();
  const currentWeek = useWeek(0);
  const previousWeek = useWeek(-1);
  const [offset, setOffset] = useState<0 | -1>(0);
  const week = offset === 0 ? currentWeek : previousWeek;
  const weekStart = currentWeek.loading ? null : week.weekStart;

  const habitsQ = useActiveHabits(weekStart, 'weekly');
  const logQ = useLog('weekly', weekStart);
  const draftQ = useDraft<WeekDraft>(weekStart ? `draft:weekly:${weekStart}` : null);
  const lastWeekQ = useLog(
    'weekly',
    !currentWeek.loading && previousWeek.canEdit ? previousWeek.weekStart : null,
  );
  const saver = useSaveLog();

  // Local edits for the week shown; hydrated once per week from the server log, else the draft.
  const [local, setLocal] = useState<({ weekStart: string; dirty: boolean } & WeekDraft) | null>(
    null,
  );
  const [banner, setBanner] = useState<{ weekStart: string; state: BannerState } | null>(null);

  const ready = weekStart !== null && !habitsQ.loading && !logQ.loading && draftQ.loaded;
  useEffect(() => {
    if (!ready || !weekStart || local?.weekStart === weekStart) return;
    // A saved server log always wins; the draft is only for a week with no log yet.
    const next: WeekDraft = logQ.log
      ? {
          entries: entriesFromLog(habitsQ.habits, logQ.entries),
          reviewText: logQ.log.review_text ?? '',
          supportRequestText: logQ.log.support_request_text ?? '',
        }
      : {
          entries: entriesFromDraft(habitsQ.habits, draftQ.draft),
          reviewText: draftQ.draft?.reviewText ?? '',
          supportRequestText: draftQ.draft?.supportRequestText ?? '',
        };
    setLocal({ weekStart, dirty: false, ...next });
  }, [ready, weekStart, local?.weekStart, logQ.log, logQ.entries, habitsQ.habits, draftQ.draft]);

  // `setDraft` is keyed by `weekStart`: only write when `local` belongs to that same week, otherwise
  // navigating would store one week's edits under the other week's key.
  const { setDraft } = draftQ;
  useEffect(() => {
    if (local?.dirty && local.weekStart === weekStart) {
      setDraft({
        entries: local.entries,
        reviewText: local.reviewText,
        supportRequestText: local.supportRequestText,
      });
    }
  }, [local, weekStart, setDraft]);

  const current = local && local.weekStart === weekStart ? local : null;
  const entries = current?.entries ?? {};
  const reviewText = current?.reviewText ?? '';
  const supportRequestText = current?.supportRequestText ?? '';
  const habits = habitsQ.habits;

  const update = useCallback(
    (fn: (d: WeekDraft) => WeekDraft) => {
      if (!weekStart) return;
      setLocal((l) =>
        l && l.weekStart === weekStart
          ? {
              weekStart,
              dirty: true,
              ...fn({
                entries: l.entries,
                reviewText: l.reviewText,
                supportRequestText: l.supportRequestText,
              }),
            }
          : l,
      );
      // A "saved" banner no longer describes the edited week; an error stays until the next attempt.
      setBanner((b) => (b && b.state.kind !== 'error' ? null : b));
    },
    [weekStart],
  );

  const setEntry = useCallback(
    (habitId: string, entry: HabitEntryState) =>
      update((d) => ({ ...d, entries: { ...d.entries, [habitId]: entry } })),
    [update],
  );
  const setReviewText = useCallback((t: string) => update((d) => ({ ...d, reviewText: t })), [update]);
  const setSupportRequestText = useCallback(
    (t: string) => update((d) => ({ ...d, supportRequestText: t })),
    [update],
  );
  const markAllDone = useCallback(
    () => update((d) => ({ ...d, entries: allDone(habits) })),
    [update, habits],
  );

  const missingHabit = firstUnspecified(habits, entries);
  const loading = !ready || current === null;
  const canSave = !loading && habits.length > 0 && missingHabit === null;

  const save = useCallback(async () => {
    if (!canSave || !weekStart || saver.saving) return;
    const input = buildWeeklySaveInput(habits, entries, weekStart, reviewText, supportRequestText);
    const error = await saver.save(input);
    if (error) {
      setBanner({
        weekStart,
        state: { kind: 'error', code: error, draftKept: current?.dirty === true },
      });
      if (STALE_HABIT_ERRORS.has(error)) habitsQ.refetch();
      return;
    }
    setBanner({ weekStart, state: weekState(habits, input.entries) });
    await draftQ.clearDraft();
    setLocal((l) => {
      if (!l || l.weekStart !== weekStart) return l;
      return l.entries === entries &&
        l.reviewText === reviewText &&
        l.supportRequestText === supportRequestText
        ? { ...l, dirty: false }
        : { ...l };
    });
    void logQ.refetch();
    void lastWeekQ.refetch();
  }, [
    canSave,
    weekStart,
    saver,
    habits,
    entries,
    reviewText,
    supportRequestText,
    current?.dirty,
    draftQ,
    logQ,
    lastWeekQ,
    habitsQ,
  ]);

  const canPrev = offset === 0 && !currentWeek.loading && previousWeek.canEdit;
  const canNext = offset === -1;
  const goPrev = useCallback(() => {
    if (canPrev) setOffset(-1);
  }, [canPrev]);
  const goNext = useCallback(() => setOffset(0), []);

  const showLastWeekBanner =
    offset === 0 && previousWeek.canEdit && !lastWeekQ.loading && !lastWeekQ.error && !lastWeekQ.log;

  const shownBanner = banner && banner.weekStart === weekStart ? banner.state : null;

  return {
    settings,
    week: currentWeek.loading ? null : week,
    canPrev,
    canNext,
    goPrev,
    goNext,
    showLastWeekBanner,
    habits,
    loading,
    loadError: Boolean(habitsQ.error || logQ.error),
    retryLoad: () => {
      setLocal(null);
      habitsQ.refetch();
      void logQ.refetch();
    },
    entries,
    reviewText,
    supportRequestText,
    setReviewText,
    setSupportRequestText,
    setEntry,
    markAllDone,
    canSave,
    missingHabit,
    saving: saver.saving,
    save,
    banner: shownBanner,
  };
}
