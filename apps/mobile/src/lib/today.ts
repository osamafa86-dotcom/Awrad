import type { EntryInput, EntryStatus, HabitDef, SaveLogInput } from '@awrad/domain';

/** One habit's in-progress state on the Today screen. */
export interface HabitEntryState {
  /** Tristate habits: unset until the student picks one (no «unspecified» is ever saved, BR-14). */
  status?: EntryStatus;
  /** Checklist habits: checked active items. */
  checkedItemIds: string[];
  /** Checklist habits: the whole list marked «not required today». */
  notRequired?: boolean;
}

export type EntryMap = Record<string, HabitEntryState>;

export interface DayDraft {
  entries: EntryMap;
  note: string;
}

export const EMPTY_ENTRY: HabitEntryState = { checkedItemIds: [] };

export function entryFor(entries: EntryMap, habitId: string): HabitEntryState {
  return entries[habitId] ?? EMPTY_ENTRY;
}

/** A tristate habit is specified once it has a status; a checklist always is (0 checked = not_done). */
export function firstUnspecified(habits: HabitDef[], entries: EntryMap): HabitDef | null {
  return habits.find((h) => h.kind === 'tristate' && !entryFor(entries, h.id).status) ?? null;
}

function allChecked(habit: HabitDef, entry: HabitEntryState): boolean {
  const checked = new Set(entry.checkedItemIds);
  return habit.items.every((i) => checked.has(i.id));
}

/** The status a habit's mark shows; checklists show done / not required, or nothing while in progress. */
export function markStatus(habit: HabitDef, entry: HabitEntryState): EntryStatus | undefined {
  if (habit.kind === 'tristate') return entry.status;
  if (entry.notRequired) return 'not_required';
  return allChecked(habit, entry) ? 'done' : undefined;
}

/** Server entries (or nothing) → screen state. Items no longer active are dropped. */
export function entriesFromLog(habits: HabitDef[], logEntries: EntryInput[]): EntryMap {
  const byHabit = new Map(logEntries.map((e) => [e.habitId, e]));
  const map: EntryMap = {};
  for (const habit of habits) {
    const e = byHabit.get(habit.id);
    if (!e) continue;
    if (habit.kind === 'tristate') {
      map[habit.id] = { status: e.status, checkedItemIds: [] };
    } else {
      const active = new Set(habit.items.map((i) => i.id));
      map[habit.id] = {
        checkedItemIds: (e.checkedItemIds ?? []).filter((id) => active.has(id)),
        notRequired: e.status === 'not_required',
      };
    }
  }
  return map;
}

/** A stored draft → screen state, keeping only today's habits and items (a draft is untrusted input). */
export function entriesFromDraft(habits: HabitDef[], draft: Partial<DayDraft> | null): EntryMap {
  const raw = draft?.entries ?? {};
  const statuses: EntryStatus[] = ['done', 'not_done', 'not_required'];
  const map: EntryMap = {};
  for (const habit of habits) {
    const e = raw[habit.id];
    if (!e) continue;
    if (habit.kind === 'tristate') {
      if (e.status && statuses.includes(e.status))
        map[habit.id] = { status: e.status, checkedItemIds: [] };
    } else {
      const active = new Set(habit.items.map((i) => i.id));
      map[habit.id] = {
        checkedItemIds: Array.isArray(e.checkedItemIds)
          ? e.checkedItemIds.filter((id) => active.has(id))
          : [],
        notRequired: e.notRequired === true,
      };
    }
  }
  return map;
}

/** F-16 / BR-14 shortcut: every tristate done, every active item of every checklist checked. */
export function markAllDone(habits: HabitDef[]): EntryMap {
  const map: EntryMap = {};
  for (const habit of habits) {
    map[habit.id] =
      habit.kind === 'tristate'
        ? { status: 'done', checkedItemIds: [] }
        : { checkedItemIds: habit.items.map((i) => i.id), notRequired: false };
  }
  return map;
}

/** One entry per active habit (save_log rejects a missing one with MISSING_ENTRY). */
export function toEntryInputs(habits: HabitDef[], entries: EntryMap): EntryInput[] {
  return habits.map((habit): EntryInput => {
    const entry = entryFor(entries, habit.id);
    if (habit.kind === 'tristate') {
      // Only called once every tristate is specified; tristates never carry item ids.
      return { habitId: habit.id, status: entry.status ?? 'not_done' };
    }
    if (entry.notRequired) return { habitId: habit.id, status: 'not_required', checkedItemIds: [] };
    const checked = new Set(entry.checkedItemIds);
    // Item order follows the habit's sort order; the server derives the status anyway (BR-02).
    const checkedItemIds = habit.items.filter((i) => checked.has(i.id)).map((i) => i.id);
    return {
      habitId: habit.id,
      status: allChecked(habit, entry) ? 'done' : 'not_done',
      checkedItemIds,
    };
  });
}

export function buildSaveInput(
  habits: HabitDef[],
  entries: EntryMap,
  date: string,
  note: string,
): SaveLogInput {
  const trimmed = note.trim();
  return {
    period: 'daily',
    periodStart: date,
    entries: toEntryInputs(habits, entries),
    ...(trimmed ? { note: trimmed } : {}),
  };
}

/** Required habits not fully done: tristate not_done, or a checklist with unchecked items. */
export function remainingCount(habits: HabitDef[], entries: EntryInput[]): number {
  const byHabit = new Map(entries.map((e) => [e.habitId, e]));
  let n = 0;
  for (const habit of habits) {
    const e = byHabit.get(habit.id);
    if (!e || e.status === 'not_required') continue;
    if (habit.kind === 'tristate') {
      if (e.status !== 'done') n += 1;
    } else {
      const checked = new Set(e.checkedItemIds ?? []);
      if (!habit.items.every((i) => checked.has(i.id))) n += 1;
    }
  }
  return n;
}
