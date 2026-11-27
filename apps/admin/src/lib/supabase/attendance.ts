// Reads for the attendance pages (F-62, a03/a21). The caller's cookie client is passed in, so RLS scopes
// every query: sessions (admin, shared, supervised group, own group), profiles (a supervisor sees their
// groups' people) and attendance (a supervisor sees their groups' rows). The groups a viewer marks are
// narrowed here as well: every group for an admin, the supervised ones for a supervisor.
import type { TypedClient } from '@awrad/supabase-client';

import type { Role } from '../access';
import { buildSections, countMarks, type Mark, type Member, type SessionDetail, type SessionRow } from '../attendance';
import { chunk } from '../overview';
import { DEFAULT_TIMEZONE, type GroupOption } from '../students';

import { viewerGroups } from './overview';

/** session ids per `.in()` filter, to keep the request URL short. */
const IDS_PER_QUERY = 200;

type Viewer = { id: string; role: Role };

// why: `!group_id` names the FK, as every embed in the app does (PostgREST rejects an ambiguous one).
const SESSION_COLUMNS = 'id, group_id, session_date, title, created_at, groups!group_id(name)';

interface SessionJoin {
  id: string;
  group_id: string | null;
  session_date: string;
  title: string | null;
  created_at: string;
  groups: { name: string } | null;
}

function toDetail(s: SessionJoin): SessionDetail {
  return { id: s.id, groupId: s.group_id, groupName: s.groups?.name ?? null, date: s.session_date, title: s.title };
}

/** The groups whose people the viewer marks, by name: all for an admin, the supervised ones for a supervisor. */
export async function markableGroups(client: TypedClient, viewer: Viewer): Promise<GroupOption[]> {
  const groups = await viewerGroups(client, viewer);
  return groups.map((group) => ({ id: group.id, name: group.name }));
}

/** The tracked, active people of `groupIds`, by name. */
async function trackedMembers(client: TypedClient, groupIds: string[]): Promise<Member[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, group_id')
    .eq('is_tracked', true)
    .eq('is_active', true)
    .in('group_id', groupIds)
    .order('full_name');
  if (error) throw error;
  return data.flatMap((p) => (p.group_id ? [{ id: p.id, fullName: p.full_name, groupId: p.group_id }] : []));
}

/** Every session the viewer may see, newest first, with its marked/total for the viewer's sections. */
export async function listSessions(client: TypedClient, viewer: Viewer): Promise<SessionRow[]> {
  const { data, error } = await client
    .from('sessions')
    .select(SESSION_COLUMNS)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  // why: the embedded `groups!group_id(...)` select is typed loosely by the generated relationships; its shape is fixed above.
  const sessions = (data as unknown as SessionJoin[]).map(toDetail);
  if (sessions.length === 0) return [];

  const groups = await markableGroups(client, viewer);
  const members = await trackedMembers(
    client,
    groups.map((group) => group.id),
  );
  const pages = await Promise.all(
    chunk(
      sessions.map((s) => s.id),
      IDS_PER_QUERY,
    ).map(async (ids) => {
      const marks = await client.from('attendance').select('session_id, user_id, status, recorded_at').in('session_id', ids);
      if (marks.error) throw marks.error;
      return marks.data;
    }),
  );
  const marksBySession = new Map<string, Mark[]>();
  for (const row of pages.flat()) {
    const list = marksBySession.get(row.session_id) ?? [];
    list.push({ userId: row.user_id, status: row.status, recordedAt: row.recorded_at });
    marksBySession.set(row.session_id, list);
  }

  return sessions.map((session) => {
    const counts = countMarks(buildSections(session.groupId, groups, members), marksBySession.get(session.id) ?? []);
    return { ...session, marked: counts.marked, total: counts.total };
  });
}

/** One session, or null when it does not exist or RLS hides it. */
export async function getSession(client: TypedClient, id: string): Promise<SessionDetail | null> {
  const { data, error } = await client.from('sessions').select(SESSION_COLUMNS).eq('id', id).maybeSingle();
  // An id that is not a uuid is a 22P02 from PostgREST: just "not found". Anything else is worth a server log.
  if (error && error.code !== '22P02') console.error('attendance: load session failed', error);
  if (error || !data) return null;
  return toDetail(data as unknown as SessionJoin);
}

/**
 * The groups whose sections the viewer marks in `session` and their tracked people (AttendanceGrid
 * builds the sections from both): the session's group for a group session, every markable group for a
 * shared one.
 */
export async function listSessionMembers(
  client: TypedClient,
  session: SessionDetail,
  viewer: Viewer,
): Promise<{ groups: GroupOption[]; members: Member[] }> {
  const markable = await markableGroups(client, viewer);
  const groups = session.groupId ? markable.filter((group) => group.id === session.groupId) : markable;
  const members = await trackedMembers(
    client,
    groups.map((group) => group.id),
  );
  return { groups, members };
}

/** The saved marks of a session that the viewer may read. */
export async function listMarks(client: TypedClient, sessionId: string): Promise<Mark[]> {
  const { data, error } = await client
    .from('attendance')
    .select('user_id, status, recorded_at')
    .eq('session_id', sessionId);
  if (error) throw error;
  return data.map((row) => ({ userId: row.user_id, status: row.status, recordedAt: row.recorded_at }));
}

/** The zone «today» is taken in for the viewer: their profile's, then their group's, then the default. */
export async function viewerTimezone(client: TypedClient, viewerId: string): Promise<string> {
  const { data, error } = await client
    .from('profiles')
    .select('timezone, groups!group_id(timezone)')
    .eq('id', viewerId)
    .maybeSingle();
  if (error) console.error('attendance: load viewer timezone failed', error);
  // why: the embedded `groups!group_id(...)` select is typed loosely by the generated relationships.
  const row = data as unknown as { timezone: string | null; groups: { timezone: string } | null } | null;
  return row?.timezone ?? row?.groups?.timezone ?? DEFAULT_TIMEZONE;
}
