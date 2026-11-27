// Habits section (F-63, BR-07): shapes, validation, reorder payloads and error codes shared by the Server
// Actions, the page and the client components. Pure, so it is unit-tested without Next or Supabase.
// Habits are data: nothing here names one (AGENTS.md §3).
import { addDays } from '@awrad/domain';
import { z } from 'zod';

import { ar } from '@/messages/ar';

export type HabitFrequency = 'daily' | 'weekly';
export type HabitKind = 'tristate' | 'checklist';
export const HABIT_FREQUENCIES = ['daily', 'weekly'] as const satisfies readonly HabitFrequency[];
export const HABIT_KINDS = ['tristate', 'checklist'] as const satisfies readonly HabitKind[];

export interface HabitItemView {
  id: string;
  habitId: string;
  name: string;
  sortOrder: number;
  /** `YYYY-MM-DD` */
  activeFrom: string;
  /** `YYYY-MM-DD`, null while active. */
  activeTo: string | null;
  /** A log checked this item: it can be archived, never deleted. */
  hasLogs: boolean;
}

export interface HabitView {
  id: string;
  name: string;
  description: string | null;
  targetText: string | null;
  frequency: HabitFrequency;
  kind: HabitKind;
  sortOrder: number;
  activeFrom: string;
  activeTo: string | null;
  /** A log refers to this habit: it can be archived or replaced, never deleted. */
  hasLogs: boolean;
  /** Every item, active and archived, by sort order. */
  items: HabitItemView[];
}

/** Archived = given an end date (BR-07); everything else, including a replacement that starts later, is listed as active. */
export function isArchived(row: { activeTo: string | null }): boolean {
  return row.activeTo !== null;
}

/** Splits a list into the rows shown in the table (by sort order) and the archived ones (latest end first). */
export function splitArchived<T extends { activeTo: string | null; sortOrder: number }>(
  rows: T[],
): { active: T[]; archived: T[] } {
  const active = rows.filter((row) => !isArchived(row)).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = rows
    .filter(isArchived)
    .sort((a, b) => (b.activeTo ?? '').localeCompare(a.activeTo ?? '') || a.sortOrder - b.sortOrder);
  return { active, archived };
}

/** The sort_order each id gets after a reorder: 1..n in the given order. */
export function sortOrderPayload(ids: string[]): Array<{ id: string; sort_order: number }> {
  return ids.map((id, index) => ({ id, sort_order: index + 1 }));
}

