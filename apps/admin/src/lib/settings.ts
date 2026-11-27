// Settings section (F-66): the six app settings and the groups — shapes, validation that mirrors
// update_app_settings / upsert_group (0011), the timezone list and error codes shared by the Server Actions,
// the page and the client components. Pure, so it is unit-tested without Next or Supabase.
import { z } from 'zod';

import { ar } from '@/messages/ar';

export const SETTING_KEYS = [
  'streak_threshold_pct',
  'backfill_days',
  'weekly_grace_days',
  'hijri_adjustment_days',
  'excused_counts_as_absent',
  'default_reminder_time',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface AppSettings {
  /** BR-01/02: the completion a day needs to count as achieved. */
  streak_threshold_pct: number;
  /** BR-05: how many past days a student may still log. */
  backfill_days: number;
  /** BR-06: days after the week ends that its review is still accepted. */
  weekly_grace_days: number;
  /** BR-09: added to the Umm al-Qura date everywhere. */
  hijri_adjustment_days: number;
  /** D10: whether «excused» counts as absent in the attendance rate. */
  excused_counts_as_absent: boolean;
  /** `HH:MM`: the daily reminder a new account starts with. */
  default_reminder_time: string;
}

/** The values seeded by 0001, used when a row is missing or malformed. */
export const DEFAULT_SETTINGS: AppSettings = {
  streak_threshold_pct: 100,
  backfill_days: 2,
  weekly_grace_days: 3,
  hijri_adjustment_days: 0,
  excused_counts_as_absent: false,
  default_reminder_time: '21:00',
};

export type IntegerSettingKey = 'streak_threshold_pct' | 'backfill_days' | 'weekly_grace_days' | 'hijri_adjustment_days';

/** The ranges update_app_settings enforces (0011). */
export const SETTING_RANGES: Record<IntegerSettingKey, { min: number; max: number }> = {
  streak_threshold_pct: { min: 50, max: 100 },
  backfill_days: { min: 0, max: 14 },
  weekly_grace_days: { min: 0, max: 7 },
  hijri_adjustment_days: { min: -2, max: 2 },
};

export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

type Parsed<T, F> = { ok: true; value: T } | { ok: false; fields: F[] };

function fieldsOf<F extends string>(error: z.ZodError, order: readonly F[]): F[] {
  const named = new Set(error.issues.map((issue) => String(issue.path[0])));
  return order.filter((field) => named.has(field));
}

/** A whole number typed in a field (no blank, no decimals), within the range. */
function integerField({ min, max }: { min: number; max: number }) {
  return z
    .string()
    .trim()
    .regex(/^-?\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}

const appSettingsSchema = z.object({
  streak_threshold_pct: integerField(SETTING_RANGES.streak_threshold_pct),
  backfill_days: integerField(SETTING_RANGES.backfill_days),
  weekly_grace_days: integerField(SETTING_RANGES.weekly_grace_days),
  hijri_adjustment_days: integerField(SETTING_RANGES.hijri_adjustment_days),
  excused_counts_as_absent: z.boolean(),
  default_reminder_time: z.string().trim().regex(TIME_PATTERN),
});

/** «إعدادات النظام» (AppSettingsForm): the switch arrives as its hidden "true"/"false". */
export function parseAppSettingsForm(form: FormData): Parsed<AppSettings, SettingKey> {
  const text = (name: SettingKey) => String(form.get(name) ?? '');
  const result = appSettingsSchema.safeParse({
    streak_threshold_pct: text('streak_threshold_pct'),
    backfill_days: text('backfill_days'),
    weekly_grace_days: text('weekly_grace_days'),
    hijri_adjustment_days: text('hijri_adjustment_days'),
    excused_counts_as_absent: text('excused_counts_as_absent') === 'true',
    default_reminder_time: text('default_reminder_time'),
  });
  return result.success ? { ok: true, value: result.data } : { ok: false, fields: fieldsOf(result.error, SETTING_KEYS) };
}

/** The app_settings rows as AppSettings; a missing or malformed value falls back to its default. */
export function appSettingsFrom(rows: ReadonlyArray<{ key: string; value: unknown }>): AppSettings {
  const settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key === 'excused_counts_as_absent') {
      if (typeof value === 'boolean') settings.excused_counts_as_absent = value;
    } else if (key === 'default_reminder_time') {
      if (typeof value === 'string' && TIME_PATTERN.test(value)) settings.default_reminder_time = value;
    } else if (key in SETTING_RANGES) {
      if (typeof value === 'number' && Number.isInteger(value)) settings[key as IntegerSettingKey] = value;
    }
  }
  return settings;
}

