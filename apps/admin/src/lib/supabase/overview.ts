// Reads for the overview (F-60, a01/a20). The caller's cookie client is passed in: get_group_overview
// and get_student_summary check the viewer themselves (admin, or the group's supervisor) and RLS scopes
// the support-request count.
import { getGroupOverview, getStudentSummary, type TypedClient } from '@awrad/supabase-client';
import { todayIn } from '@awrad/domain';

import type { Role } from '../access';
import {
  assembleRows,
  chunk,
  computeKpis,
  mapWithConcurrency,
  periodDates,
  type OverviewGroup,
  type OverviewKpis,
  type OverviewRow,
} from '../overview';
import { DEFAULT_TIMEZONE, type GroupOption } from '../students';

import { supervisedGroupIds } from './students';

/** get_student_summary calls in flight at once (one per row; PERF-1 in docs/backlog.md). */
const SUMMARY_CONCURRENCY = 8;
/** user ids per `.in()` filter, to keep the request URL short. */
const IDS_PER_QUERY = 200;

export interface Overview {
  rows: OverviewRow[];
  kpis: OverviewKpis;
  /** The header's span: `to` is today. */
  range: { from: string; to: string };
  /** The groups the viewer may pick in the filter. */
  groups: GroupOption[];
}

/** Every group the viewer may see: all of them for an admin, the supervised ones for a supervisor. */
async function viewerGroups(client: TypedClient, viewer: { id: string; role: Role }): Promise<OverviewGroup[]> {
  const { data, error } = await client.from('groups').select('id, name, timezone, week_starts_on').order('name');
  if (error) throw error;
  const groups = data.map((g) => ({ id: g.id, name: g.name, timezone: g.timezone, weekStartsOn: g.week_starts_on }));
  if (viewer.role === 'admin') return groups;
  const supervised = await supervisedGroupIds(client, viewer.id);
  return groups.filter((group) => supervised.has(group.id));
}

/** «طلبات دعم مفتوحة»: logs with an open support request from the shown people. */
async function openSupportCount(client: TypedClient, userIds: string[]): Promise<number> {
  const counts = await Promise.all(
    chunk(userIds, IDS_PER_QUERY).map(async (ids) => {
      const { count, error } = await client
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('support_status', 'open')
        .in('user_id', ids);
      if (error) throw error;
      return count ?? 0;
    }),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * The overview for one group or for 'all' the viewer may see. Each group's days end on its own today
 * (its timezone), so a row's cells are its group's last `days` days.
 */
export async function getOverview(
  client: TypedClient,
  opts: { groupId: string | 'all'; days: number; viewer: { id: string; role: Role }; now?: Date },
): Promise<Overview> {
  const groups = await viewerGroups(client, opts.viewer);
  // A group the viewer may not see (or that no longer exists) falls back to 'all', as the filter shows.
  const picked = groups.filter((group) => group.id === opts.groupId);
  const shown = picked.length > 0 ? picked : groups;

  const perGroup = await Promise.all(
    shown.map(async (group) => {
      const today = todayIn(group.timezone, opts.now);
      const dates = periodDates(today, opts.days);
      const entries = await getGroupOverview(client, group.id, dates[0]!, today);
      return { group, today, entries };
    }),
  );
  const assembled = assembleRows(perGroup, opts.days);

  const [summaries, support] = await Promise.all([
    mapWithConcurrency(assembled, SUMMARY_CONCURRENCY, async (row) => {
      try {
        return await getStudentSummary(client, { userId: row.userId });
      } catch (error) {
        // One unreadable summary shows «—» in its row instead of failing the page.
        console.error('overview: load summary failed', row.userId, error);
        return null;
      }
    }),
    openSupportCount(
      client,
      assembled.map((row) => row.userId),
    ),
  ]);

  // why: with 'all' over groups in different zones each row keeps its own group's dates; the header shows
  // the first shown group's (or, with none, the default zone's), which is the viewer's group in practice.
  const headerToday = perGroup[0]?.today ?? todayIn(DEFAULT_TIMEZONE, opts.now);
  const headerDates = periodDates(headerToday, opts.days);

  return {
    rows: assembled.map((row, i) => ({
      userId: row.userId,
      fullName: row.fullName,
      groupName: row.groupName,
      cells: row.cells,
      inactive: row.inactive,
      currentStreak: summaries[i]?.currentStreak ?? null,
      completionPct: summaries[i]?.completionPct ?? null,
    })),
    kpis: computeKpis(assembled, support),
    range: { from: headerDates[0]!, to: headerToday },
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
  };
}
