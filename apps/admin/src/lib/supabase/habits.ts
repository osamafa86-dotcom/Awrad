// Reads for the habits page (F-63, a06). Flat selects (no embeds); every authenticated user may read
// habits and items, and the admin reads every log entry, so «has logs» is exact for the admin.
import type { TypedClient } from '@awrad/supabase-client';

import type { HabitItemView, HabitView } from '../habits';

/** Ids among `habitIds` that a log entry refers to: one indexed `limit 1` probe per habit (0009's index). */
export async function habitsWithLogs(client: TypedClient, habitIds: string[]): Promise<Set<string>> {
  const found = await Promise.all(
    habitIds.map(async (id) => {
      const { data, error } = await client.from('log_entries').select('habit_id').eq('habit_id', id).limit(1);
      if (error) throw error;
      return data.length > 0 ? id : null;
    }),
  );
  return new Set(found.filter((id): id is string => id !== null));
}

/** Ids among `itemIds` that a log checked: one indexed `limit 1` probe per item. */
export async function itemsWithLogs(client: TypedClient, itemIds: string[]): Promise<Set<string>> {
  const found = await Promise.all(
    itemIds.map(async (id) => {
      const { data, error } = await client
        .from('log_entry_items')
        .select('habit_item_id')
        .eq('habit_item_id', id)
        .limit(1);
      if (error) throw error;
      return data.length > 0 ? id : null;
    }),
  );
  return new Set(found.filter((id): id is string => id !== null));
}

/** Every habit (active and archived) with its items and whether logs refer to them, by frequency and sort order. */
export async function listHabits(client: TypedClient): Promise<HabitView[]> {
  const [habits, items] = await Promise.all([
    client
      .from('habits')
      .select('id, name, description, target_text, frequency, kind, sort_order, active_from, active_to')
      .order('frequency')
      .order('sort_order')
      .order('slug'),
    client
      .from('habit_items')
      .select('id, habit_id, name, sort_order, active_from, active_to')
      .order('sort_order')
      .order('id'),
  ]);
  if (habits.error) throw habits.error;
  if (items.error) throw items.error;

  const [habitLogs, itemLogs] = await Promise.all([
    habitsWithLogs(
      client,
      habits.data.map((h) => h.id),
    ),
    itemsWithLogs(
      client,
      items.data.map((i) => i.id),
    ),
  ]);

  const itemsByHabit = new Map<string, HabitItemView[]>();
  for (const i of items.data) {
    const list = itemsByHabit.get(i.habit_id) ?? [];
    list.push({
      id: i.id,
      habitId: i.habit_id,
      name: i.name,
      sortOrder: i.sort_order,
      activeFrom: i.active_from,
      activeTo: i.active_to,
      hasLogs: itemLogs.has(i.id),
    });
    itemsByHabit.set(i.habit_id, list);
  }

  return habits.data.map((h) => ({
    id: h.id,
    name: h.name,
    description: h.description,
    targetText: h.target_text,
    frequency: h.frequency,
    kind: h.kind,
    sortOrder: h.sort_order,
    activeFrom: h.active_from,
    activeTo: h.active_to,
    hasLogs: habitLogs.has(h.id),
    items: itemsByHabit.get(h.id) ?? [],
  }));
}