/** The program's region, listed first in the timezone picker (Ruling SET-1). */
export const PRIORITY_TIMEZONES = [
  'Asia/Riyadh',
  'Asia/Amman',
  'Asia/Hebron',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Africa/Cairo',
  'Asia/Istanbul',
] as const;

/** The app default zone (groups.timezone default; spec §5). */
export const DEFAULT_GROUP_TIMEZONE = PRIORITY_TIMEZONES[0];

/** The picker's zones: the region first, in its order, then every other zone of `all` alphabetically. */
export function timezoneOptions(all: readonly string[]): string[] {
  const first = new Set<string>(PRIORITY_TIMEZONES);
  const rest = [...new Set(all)].filter((zone) => !first.has(zone)).sort();
  return [...PRIORITY_TIMEZONES, ...rest];
}

/** IANA zones the server's ICU knows (computed on the server and passed to the picker). */
export function supportedTimezones(): string[] {
  return timezoneOptions(Intl.supportedValuesOf('timeZone'));
}

export interface SupervisorOption {
  id: string;
  name: string;
}

/** A row of the groups table. */
export interface GroupRow {
  id: string;
  name: string;
  timezone: string;
  /** 0 = Sunday … 6 = Saturday (BR-06). */
  weekStartsOn: number;
  /** By name. */
  supervisors: SupervisorOption[];
  /** Active profiles in the group. */
  memberCount: number;
}

/** What «مجموعة جديدة» / «تعديل» sends (id null = a new group). */
export interface GroupInput {
  id: string | null;
  name: string;
  timezone: string;
  weekStartsOn: number;
  supervisorIds: string[];
}

export type GroupField = 'name' | 'name_taken' | 'timezone' | 'week_starts_on' | 'supervisor_ids';
const GROUP_FIELDS: readonly GroupField[] = ['name', 'name_taken', 'timezone', 'week_starts_on', 'supervisor_ids'];

export const GROUP_NAME_MAX = 100;

/** The same comparison upsert_group makes: case and outer spaces do not tell two names apart. */
export function sameGroupName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Validates a group as upsert_group will: a trimmed non-empty name, a zone from `timezones`, a week start
 * 0–6 and supervisor ids (de-duplicated). With `candidates` each supervisor must be one of them; with
 * `takenNames` (the other groups') the name must be free. The RPC checks again.
 */
export function parseGroup(
  input: GroupInput,
  opts: { timezones: readonly string[]; candidates?: readonly string[]; takenNames?: readonly string[] },
): Parsed<GroupInput, GroupField> {
  const schema = z.object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1).max(GROUP_NAME_MAX),
    timezone: z.string().refine((zone) => opts.timezones.includes(zone)),
    week_starts_on: z.number().int().min(0).max(6),
    supervisor_ids: z
      .array(z.uuid().refine((id) => !opts.candidates || opts.candidates.includes(id)))
      .transform((ids) => [...new Set(ids)]),
  });
  const result = schema.safeParse({
    id: input.id,
    name: input.name,
    timezone: input.timezone,
    week_starts_on: input.weekStartsOn,
    supervisor_ids: input.supervisorIds,
  });
  if (!result.success) return { ok: false, fields: fieldsOf(result.error, GROUP_FIELDS) };
  const { id, name, timezone, week_starts_on, supervisor_ids } = result.data;
  if (opts.takenNames?.some((taken) => sameGroupName(taken, name))) return { ok: false, fields: ['name_taken'] };
  return { ok: true, value: { id, name, timezone, weekStartsOn: week_starts_on, supervisorIds: supervisor_ids } };
}

export type SettingsErrorCode = 'FORBIDDEN' | 'INVALID_INPUT' | 'INVALID_ITEM' | 'SAVE_FAILED';

/** Outcome of «حفظ» in «إعدادات النظام». */
export type AppSettingsResult = { ok: true } | { ok: false; code: SettingsErrorCode; fields?: SettingKey[] };

/** Outcome of saving a group; `id` is the group's. */
export type GroupResult = { ok: true; id: string } | { ok: false; code: SettingsErrorCode; fields?: GroupField[] };

// Typed so a new code without a message fails to compile.
const APP_ERRORS: Record<SettingsErrorCode, string> = ar.settings.errors.app;
const GROUP_ERRORS: Record<SettingsErrorCode, string> = ar.settings.errors.group;

/** The message for a failed result; null when there is nothing to show. */
export function settingsErrorText(result: AppSettingsResult | GroupResult | null, form: 'app' | 'group'): string | null {
  if (!result || result.ok) return null;
  return (form === 'app' ? APP_ERRORS : GROUP_ERRORS)[result.code];
}