/** Moves `id` to `overId`'s place (dnd-kit's drop), returning a new array; unknown ids leave it unchanged. */
export function moveId(ids: string[], id: string, overId: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** A replacement's default start: the day after `today` (Ruling HAB-1: the RPC is the authority). */
export function defaultSwitchDate(today: string): string {
  return addDays(today, 1);
}

export type HabitErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'HABIT_HAS_LOGS'
  | 'DATE_OUT_OF_WINDOW'
  | 'INACTIVE_HABIT'
  | 'INVALID_ITEM'
  | 'SAVE_FAILED';

export type HabitField = 'name' | 'description' | 'target_text' | 'frequency' | 'kind' | 'active_from' | 'items' | 'date';

/** Outcome of a habits Server Action. `id` is the created row's; `fields` names the invalid inputs. */
export type HabitResult = { ok: true; id?: string } | { ok: false; code: HabitErrorCode; fields?: HabitField[] };

type Parsed<T> = { ok: true; value: T } | { ok: false; fields: HabitField[] };

const FIELD_ORDER: HabitField[] = ['name', 'description', 'target_text', 'frequency', 'kind', 'active_from', 'items', 'date'];

function invalidFields(error: z.ZodError, rename: Partial<Record<string, HabitField>> = {}): HabitField[] {
  const named = new Set(error.issues.map((issue) => rename[String(issue.path[0])] ?? issue.path[0]));
  return FIELD_ORDER.filter((field) => named.has(field));
}

export const NAME_MAX = 200;
export const TEXT_MAX = 500;

const name = z.string().trim().min(1).max(NAME_MAX);
/** An optional text: trimmed, '' and null both mean «none». */
const optionalText = z
  .string()
  .trim()
  .max(TEXT_MAX)
  .nullable()
  .optional()
  .transform((text) => text || null);
const itemNames = z.array(z.string().trim().max(NAME_MAX)).transform((names) => names.filter(Boolean));

/** «عادة جديدة» (HabitForm): `active_from` defaults to today and may not be before it (history keeps its habits). */
export interface NewHabit {
  name: string;
  description: string | null;
  target_text: string | null;
  frequency: HabitFrequency;
  kind: HabitKind;
  active_from: string;
  /** A checklist's first items, in order; ignored for tristate. */
  items: string[];
}

export function parseNewHabit(values: NewHabit, today: string): Parsed<NewHabit> {
  const schema = z
    .object({
      name,
      description: optionalText,
      target_text: optionalText,
      frequency: z.enum(HABIT_FREQUENCIES),
      kind: z.enum(HABIT_KINDS),
      active_from: z.iso.date().refine((date) => date >= today),
      items: itemNames,
    })
    .refine((habit) => habit.kind !== 'checklist' || habit.items.length > 0, { path: ['items'] })
    .transform((habit) => ({ ...habit, items: habit.kind === 'checklist' ? habit.items : [] }));
  const result = schema.safeParse(values);
  return result.success ? { ok: true, value: result.data } : { ok: false, fields: invalidFields(result.error) };
}

/** An in-place edit (BR-07 spelling fix): any of name, description, target. */
export interface HabitPatch {
  name?: string;
  description?: string | null;
  target_text?: string | null;
}

export function parseHabitPatch(id: string, patch: HabitPatch): Parsed<{ id: string; patch: HabitPatch }> {
  const schema = z.object({ id: z.uuid(), name: name.optional(), description: optionalText, target_text: optionalText });
  const result = schema.safeParse({ id, ...patch });
  if (!result.success) return { ok: false, fields: invalidFields(result.error) };
  const { id: parsedId, ...fields } = result.data;
  // Only the fields the caller sent: an inline edit of the name leaves the target alone.
  const value: HabitPatch = Object.fromEntries(Object.entries(fields).filter(([key]) => key in patch));
  return Object.keys(value).length > 0 ? { ok: true, value: { id: parsedId, patch: value } } : { ok: false, fields: [] };
}

/** «أرشفة واستبدال» (a07): the new habit and the day it starts. */
export interface Replacement {
  name: string;
  description: string | null;
  target_text: string | null;
  /** The new checklist's items, in order (only for a checklist). */
  items: string[];
  switch_date: string;
}

/** With `kind` (the dialog) a checklist needs items and a tristate drops them; without it items pass as given. */
export function parseReplacement(values: Replacement, kind?: HabitKind): Parsed<Replacement> {
  const schema = z
    .object({
      name,
      description: optionalText,
      target_text: optionalText,
      items: itemNames,
      switch_date: z.iso.date(),
    })
    .refine((r) => kind !== 'checklist' || r.items.length > 0, { path: ['items'] })
    .transform((r) => ({ ...r, items: kind === 'tristate' ? [] : r.items }));
  const result = schema.safeParse(values);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, fields: invalidFields(result.error, { switch_date: 'date' }) };
}

/** archive_and_replace_habit's p_new for a parsed replacement (kind and slug come from the old habit). */
export function replacementPayload(r: Replacement): {
  name: string;
  description: string | null;
  target_text: string | null;
  items?: Array<{ name: string; sort_order: number }>;
} {
  return {
    name: r.name,
    description: r.description,
    target_text: r.target_text,
    ...(r.items.length > 0 ? { items: r.items.map((item, index) => ({ name: item, sort_order: index + 1 })) } : {}),
  };
}

/** «أرشفة» of a habit or an item: the last active day, today or later (a log can only be on a day that came). */
export function parseArchiveDate(id: string, date: string, today: string): Parsed<{ id: string; date: string }> {
  const result = z.object({ id: z.uuid(), date: z.iso.date().refine((d) => d >= today) }).safeParse({ id, date });
  return result.success ? { ok: true, value: result.data } : { ok: false, fields: invalidFields(result.error) };
}

/** A checklist item's name with the id it belongs to (the habit for «إضافة بند», the item for a rename). */
export function parseItemName(id: string, itemName: string): Parsed<{ id: string; name: string }> {
  const result = z.object({ id: z.uuid(), name }).safeParse({ id, name: itemName });
  return result.success ? { ok: true, value: result.data } : { ok: false, fields: invalidFields(result.error) };
}

/** A reorder: the ids in their new order, each once. */
export function parseIds(ids: string[]): string[] | null {
  const result = z
    .array(z.uuid())
    .min(1)
    .refine((list) => new Set(list).size === list.length)
    .safeParse(ids);
  return result.success ? result.data : null;
}

// Typed so a new code without a message fails to compile.
const ERROR_TEXT: Record<HabitErrorCode, string> = ar.habits.errors;

/** The message for a failed action result; null when there is nothing to show. */
export function habitErrorText(result: HabitResult | null): string | null {
  return result && !result.ok ? ERROR_TEXT[result.code] : null;
}
