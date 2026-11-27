// Reads for the CSV export (F-65, EXP-1). The caller's cookie client is passed in, so RLS scopes every
// row: an admin reads everyone, a supervisor their groups' people, logs and attendance only, whatever
// group id the query names (a group they may not see simply yields no profiles). Flat selects, joined
// here; anything that can pass PostgREST's max_rows is paged.
import type { TypedClient } from '@awrad/supabase-client';
import type { EntryInput, HabitDef } from '@awrad/domain';

import type { ExportQuery } from '../export-query';
import {
  buildAttendanceReport,
  buildDailyReport,
  buildWeeklyReport,
  type ExportGroup,
  type ExportLog,
  type ExportPerson,
  type ExportSettings,
  type ExportTable,
} from '../export-rows';
import { chunk } from '../overview';

import { fetchAllPages, IDS_PER_QUERY } from './postgrest';

/** Every page of a `.in()` query over `ids`, in chunks that keep the URL short. */
async function inChunks<T>(
  ids: string[],
  page: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const pages = await Promise.all(
    chunk(unique, IDS_PER_QUERY).map((part) => fetchAllPages((from, to) => page(part, from, to))),
  );
  return pages.flat();
}

async function loadSettings(client: TypedClient): Promise<ExportSettings> {
  const { data, error } = await client
    .from('app_settings')
    .select('key, value')
    .in('key', ['streak_threshold_pct', 'hijri_adjustment_days']);
  if (error) throw error;
  const read = (key: string, fallback: number) => {
    const value = Number(data.find((row) => row.key === key)?.value ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  };
  // The defaults of 0001's seed rows.
  return { thresholdPct: read('streak_threshold_pct', 100), hijriAdjustment: read('hijri_adjustment_days', 0) };
}

async function loadGroups(client: TypedClient): Promise<ExportGroup[]> {
  const { data, error } = await client.from('groups').select('id, name, timezone, week_starts_on');
  if (error) throw error;
  return data.map((g) => ({ id: g.id, name: g.name, timezone: g.timezone, weekStartsOn: g.week_starts_on }));
}

/** Every habit, active and archived, with all its items (the builders pick what is active on each day). */
async function loadHabits(client: TypedClient): Promise<HabitDef[]> {
  const [habits, items] = await Promise.all([
    client.from('habits').select('id, slug, name, target_text, frequency, kind, sort_order, active_from, active_to'),
    client.from('habit_items').select('id, habit_id, name, sort_order, active_from, active_to').order('sort_order'),
  ]);
  if (habits.error) throw habits.error;
  if (items.error) throw items.error;
  return habits.data.map((h) => ({
    id: h.id,
    slug: h.slug,
    name: h.name,
    targetText: h.target_text,
    frequency: h.frequency,
    kind: h.kind,
    sortOrder: h.sort_order,
    activeFrom: h.active_from,
    activeTo: h.active_to,
    items: items.data
      .filter((i) => i.habit_id === h.id)
      .map((i) => ({ id: i.id, name: i.name, sortOrder: i.sort_order, activeFrom: i.active_from, activeTo: i.active_to })),
  }));
}

/** The tracked, active people the viewer may see (one group's, or all), admins only when tracked. */
async function loadPeople(client: TypedClient, group: ExportQuery['group']): Promise<ExportPerson[]> {
  const rows = await fetchAllPages((from, to) => {
    let query = client
      .from('profiles')
      .select('id, full_name, group_id, joined_at')
      .eq('is_tracked', true)
      .eq('is_active', true);
    if (group !== 'all') query = query.eq('group_id', group);
    return query.order('id').range(from, to);
  });
  return rows.map((p) => ({ id: p.id, fullName: p.full_name, groupId: p.group_id, joinedAt: p.joined_at }));
}

/** `people`'s logs of `period` starting in [from, to], each with its entries and checked items. */
async function loadLogs(
  client: TypedClient,
  people: ExportPerson[],
  period: 'daily' | 'weekly',
  range: { from: string; to: string },
  habits: HabitDef[],
): Promise<ExportLog[]> {
  const logs = await inChunks(
    people.map((p) => p.id),
    (ids, from, to) =>
      client
        .from('logs')
        .select('id, user_id, period_start, note, review_text, support_request_text, support_status')
        .eq('period', period)
        .gte('period_start', range.from)
        .lte('period_start', range.to)
        .in('user_id', ids)
        .order('id')
        .range(from, to),
  );
  const entries = await inChunks(
    logs.map((log) => log.id),
    (ids, from, to) =>
      client.from('log_entries').select('id, log_id, habit_id, status').in('log_id', ids).order('id').range(from, to),
  );
  // Only checklist entries carry items.
  const checklists = new Set(habits.filter((habit) => habit.kind === 'checklist').map((habit) => habit.id));
  const items = await inChunks(
    entries.filter((entry) => checklists.has(entry.habit_id)).map((entry) => entry.id),
    (ids, from, to) =>
      client
        .from('log_entry_items')
        .select('entry_id, habit_item_id')
        .in('entry_id', ids)
        .order('entry_id')
        .order('habit_item_id')
        .range(from, to),
  );

  const checked = new Map<string, string[]>();
  for (const item of items) checked.set(item.entry_id, [...(checked.get(item.entry_id) ?? []), item.habit_item_id]);
  const byLog = new Map<string, EntryInput[]>();
  for (const entry of entries) {
    const list = byLog.get(entry.log_id) ?? [];
    list.push({ habitId: entry.habit_id, status: entry.status, checkedItemIds: checked.get(entry.id) ?? [] });
    byLog.set(entry.log_id, list);
  }
  return logs.map((log) => ({
    userId: log.user_id,
    periodStart: log.period_start,
    note: log.note,
    reviewText: log.review_text,
    supportRequestText: log.support_request_text,
    supportStatus: log.support_status,
    entries: byLog.get(log.id) ?? [],
  }));
}

async function loadAttendance(
  client: TypedClient,
  query: ExportQuery,
  groups: ExportGroup[],
  settings: ExportSettings,
): Promise<ExportTable> {
  const sessions = await fetchAllPages((from, to) =>
    client
      .from('sessions')
      .select('id, session_date, title')
      .gte('session_date', query.from)
      .lte('session_date', query.to)
      .order('id')
      .range(from, to),
  );
  const marks = await inChunks(
    sessions.map((s) => s.id),
    (ids, from, to) =>
      client
        .from('attendance')
        .select('id, session_id, user_id, status, recorded_by')
        .in('session_id', ids)
        .order('id')
        .range(from, to),
  );
  const people = await inChunks(
    marks.flatMap((m) => (m.recorded_by ? [m.user_id, m.recorded_by] : [m.user_id])),
    (ids, from, to) => client.from('profiles').select('id, full_name, group_id').in('id', ids).order('id').range(from, to),
  );
  const groupOf = new Map(people.map((p) => [p.id, p.group_id]));
  const shown = query.group === 'all' ? marks : marks.filter((m) => groupOf.get(m.user_id) === query.group);
  return buildAttendanceReport({
    sessions: sessions.map((s) => ({ id: s.id, date: s.session_date, title: s.title })),
    marks: shown.map((m) => ({ sessionId: m.session_id, userId: m.user_id, status: m.status, recordedBy: m.recorded_by })),
    people: people.map((p) => ({ id: p.id, fullName: p.full_name, groupId: p.group_id })),
    groups,
    settings,
  });
}

/** The table of one export, as the viewer may see it. */
export async function loadExport(client: TypedClient, query: ExportQuery, now: Date = new Date()): Promise<ExportTable> {
  const [settings, groups] = await Promise.all([loadSettings(client), loadGroups(client)]);
  if (query.kind === 'attendance') return loadAttendance(client, query, groups, settings);

  const [people, habits] = await Promise.all([loadPeople(client, query.group), loadHabits(client)]);
  const logs = await loadLogs(client, people, query.kind, query, habits);
  const input = { people, groups, habits, logs, from: query.from, to: query.to, settings, now };
  return query.kind === 'daily' ? buildDailyReport(input) : buildWeeklyReport(input);
}
