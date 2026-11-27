'use server';

import { parseRpcError, type TypedClient } from '@awrad/supabase-client';
import { todayIn } from '@awrad/domain';
import { revalidatePath } from 'next/cache';

import {
  parseArchiveDate,
  parseHabitPatch,
  parseIds,
  parseItemName,
  parseNewHabit,
  parseReplacement,
  replacementPayload,
  sortOrderPayload,
  type HabitErrorCode,
  type HabitFrequency,
  type HabitPatch,
  type HabitResult,
  type NewHabit,
  type Replacement,
} from '@/lib/habits';
import { viewerTimezone } from '@/lib/supabase/attendance';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';

// Actions return typed codes, never display text: the client components map them through ar.ts.
// Each re-checks that the caller is an active admin for the experience; RLS (habits/habit_items: write
// for admins only) and archive_and_replace_habit's own check stay the boundary.
const fail = (code: HabitErrorCode): HabitResult => ({ ok: false, code });
const OK: HabitResult = { ok: true };

/** The signed-in active admin's id, or null for anyone else. */
async function adminId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.isActive && profile.role === 'admin' ? profile.id : null;
}

/** «Today» in the admin's zone: archive dates and a new habit's start may not be before it. */
async function adminToday(client: TypedClient, id: string): Promise<string> {
  return todayIn(await viewerTimezone(client, id));
}

/** A failed write: our coded triggers/RPC (HABIT_HAS_LOGS, …), an RLS refusal, or anything else. */
function writeFailure(error: unknown): HabitResult {
  const code = parseRpcError(error);
  if (
    code === 'FORBIDDEN' ||
    code === 'HABIT_HAS_LOGS' ||
    code === 'DATE_OUT_OF_WINDOW' ||
    code === 'INACTIVE_HABIT' ||
    code === 'INVALID_ITEM'
  ) {
    return fail(code);
  }
  const pg = error as { code?: string } | null;
  return fail(pg?.code === '42501' ? 'FORBIDDEN' : 'SAVE_FAILED');
}

/**
 * Runs one write. `run` returns PostgREST's { data, error }; an update or delete that touched no row
 * (RLS filters silently, or the row is gone) counts as SAVE_FAILED.
 */
