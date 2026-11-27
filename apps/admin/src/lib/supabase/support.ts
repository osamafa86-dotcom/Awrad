// Reads for the support inbox (F-64) and the deletion requests (§13). The caller's cookie client is passed
// in, so RLS scopes every query: logs and deletion_requests (owner, the group's supervisor, admin), profiles
// (a supervisor sees their groups' people). Flat selects joined here, so no embed depends on FK hints.
import type { TypedClient } from '@awrad/supabase-client';

import { chunk } from '../overview';
import { HANDLED_WINDOW_DAYS, type DeletionRequest, type SupportRequest, type SupportStatus } from '../support';

import { fetchAllPages, IDS_PER_QUERY } from './postgrest';

const LOG_COLUMNS =
  'id, user_id, period, period_start, review_text, support_request_text, support_status, handled_by, handled_at';

interface Person {
  name: string;
  groupName: string | null;
}

/** Name and group name of each id the viewer may read (an id RLS hides is simply missing). */
async function people(client: TypedClient, ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [pages, groups] = await Promise.all([
    Promise.all(
      chunk(unique, IDS_PER_QUERY).map(async (part) => {
        const { data, error } = await client.from('profiles').select('id, full_name, group_id').in('id', part);
        if (error) throw error;
        return data;
      }),
    ),
    client.from('groups').select('id, name'),
  ]);
  if (groups.error) throw groups.error;
  const groupName = new Map(groups.data.map((g) => [g.id, g.name]));
  return new Map(
    pages.flat().map((p) => [p.id, { name: p.full_name, groupName: p.group_id ? (groupName.get(p.group_id) ?? null) : null }]),
  );
}

/**
 * The internal note of each handled request. It lives in the staff-only `support_notes` table (Ruling FIN-8), never
 * on the student-readable logs row; RLS lets the admin and the supervisor of the owner's group read it.
 */
async function notes(client: TypedClient, logIds: string[]): Promise<Map<string, string>> {
  if (logIds.length === 0) return new Map();
  const pages = await Promise.all(
    chunk(logIds, IDS_PER_QUERY).map(async (part) => {
      const { data, error } = await client.from('support_notes').select('log_id, note').in('log_id', part);
      if (error) throw error;
      return data;
    }),
  );
  return new Map(pages.flat().map((row) => [row.log_id, row.note]));
}

/**
 * The requests of one status. «open»: every open one, newest week first. «handled»: those handled in the last
 * HANDLED_WINDOW_DAYS days, most recently handled first. Both paged (PostgREST's max_rows would cut them off).
 */
export async function listSupportRequests(
  client: TypedClient,
  status: SupportStatus,
  now: Date = new Date(),
): Promise<SupportRequest[]> {
  const since = new Date(now.getTime() - HANDLED_WINDOW_DAYS * 86_400_000).toISOString();
  const rows = await fetchAllPages((from, to) => {
    const query = client.from('logs').select(LOG_COLUMNS).eq('support_status', status);
    const ordered =
      status === 'open'
        ? query.order('period_start', { ascending: false }).order('updated_at', { ascending: false })
        : query.gte('handled_at', since).order('handled_at', { ascending: false });
    // id last: a unique tiebreaker, so the pages do not overlap.
    return ordered.order('id').range(from, to);
  });
  const [who, noteOf] = await Promise.all([
    people(
      client,
      rows.flatMap((row) => (row.handled_by ? [row.user_id, row.handled_by] : [row.user_id])),
    ),
    status === 'handled' ? notes(client, rows.map((row) => row.id)) : Promise.resolve(new Map<string, string>()),
  ]);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    studentName: who.get(row.user_id)?.name ?? null,
    groupName: who.get(row.user_id)?.groupName ?? null,
    period: row.period,
    periodStart: row.period_start,
    reviewText: row.review_text,
    requestText: row.support_request_text ?? '',
    status,
    handledAt: row.handled_at,
    handledByName: row.handled_by ? (who.get(row.handled_by)?.name ?? null) : null,
    handledNote: noteOf.get(row.id) ?? null,
  }));
}

/** The open account-deletion requests, oldest first (the nearest deadline on top). */
export async function listDeletionRequests(client: TypedClient): Promise<DeletionRequest[]> {
  const rows = await fetchAllPages((from, to) =>
    client
      .from('deletion_requests')
      .select('id, user_id, requested_at')
      .is('handled_at', null)
      .order('requested_at')
      .order('id')
      .range(from, to),
  );
  const who = await people(
    client,
    rows.map((row) => row.user_id),
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    studentName: who.get(row.user_id)?.name ?? null,
    groupName: who.get(row.user_id)?.groupName ?? null,
    requestedAt: row.requested_at,
  }));
}
