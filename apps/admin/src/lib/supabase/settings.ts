// Reads for the settings page (F-66, admin only). The caller's cookie client is passed in, so RLS applies:
// app_settings, groups and group_supervisors are readable by every signed-in user, and the admin reads every
// profile. Flat selects joined here, so no embed depends on FK hints.
import type { TypedClient } from '@awrad/supabase-client';

import { appSettingsFrom, type AppSettings, type GroupRow, type SupervisorOption } from '../settings';

import { fetchAllPages } from './postgrest';

/** The six app settings (a missing or malformed row reads as its default). */
export async function getAppSettings(client: TypedClient): Promise<AppSettings> {
  const { data, error } = await client.from('app_settings').select('key, value');
  if (error) throw error;
  return appSettingsFrom(data);
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ar');

/**
 * Every group by name, with its supervisors' names and its active member count, and the people who may
 * supervise a group: active profiles with the supervisor or admin role, by name.
 */
export async function listGroupSettings(
  client: TypedClient,
): Promise<{ groups: GroupRow[]; candidates: SupervisorOption[] }> {
  const [groups, links, profiles] = await Promise.all([
    fetchAllPages((from, to) =>
      client.from('groups').select('id, name, timezone, week_starts_on').order('name').order('id').range(from, to),
    ),
    fetchAllPages((from, to) =>
      client.from('group_supervisors').select('group_id, user_id').order('group_id').order('user_id').range(from, to),
    ),
    fetchAllPages((from, to) =>
      client.from('profiles').select('id, full_name, role, is_active, group_id').order('id').range(from, to),
    ),
  ]);

  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name]));
  const members = new Map<string, number>();
  for (const p of profiles) {
    if (p.is_active && p.group_id) members.set(p.group_id, (members.get(p.group_id) ?? 0) + 1);
  }
  const supervisors = new Map<string, SupervisorOption[]>();
  for (const link of links) {
    const list = supervisors.get(link.group_id) ?? [];
    list.push({ id: link.user_id, name: nameOf.get(link.user_id) ?? '' });
    supervisors.set(link.group_id, list);
  }

  return {
    groups: groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        timezone: g.timezone,
        weekStartsOn: g.week_starts_on,
        supervisors: (supervisors.get(g.id) ?? []).sort(byName),
        memberCount: members.get(g.id) ?? 0,
      }))
      .sort(byName),
    candidates: profiles
      .filter((p) => p.is_active && (p.role === 'supervisor' || p.role === 'admin'))
      .map((p) => ({ id: p.id, name: p.full_name }))
      .sort(byName),
  };
}
