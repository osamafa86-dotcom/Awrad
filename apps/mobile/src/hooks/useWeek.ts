import { addDays, isWithinWeeklyGrace, todayIn, weekStartFor } from '@awrad/domain';

import { useSettings } from './useSettings';

export interface Week {
  weekStart: string;
  weekEnd: string;
  /** BR-06: the current week, or a past one until `weeklyGraceDays` after it ends. */
  canEdit: boolean;
  isCurrent: boolean;
}

export interface UseWeek extends Week {
  /** The student's today, null while settings load (the week is then not yet known). */
  today: string | null;
  loading: boolean;
}

/** The current week (`0`) or the previous one (`-1`) in the student's zone and week-start setting. */
export function useWeek(offset: 0 | -1): UseWeek {
  const settings = useSettings();
  const today = todayIn(settings.timezone);
  const weekStart = addDays(weekStartFor(today, settings.weekStartsOn), 7 * offset);
  const weekEnd = addDays(weekStart, 6);
  return {
    weekStart,
    weekEnd,
    canEdit: isWithinWeeklyGrace(weekEnd, today, settings.weeklyGraceDays),
    isCurrent: offset === 0,
    today: settings.loading ? null : today,
    loading: settings.loading,
  };
}
