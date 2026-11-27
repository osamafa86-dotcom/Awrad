// Reads for the students pages (Server Components). The caller's cookie client is passed in, so RLS
// scopes every query: an admin sees everyone, a supervisor their groups' people.
import { getCalendar, getStudentSummary, type StudentSummary, type TypedClient } from '@awrad/supabase-client';
import type { DayState } from '@awrad/domain';

import type { GroupOption, StudentFilters, StudentRow } from '../students';
import type { Role } from '../access';

// why: `!group_id` names the FK. PostgREST also sees profiles ↔ groups many-to-many through group_supervisors,
// and rejects an unhinted embed with PGRST201 ("more than one relationship was found").
const PROFILE_COLUMNS =
  'id, full_name, role, group_id, is_active, is_tracked, joined_at, timezone, groups!group_id(name, timezone, week_starts_on)';

interface ProfileJoin {
  id: string;
  full_name: string;
  role: Role;
  group_id: string | null;
  is_active: boolean;
  is_tracked: boolean;
  joined_at: string;
  timezone: string | null;
  groups: { name: string; timezone: string; week_starts_on: number } | null;
}

function toRow(p: ProfileJoin): StudentRow {
  return {
    id: p.id,
    fullName: p.full_name,
    role: p.role,
    groupId: p.group_id,
    groupName: p.groups?.name ?? null,
    isActive: p.is_active,
    isTracked: p.is_tracked,
    joinedAt: p.joined_at,
  };
}

/**
 * Students and supervisors, plus any admin who is tracked (spec §5: role ≠ tracking), sorted by name.
 * Group and status filters run here; the name search runs in the browser.
 */
export async function listStudents(client: TypedClient, filters: StudentFilters): Promise<StudentRow[]> {
  let query = client.from('profiles').select(PROFILE_COLUMNS).or('role.neq.admin,is_tracked.eq.true');
  if (filters.group) query = query.eq('group_id', filters.group);
  if (filters.status) query = query.eq('is_active', filters.status === 'active');
  const { data, error } = await query.order('full_name');
  if (error) throw error;
  // why: the embedded `groups!group_id(...)` select is typed loosely by the generated relationships; its shape is fixed above.
  return (data as unknown as ProfileJoin[]).map(toRow);
}

export async function listGroups(client: TypedClient): Promise<GroupOption[]> {
  const { data, error } = await client.from('groups').select('id, name').order('name');
  if (error) throw error;
  return data;
}

/** The groups a supervisor may filter by: the ones they supervise (group_supervisors). */
export async function supervisedGroupIds(client: TypedClient, userId: string): Promise<Set<string>> {
  const { data, error } = await client.from('group_supervisors').select('group_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.group_id));
}

/** The hijri_adjustment_days setting (BR-09); 0 when it cannot be read. */
export async function hijriAdjustment(client: TypedClient): Promise<number> {
  const { data } = await client.from('app_settings').select('value').eq('key', 'hijri_adjustment_days').maybeSingle();
  const value = Number(data?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export interface StudentProfile extends StudentRow {
  /** The zone «today» is computed in (BR-08): the profile's, then the group's, then the default. */
  timezone: string | null;
  /** The group's first day of the week (0 = Sunday, the default without a group). */
  weekStartsOn: number;
}

/** One person's profile, or null when it does not exist or RLS hides it. */
export async function getStudentProfile(client: TypedClient, id: string): Promise<StudentProfile | null> {
  const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  // An id that is not a uuid is a 22P02 from PostgREST: just "not found". Anything else is worth a server log.
  if (error && error.code !== '22P02') console.error('students: load profile failed', error);
  if (error || !data) return null;
  const p = data as unknown as ProfileJoin;
  return {
    ...toRow(p),
    timezone: p.timezone ?? p.groups?.timezone ?? null,
    weekStartsOn: p.groups?.week_starts_on ?? 0,
  };
}

export type { StudentSummary };

/** A section that failed to load renders its own message instead of failing the page. */
export type Loaded<T> = { ok: true; data: T } | { ok: false };

async function attempt<T>(what: string, load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    // Server log only; the section shows its generic message.
    console.error(`students: load ${what} failed`, error);
    return { ok: false };
  }
}

export function loadSummary(client: TypedClient, userId: string): Promise<Loaded<StudentSummary>> {
  return attempt('summary', () => getStudentSummary(client, { userId }));
}

export function loadCalendar(
  client: TypedClient,
  userId: string,
  from: string,
  to: string,
): Promise<Loaded<Array<{ date: string; state: DayState; completionPct: number | null }>>> {
  return attempt('calendar', () => getCalendar(client, userId, from, to));
}

export interface LogRow {
  period: 'daily' | 'weekly';
  /** `YYYY-MM-DD`: the day, or the first day of the week. */
  periodStart: string;
  /** Daily logs only (v_day_status); weekly logs carry no day state. */
  state: DayState | null;
  completionPct: number | null;
  /** The daily note, or the weekly review (D6: visible to the admin and the group's supervisor). */
  text: string | null;
  supportStatus: 'none' | 'open' | 'handled';
}

/** The latest `limit` logs, daily and weekly, newest first, with each daily log's state. */
export function loadLogs(client: TypedClient, userId: string, limit = 30): Promise<Loaded<LogRow[]>> {
  return attempt('logs', async () => {
    const { data, error } = await client
      .from('logs')
      .select('period, period_start, note, review_text, support_status')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .order('period')
      .limit(limit);
    if (error) throw error;
    const dailyDates = data.filter((log) => log.period === 'daily').map((log) => log.period_start);
    const states = new Map<string, { state: DayState; completionPct: number | null }>();
    if (dailyDates.length > 0) {
      const status = await client
        .from('v_day_status')
        .select('log_date, state, completion_pct')
        .eq('user_id', userId)
        .in('log_date', dailyDates);
      if (status.error) throw status.error;
      for (const row of status.data) {
        // why: the view's state column is plain text in the generated types; the SQL emits only DayState values.
        states.set(row.log_date, { state: row.state as DayState, completionPct: row.completion_pct });
      }
    }
    return data.map((log) => ({
      period: log.period,
      periodStart: log.period_start,
      state: log.period === 'daily' ? (states.get(log.period_start)?.state ?? 'neutral') : null,
      completionPct: log.period === 'daily' ? (states.get(log.period_start)?.completionPct ?? null) : null,
      text: (log.period === 'daily' ? log.note : log.review_text) || null,
      supportStatus: log.support_status,
    }));
  });
}

export interface AttendanceRow {
  date: string;
  title: string | null;
  status: 'present' | 'absent' | 'excused';
}

/** The sessions this person was marked in, newest first. */
export function loadAttendance(client: TypedClient, userId: string): Promise<Loaded<AttendanceRow[]>> {
  return attempt('attendance', async () => {
    const { data, error } = await client
      .from('attendance')
      .select('status, sessions!session_id(session_date, title)')
      .eq('user_id', userId);
    if (error) throw error;
    // why: the embedded `sessions!session_id(...)` select (hinted like the groups embed) is typed loosely by the generated relationships.
    const rows = data as unknown as Array<{
      status: AttendanceRow['status'];
      sessions: { session_date: string; title: string | null } | null;
    }>;
    return rows
      .filter((row) => row.sessions)
      .map((row) => ({ date: row.sessions!.session_date, title: row.sessions!.title, status: row.status }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}
