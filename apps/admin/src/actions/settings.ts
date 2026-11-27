'use server';

import { parseRpcError } from '@awrad/supabase-client';
import { revalidatePath } from 'next/cache';

import {
  parseAppSettingsForm,
  parseGroup,
  supportedTimezones,
  type AppSettingsResult,
  type GroupInput,
  type GroupResult,
  type SettingsErrorCode,
} from '@/lib/settings';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';

// Actions return typed codes, never display text: the client components map them through ar.ts.
// Each re-checks that the caller is an active admin for the experience; update_app_settings and upsert_group
// (0011) check it again and are the boundary.

async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin' && profile.isActive;
}

/** The code behind a failed RPC: our coded refusals, or SAVE_FAILED for anything else. */
function rpcFailure(error: unknown): SettingsErrorCode {
  const code = parseRpcError(error);
  return code === 'FORBIDDEN' || code === 'INVALID_ITEM' ? code : 'SAVE_FAILED';
}

/** The overview reads week starts and zones; every page reads the Hijri adjustment through it. */
function revalidate() {
  revalidatePath('/settings');
  revalidatePath('/');
}

/** F-66 «إعدادات النظام» → update_app_settings (one transaction, one settings.update audit row). */
export async function updateAppSettings(_previous: AppSettingsResult | null, form: FormData): Promise<AppSettingsResult> {
  if (!(await isAdmin())) return { ok: false, code: 'FORBIDDEN' };
  const parsed = parseAppSettingsForm(form);
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('update_app_settings', { p_values: { ...parsed.value } });
    if (error) return { ok: false, code: rpcFailure(error) };
  } catch {
    return { ok: false, code: 'SAVE_FAILED' };
  }
  revalidate();
  return { ok: true };
}

/** F-66 «مجموعة جديدة» / «تعديل» → upsert_group (the group, its supervisors set and a group.* audit row). */
export async function upsertGroup(input: GroupInput): Promise<GroupResult> {
  if (!(await isAdmin())) return { ok: false, code: 'FORBIDDEN' };
  const parsed = parseGroup(input, { timezones: supportedTimezones() });
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
  const group = parsed.value;
  let id: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('upsert_group', {
      // why: the generated Args type every uuid argument as string; upsert_group takes null for a new group.
      p_id: group.id as string,
      p_name: group.name,
      p_timezone: group.timezone,
      p_week_starts_on: group.weekStartsOn,
      p_supervisor_ids: group.supervisorIds,
    });
    if (error || !data) return { ok: false, code: error ? rpcFailure(error) : 'SAVE_FAILED' };
    id = data;
  } catch {
    return { ok: false, code: 'SAVE_FAILED' };
  }
  revalidate();
  return { ok: true, id };
}
