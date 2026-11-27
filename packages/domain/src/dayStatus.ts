import type { EntryInput, Frequency, HabitDef } from './types';

export function isActiveOn(def: { activeFrom: string; activeTo: string | null }, date: string): boolean {
  return def.activeFrom <= date && (def.activeTo === null || date <= def.activeTo);
}

export function activeHabitsOn(habits: HabitDef[], date: string, frequency: Frequency): HabitDef[] {
  return habits.filter((h) => h.frequency === frequency && isActiveOn(h, date));
}

/** BR-01/BR-02: weights, completion percentage and state of one daily log. */
export function computeDayStatus(
  habits: HabitDef[],
  entries: EntryInput[],
  date: string,
  thresholdPct: number,
): { state: 'achieved' | 'failed' | 'neutral'; completionPct: number | null } {
  const byHabit = new Map(entries.map((e) => [e.habitId, e]));
  let required = 0;
  let achieved = 0;
  for (const habit of activeHabitsOn(habits, date, 'daily')) {
    const entry = byHabit.get(habit.id);
    if (!entry || entry.status === 'not_required') continue;
    required += 1;
    if (habit.kind === 'checklist') {
      const active = habit.items.filter((i) => isActiveOn(i, date));
      if (active.length === 0) {
        achieved += 1;
      } else {
        const checked = new Set(entry.checkedItemIds ?? []);
        achieved += active.filter((i) => checked.has(i.id)).length / active.length;
      }
    } else if (entry.status === 'done') {
      achieved += 1;
    }
  }
  if (required === 0) return { state: 'neutral', completionPct: null };
  const completionPct = Math.round((achieved / required) * 100);
  return { state: completionPct >= thresholdPct ? 'achieved' : 'failed', completionPct };
}