async function write(
  run: (client: TypedClient) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<HabitResult> {
  try {
    const { data, error } = await run(await createClient());
    if (error) return writeFailure(error);
    if (!data || data.length === 0) return fail('SAVE_FAILED');
  } catch (error) {
    return writeFailure(error);
  }
  revalidatePath('/habits');
  return OK;
}

/** A slug for a habit made here: unique, and naming nothing (habits are data, AGENTS.md §3). */
function newSlug(today: string): string {
  return `habit_${today.replaceAll('-', '')}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * «عادة جديدة» (with no id) or an in-place edit of name / description / target (BR-07: a spelling fix
 * shows on old logs too). A new habit goes last in its frequency; a checklist gets its first items.
 */
export async function upsertHabit(input: { id: string; patch: HabitPatch } | { values: NewHabit }): Promise<HabitResult> {
  const me = await adminId();
  if (!me) return fail('FORBIDDEN');

  if ('id' in input) {
    const parsed = parseHabitPatch(input.id, input.patch);
    if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
    return write((client) => client.from('habits').update(parsed.value.patch).eq('id', parsed.value.id).select('id'));
  }

  let id: string;
  try {
    const client = await createClient();
    const today = await adminToday(client, me);
    const parsed = parseNewHabit(input.values, today);
    if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
    const { items, ...habit } = parsed.value;

    const last = await client
      .from('habits')
      .select('sort_order')
      .eq('frequency', habit.frequency)
      .order('sort_order', { ascending: false })
      .limit(1);
    if (last.error) return writeFailure(last.error);

    const created = await client
      .from('habits')
      .insert({ ...habit, slug: newSlug(today), sort_order: (last.data[0]?.sort_order ?? 0) + 1 })
      .select('id')
      .single();
    if (created.error) return writeFailure(created.error);
    id = created.data.id;

    if (items.length > 0) {
      const inserted = await client.from('habit_items').insert(
        items.map((name, index) => ({ habit_id: id, name, sort_order: index + 1, active_from: habit.active_from })),
      );
      if (inserted.error) {
        // Without its items the checklist cannot be logged: take the new habit back (no logs yet).
        await client.from('habits').delete().eq('id', id);
        return writeFailure(inserted.error);
      }
    }
  } catch (error) {
    return writeFailure(error);
  }
  revalidatePath('/habits');
  return { ok: true, id };
}

/**
 * Drag-to-reorder of the active habits of one frequency: `ids` in their new order get sort_order 1..n.
 * why: one update per row in a loop, not a transaction (PostgREST has no multi-row update with distinct
 * values). A failure midway leaves a partial order the next reorder rewrites; see docs/backlog.md.
 */
export async function reorderHabits(frequency: HabitFrequency, ids: string[]): Promise<HabitResult> {
  if (!(await adminId())) return fail('FORBIDDEN');
  const parsed = parseIds(ids);
  if (!parsed || (frequency !== 'daily' && frequency !== 'weekly')) return fail('INVALID_INPUT');
  try {
    const client = await createClient();
    for (const row of sortOrderPayload(parsed)) {
      const { data, error } = await client
        .from('habits')
        .update({ sort_order: row.sort_order })
        .eq('id', row.id)
        .eq('frequency', frequency)
        .select('id');
      if (error) return writeFailure(error);
      if (data.length === 0) return fail('SAVE_FAILED');
    }
  } catch (error) {
    return writeFailure(error);
  }
  revalidatePath('/habits');
  return OK;
}

/** «إضافة بند» (`{ habitId, name }`, last in the list, active from today) or an item rename (`{ id, name }`). */
export async function upsertItem(input: { habitId: string; name: string } | { id: string; name: string }): Promise<HabitResult> {
  const me = await adminId();
  if (!me) return fail('FORBIDDEN');

  if ('id' in input) {
    const parsed = parseItemName(input.id, input.name);
    if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
    return write((client) =>
      client.from('habit_items').update({ name: parsed.value.name }).eq('id', parsed.value.id).select('id'),
    );
  }

  const parsed = parseItemName(input.habitId, input.name);
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
  return write(async (client) => {
    const last = await client
      .from('habit_items')
      .select('sort_order')
      .eq('habit_id', parsed.value.id)
      .order('sort_order', { ascending: false })
      .limit(1);
    if (last.error) return last;
    return client
      .from('habit_items')
      .insert({
        habit_id: parsed.value.id,
        name: parsed.value.name,
        sort_order: (last.data[0]?.sort_order ?? 0) + 1,
        active_from: await adminToday(client, me),
      })
      .select('id');
  });
}

/** Reorders a checklist's active items: sort_order 1..n (same non-transactional loop as reorderHabits). */
export async function reorderItems(habitId: string, ids: string[]): Promise<HabitResult> {
  if (!(await adminId())) return fail('FORBIDDEN');
  const parsed = parseIds(ids);
  if (!parsed || !parseIds([habitId])) return fail('INVALID_INPUT');
  try {
    const client = await createClient();
    for (const row of sortOrderPayload(parsed)) {
      const { data, error } = await client
        .from('habit_items')
        .update({ sort_order: row.sort_order })
        .eq('id', row.id)
        .eq('habit_id', habitId)
        .select('id');
      if (error) return writeFailure(error);
      if (data.length === 0) return fail('SAVE_FAILED');
    }
  } catch (error) {
    return writeFailure(error);
  }
  revalidatePath('/habits');
  return OK;
}

/** Shared by archiveHabit and archiveItem: active_to = `date` (today or later) on a row still active. */
async function archive(table: 'habits' | 'habit_items', id: string, date: string): Promise<HabitResult> {
  const me = await adminId();
  if (!me) return fail('FORBIDDEN');
  try {
    const client = await createClient();
    const parsed = parseArchiveDate(id, date, await adminToday(client, me));
    if (!parsed.ok) {
      return parsed.fields.includes('date') ? fail('DATE_OUT_OF_WINDOW') : fail('INVALID_INPUT');
    }
    const { data, error } = await client
      .from(table)
      .update({ active_to: parsed.value.date })
      .eq('id', parsed.value.id)
      .is('active_to', null)
      .select('id');
    if (error) return writeFailure(error);
    if (data.length === 0) return fail('INACTIVE_HABIT');
  } catch (error) {
    return writeFailure(error);
  }
  revalidatePath('/habits');
  return OK;
}

/** «أرشفة»: the habit's last active day is `date` (BR-07); its logs stay as they are. */
export async function archiveHabit(id: string, date: string): Promise<HabitResult> {
  return archive('habits', id, date);
}

/** «أرشفة» of a checklist item (BR-07: items have the same lifecycle). */
export async function archiveItem(id: string, date: string): Promise<HabitResult> {
  return archive('habit_items', id, date);
}

/** «حذف» of a habit without logs (its items go with it); one with logs is refused by 0009 (HABIT_HAS_LOGS). */
export async function deleteHabit(id: string): Promise<HabitResult> {
  if (!(await adminId())) return fail('FORBIDDEN');
  if (!parseIds([id])) return fail('INVALID_INPUT');
  return write((client) => client.from('habits').delete().eq('id', id).select('id'));
}

/** «حذف» of an item no log checked (HABIT_HAS_LOGS otherwise). */
export async function deleteItem(id: string): Promise<HabitResult> {
  if (!(await adminId())) return fail('FORBIDDEN');
  if (!parseIds([id])) return fail('INVALID_INPUT');
  return write((client) => client.from('habit_items').delete().eq('id', id).select('id'));
}

/** «أرشفة واستبدال» (a07, BR-07) through archive_and_replace_habit, which checks the dates and the payload. */
export async function replaceHabit(
  oldId: string,
  values: Omit<Replacement, 'switch_date'>,
  switchDate: string,
): Promise<HabitResult> {
  if (!(await adminId())) return fail('FORBIDDEN');
  // The new habit keeps the old one's kind; the RPC requires items for a checklist (INVALID_ITEM).
  const parsed = parseReplacement({ ...values, switch_date: switchDate });
  if (!parsed.ok || !parseIds([oldId])) {
    return { ok: false, code: 'INVALID_INPUT', fields: parsed.ok ? [] : parsed.fields };
  }
  let id: string;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc('archive_and_replace_habit', {
      p_old_habit_id: oldId,
      p_new: replacementPayload(parsed.value),
      p_switch_date: parsed.value.switch_date,
    });
    if (error) return writeFailure(error);
    id = data;
  } catch (error) {
    return writeFailure(error);
  }
  revalidatePath('/habits');
  return { ok: true, id };
}
