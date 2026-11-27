// The export's rows (F-65, ruling EXP-1 row model): one row per person per day (daily), per week
// (weekly) or per attendance mark, with a column per habit, laid out like the legacy sheets (spec §14).
// Pure: the reads (src/lib/supabase/export.ts) pass in what RLS let the viewer see. Day states come from
// computeDayStatus (BR-01/BR-02), Hijri dates from toHijri with the adjustment setting (BR-09).
import {
  addDays,
  computeDayStatus,
  isActiveOn,
  todayIn,
  toHijri,
  weekStartFor,
  type EntryInput,
  type Frequency,
  type HabitDef,
} from '@awrad/domain';

import { ar } from '@/messages/ar';

import type { CsvValue } from './csv';
import { DEFAULT_TIMEZONE } from './students';

const t = ar.reports.csv;
/** One collator for every sort (names and group names in Arabic order). */
const collator = new Intl.Collator('ar');

/** `YYYY-MM-DD` strings sort as plain text. */
function compareDates(a: CsvValue, b: CsvValue): number {
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
const h = t.headers;

export interface ExportGroup {
  id: string;
  name: string;
  timezone: string;
  weekStartsOn: number;
}

export interface ExportPerson {
  id: string;
  fullName: string;
  groupId: string | null;
  /** profiles.joined_at: no row before it (the program had not started for them). */
  joinedAt: string;
}

export interface ExportLog {
  userId: string;
  /** The day, or the first day of the week. */
  periodStart: string;
  note: string | null;
  reviewText: string | null;
  supportRequestText: string | null;
  supportStatus: 'none' | 'open' | 'handled';
  entries: EntryInput[];
}

export interface ExportSettings {
  /** streak_threshold_pct (BR-02). */
  thresholdPct: number;
  /** hijri_adjustment_days (BR-09). */
  hijriAdjustment: number;
}

export interface ExportTable {
  headers: string[];
  rows: Array<Record<string, CsvValue>>;
}

export interface LogReportInput {
  people: ExportPerson[];
  groups: ExportGroup[];
  /** Every habit, active and archived, with its items. */
  habits: HabitDef[];
  /** The period's logs of `people`, of the report's frequency. */
  logs: ExportLog[];
  from: string;
  to: string;
  settings: ExportSettings;
  /** «Now»: no row after each group's today (in its time zone). */
  now: Date;
}

type Row = Record<string, CsvValue>;
type DayStatus = ReturnType<typeof computeDayStatus>;

/** The habits of `frequency` active on at least one day of the period, by sort order, each with a column name. */
function habitColumns(habits: HabitDef[], frequency: Frequency, from: string, to: string) {
  const shown = habits
    .filter((habit) => habit.frequency === frequency && habit.activeFrom <= to && (habit.activeTo ?? to) >= from)
    .sort((a, b) => a.sortOrder - b.sortOrder || collator.compare(a.name, b.name));
  const used = new Set<string>(Object.values(h));
  return shown.map((habit) => {
    let column = habit.name;
    // A repeated name (an archived habit and its replacement, say) must not overwrite the first column.
    for (let n = 2; used.has(column); n += 1) column = t.duplicate(habit.name, n);
    used.add(column);
    return { habit, column };
  });
}

/** One habit's cell: empty when inactive that day or unlogged; the entry's word, or `n/m` for a checklist. */
function habitCell(habit: HabitDef, entry: EntryInput | undefined, date: string): string {
  if (!entry || !isActiveOn(habit, date)) return '';
  if (entry.status === 'not_required' || habit.kind !== 'checklist') return t.entry[entry.status];
  const active = habit.items.filter((item) => isActiveOn(item, date));
  // Nothing to tick that day: no `0/0`; computeDayStatus alone decides what the day counts as.
  if (active.length === 0) return '';
  const checked = new Set(entry.checkedItemIds ?? []);
  // Plain ASCII digits with no spaces (DESIGN.md §7 rule 4); no bidi marks in a data file.
  return `${active.filter((item) => checked.has(item.id)).length}/${active.length}`;
}

function stateLabel(status: DayStatus | null): string {
  return status ? ar.dayState[status.state] : ar.dayState.missing;
}

function byGroupNameDate(dateKey: string) {
  return (a: Row, b: Row) =>
    collator.compare(String(a[h.group]), String(b[h.group])) ||
    collator.compare(String(a[h.student]), String(b[h.student])) ||
    compareDates(a[dateKey], b[dateKey]);
}

function groupOf(groups: ExportGroup[], id: string | null): ExportGroup | undefined {
  return groups.find((group) => group.id === id);
}

function logsByKey(logs: ExportLog[]): Map<string, ExportLog> {
  return new Map(logs.map((log) => [`${log.userId}|${log.periodStart}`, log]));
}

/** Habit cells keyed by column name. */
function habitCells(columns: ReturnType<typeof habitColumns>, log: ExportLog | undefined, date: string): Row {
  const entries = new Map((log?.entries ?? []).map((entry) => [entry.habitId, entry]));
  return Object.fromEntries(columns.map(({ habit, column }) => [column, habitCell(habit, entries.get(habit.id), date)]));
}

/** Daily: one row per person per day of the period, from the day they joined up to their group's today. */
export function buildDailyReport(input: LogReportInput): ExportTable {
  const columns = habitColumns(input.habits, 'daily', input.from, input.to);
  const logs = logsByKey(input.logs);
  const rows: Row[] = [];
  for (const person of input.people) {
    const group = groupOf(input.groups, person.groupId);
    const today = todayIn(group?.timezone ?? DEFAULT_TIMEZONE, input.now);
    const last = input.to < today ? input.to : today;
    for (let date = input.from > person.joinedAt ? input.from : person.joinedAt; date <= last; date = addDays(date, 1)) {
      const log = logs.get(`${person.id}|${date}`);
      const status = log ? computeDayStatus(input.habits, log.entries, date, input.settings.thresholdPct) : null;
      rows.push({
        [h.student]: person.fullName,
        [h.group]: group?.name ?? '',
        [h.date]: date,
        [h.hijri]: toHijri(date, input.settings.hijriAdjustment).formatted,
        ...habitCells(columns, log, date),
        [h.dayPct]: status?.completionPct ?? null,
        [h.state]: stateLabel(status),
        [h.note]: log?.note ?? '',
      });
    }
  }
  return {
    headers: [h.student, h.group, h.date, h.hijri, ...columns.map((c) => c.column), h.dayPct, h.state, h.note],
    rows: rows.sort(byGroupNameDate(h.date)),
  };
}

/**
 * BR-01/BR-02 for a weekly log: the same weights and threshold as a day, over the weekly habits active on
 * the week's first day. computeDayStatus reads daily habits only, so the weekly ones are handed in as such.
 */
function weekStatus(habits: HabitDef[], entries: EntryInput[], weekStart: string, thresholdPct: number): DayStatus {
  const weekly = habits.filter((habit) => habit.frequency === 'weekly').map((habit) => ({ ...habit, frequency: 'daily' as const }));
  return computeDayStatus(weekly, entries, weekStart, thresholdPct);
}

/** Week starts (the group's week_starts_on) that fall inside the period. */
function weekStartsIn(from: string, to: string, weekStartsOn: number): string[] {
  let start = weekStartFor(from, weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6);
  if (start < from) start = addDays(start, 7);
  const starts: string[] = [];
  for (; start <= to; start = addDays(start, 7)) starts.push(start);
  return starts;
}

/** Weekly: one row per person per week starting in the period, from the week they joined to the current one. */
export function buildWeeklyReport(input: LogReportInput): ExportTable {
  const columns = habitColumns(input.habits, 'weekly', input.from, input.to);
  const logs = logsByKey(input.logs);
  const rows: Row[] = [];
  for (const person of input.people) {
    const group = groupOf(input.groups, person.groupId);
    const weekStartsOn = (group?.weekStartsOn ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const today = todayIn(group?.timezone ?? DEFAULT_TIMEZONE, input.now);
    const joinedWeek = weekStartFor(person.joinedAt, weekStartsOn);
    for (const week of weekStartsIn(input.from, input.to, weekStartsOn)) {
      if (week < joinedWeek || week > today) continue;
      const log = logs.get(`${person.id}|${week}`);
      const status = log ? weekStatus(input.habits, log.entries, week, input.settings.thresholdPct) : null;
      rows.push({
        [h.student]: person.fullName,
        [h.group]: group?.name ?? '',
        [h.weekStart]: week,
        [h.hijriShort]: toHijri(week, input.settings.hijriAdjustment).formatted,
        ...habitCells(columns, log, week),
        [h.pct]: status?.completionPct ?? null,
        [h.state]: stateLabel(status),
        [h.review]: log?.reviewText ?? '',
        [h.request]: log?.supportRequestText ?? '',
        [h.requestStatus]: log ? t.support[log.supportStatus] : '',
      });
    }
  }
  return {
    headers: [
      h.student,
      h.group,
      h.weekStart,
      h.hijriShort,
      ...columns.map((c) => c.column),
      h.pct,
      h.state,
      h.review,
      h.request,
      h.requestStatus,
    ],
    rows: rows.sort(byGroupNameDate(h.weekStart)),
  };
}

export interface ExportSession {
  id: string;
  date: string;
  title: string | null;
}

export interface ExportMark {
  sessionId: string;
  userId: string;
  status: 'present' | 'absent' | 'excused';
  recordedBy: string | null;
}

export interface AttendanceReportInput {
  sessions: ExportSession[];
  marks: ExportMark[];
  /** The marked people and the recorders the viewer may see (a recorder they may not see stays empty). */
  people: Array<Pick<ExportPerson, 'id' | 'fullName' | 'groupId'>>;
  groups: ExportGroup[];
  settings: ExportSettings;
}

/** Attendance: one row per mark of the sessions given, by session date, group and name. */
export function buildAttendanceReport(input: AttendanceReportInput): ExportTable {
  const sessions = new Map(input.sessions.map((session) => [session.id, session]));
  const people = new Map(input.people.map((person) => [person.id, person]));
  const rows = input.marks.flatMap((mark): Row[] => {
    const session = sessions.get(mark.sessionId);
    if (!session) return [];
    const person = people.get(mark.userId);
    return [
      {
        [h.student]: person?.fullName ?? '',
        [h.group]: groupOf(input.groups, person?.groupId ?? null)?.name ?? '',
        [h.sessionDate]: session.date,
        [h.hijriShort]: toHijri(session.date, input.settings.hijriAdjustment).formatted,
        [h.sessionTitle]: session.title ?? '',
        [h.state]: t.attendance[mark.status],
        [h.recordedBy]: (mark.recordedBy && people.get(mark.recordedBy)?.fullName) ?? '',
      },
    ];
  });
  // Date first: the sessions are the report's spine.
  rows.sort(
    (a, b) =>
      compareDates(a[h.sessionDate], b[h.sessionDate]) ||
      collator.compare(String(a[h.group]), String(b[h.group])) ||
      collator.compare(String(a[h.student]), String(b[h.student])),
  );
  return {
    headers: [h.student, h.group, h.sessionDate, h.hijriShort, h.sessionTitle, h.state, h.recordedBy],
    rows,
  };
}
