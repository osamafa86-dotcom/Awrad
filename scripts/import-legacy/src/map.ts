// From parsed sheets to an import plan: the mapping (form columns → habits, sheet names → profiles,
// with fuzzy suggestions that are never auto-accepted) and planImport, which turns every response
// into a save_log payload and sorts out duplicates, unmapped names, invalid dates and row errors.
// Pure: no database here (run.ts loads the catalogue and executes the plan).
import {
  cleanText,
  parseLegacyDate,
  parseTimestamp,
  parseTristate,
  splitChecklist,
  type DateOrder,
  type LegacyAttendanceRow,
  type LegacyDailyRow,
} from './parse.ts';

export type Frequency = 'daily' | 'weekly';
export type EntryStatus = 'done' | 'not_done' | 'not_required';
export type AttendanceStatus = 'present' | 'absent' | 'excused';
export type BlankPolicy = 'not_required' | 'not_done';
export type Source = 'daily' | 'weekly' | 'attendance';

interface Dated {
  activeFrom: string;
  activeTo: string | null;
}
export interface HabitItemInfo extends Dated {
  id: string;
  name: string;
}
export interface HabitInfo extends Dated {
  id: string;
  slug: string;
  name: string;
  kind: 'tristate' | 'checklist';
  frequency: Frequency;
  items: HabitItemInfo[];
}
export interface ProfileInfo {
  id: string;
  fullName: string;
  groupId: string | null;
  /** The week start of the profile's group (0 = Sunday, the default without a group). */
  weekStartsOn: number;
}
export interface GroupInfo {
  id: string;
  name: string;
  weekStartsOn: number;
}

export interface LegacyData {
  daily?: LegacyDailyRow[];
  weekly?: LegacyDailyRow[];
  attendance?: LegacyAttendanceRow[];
}

// ───────────── mapping.json ─────────────
/** A habit slug, or for a checklist `{ slug, items: { "<form option>": "<habit item name>" } }`. */
export type ColumnSpec = string | { slug: string; items?: Record<string, string> };
/** A profile id, an account to create (inactive, placeholder email), or null = not imported. */
export type StudentSpec =
  string | { createMissingAsInactive: true; groupId?: string | null } | null;
export interface MappingFile {
  blankPolicy?: BlankPolicy;
  dateOrder?: DateOrder;
  daily?: Record<string, ColumnSpec>;
  weekly?: Record<string, ColumnSpec>;
  students: Record<string, StudentSpec>;
}

// ───────────── resolved mapping ─────────────
export interface ColumnTarget {
  header: string;
  habit: HabitInfo;
  /** Form option label → habit item name (labels not listed are item names themselves). */
  itemLabels: Record<string, string>;
}
export type StudentTarget =
  | { kind: 'profile'; profileId: string; weekStartsOn: number }
  | { kind: 'create'; name: string; groupId: string | null; weekStartsOn: number };
export interface Suggestion {
  profileId: string;
  fullName: string;
  distance: number;
}
export interface Mapping {
  blankPolicy: BlankPolicy;
  dateOrder: DateOrder;
  habits: HabitInfo[];
  daily: ColumnTarget[];
  weekly: ColumnTarget[];
  /** Every sheet name seen (and every name in the file); null = not imported. */
  students: Record<string, StudentTarget | null>;
  /** Near matches (≤ 2 edits after normalisation) for each name without a target. */
  suggestions: Record<string, Suggestion[]>;
}

// ───────────── plan ─────────────
export interface PlannedEntry {
  habit_id: string;
  status: EntryStatus;
  checked_item_ids?: string[];
}
export interface PlannedLog {
  source: 'daily' | 'weekly';
  row: number;
  name: string;
  target: StudentTarget;
  period: Frequency;
  periodStart: string;
  entries: PlannedEntry[];
}
export interface PlannedAttendance {
  row: number;
  name: string;
  target: StudentTarget;
  date: string;
  status: AttendanceStatus;
}
export type RowErrorCode = 'INACTIVE_HABIT' | 'INVALID_ITEM' | 'INVALID_VALUE';
export interface RowError {
  source: Source;
  row: number;
  name: string;
  date: string;
  code: RowErrorCode;
  column: string;
  value: string;
}
export interface ImportPlan {
  toImport: PlannedLog[];
  attendance: PlannedAttendance[];
  duplicatesResolved: {
    source: Source;
    row: number;
    name: string;
    periodStart: string;
    keptRow: number;
  }[];
  unmappedNames: { name: string; rows: number; suggestions: Suggestion[] }[];
  invalidDates: { source: Source; row: number; name: string; value: string }[];
  rowErrors: RowError[];
  accountsToCreate: { name: string; groupId: string | null }[];
  ignoredColumns: { source: 'daily' | 'weekly'; header: string }[];
}

const MAX_SUGGESTION_DISTANCE = 2;

/**
 * Arabic name normalisation for matching: drops tashkeel (U+064B–U+0652) and tatweel, unifies
 * أ إ آ → ا, ؤ → و, ئ → ي, ة → ه, ى → ي, drops a leading «ال» from each word, collapses spaces.
 */
export function normalizeArabicName(name: string): string {
  return name
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => (word.startsWith('ال') && word.length > 3 ? word.slice(2) : word))
    .join(' ');
}

/** Edit distance (insertions, deletions, substitutions), by code point. */
export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[y.length]!;
}

/** Profiles within 2 edits of `name` after normalisation, nearest first. Suggestions only. */
export function suggestNames(name: string, profiles: ProfileInfo[]): Suggestion[] {
  const target = normalizeArabicName(name);
  return profiles
    .map((p) => ({
      profileId: p.id,
      fullName: p.fullName,
      distance: levenshtein(target, normalizeArabicName(p.fullName)),
    }))
    .filter((s) => s.distance <= MAX_SUGGESTION_DISTANCE)
    .sort((a, b) => a.distance - b.distance || a.fullName.localeCompare(b.fullName, 'ar'));
}

function sheetNames(rows: LegacyData): string[] {
  const names = [
    ...(rows.daily ?? []).map((r) => r.name),
    ...(rows.weekly ?? []).map((r) => r.name),
    ...(rows.attendance ?? []).map((r) => r.name),
  ];
  return [...new Set(names)];
}

function answerHeaders(rows: LegacyDailyRow[] | undefined): string[] {
  return [...new Set((rows ?? []).flatMap((r) => Object.keys(r.answers)))];
}

function guessColumns(
  headers: string[],
  habits: HabitInfo[],
  frequency: Frequency,
): ColumnTarget[] {
  const columns: ColumnTarget[] = [];
  for (const header of headers) {
    const h = normalizeArabicName(header);
    const habit = habits.find((candidate) => {
      if (candidate.frequency !== frequency) return false;
      const n = normalizeArabicName(candidate.name);
      return h === n || h.startsWith(`${n} `);
    });
    if (habit) columns.push({ header, habit, itemLabels: {} });
  }
  return columns;
}

function resolveColumns(
  specs: Record<string, ColumnSpec> | undefined,
  habits: HabitInfo[],
  frequency: Frequency,
  errors: string[],
): ColumnTarget[] {
  const columns: ColumnTarget[] = [];
  for (const [rawHeader, spec] of Object.entries(specs ?? {})) {
    const header = cleanText(rawHeader);
    const slug = typeof spec === 'string' ? spec : spec?.slug;
    const habit = habits.find((h) => h.slug === slug);
    if (!habit) {
      errors.push(`العمود «${header}»: لا عادة بالمعرّف ${String(slug)}`);
      continue;
    }
    if (habit.frequency !== frequency) {
      errors.push(`العمود «${header}»: العادة ${habit.slug} ليست ضمن ملف ${frequency}`);
      continue;
    }
    const itemLabels = typeof spec === 'string' ? {} : (spec.items ?? {});
    for (const itemName of Object.values(itemLabels)) {
      if (!habit.items.some((item) => item.name === itemName)) {
        errors.push(`العمود «${header}»: لا بند باسم «${itemName}» في ${habit.slug}`);
      }
    }
    columns.push({ header, habit, itemLabels });
  }
  return columns;
}

/**
 * The mapping for these rows. With a reviewed `file`, its columns and students are authoritative
 * (names it does not list are not imported) and every reference is checked against the catalogue.
 * Without one it is the draft to review: columns guessed from habit names, and only an exact
 * name match is accepted. Either way names without a target get suggestions, never targets.
 */
export function buildMapping(
  rows: LegacyData,
  habits: HabitInfo[],
  profiles: ProfileInfo[],
  options: { file?: MappingFile; groups?: GroupInfo[] } = {},
): Mapping {
  const { file, groups = [] } = options;
  const errors: string[] = [];
  const students: Record<string, StudentTarget | null> = {};
  let daily: ColumnTarget[];
  let weekly: ColumnTarget[];

  if (file) {
    daily = resolveColumns(file.daily, habits, 'daily', errors);
    weekly = resolveColumns(file.weekly, habits, 'weekly', errors);
    for (const [rawName, spec] of Object.entries(file.students ?? {})) {
      const name = cleanText(rawName);
      if (spec === null) {
        students[name] = null;
      } else if (typeof spec === 'string') {
        const profile = profiles.find((p) => p.id === spec);
        if (profile) {
          students[name] = {
            kind: 'profile',
            profileId: profile.id,
            weekStartsOn: profile.weekStartsOn,
          };
        } else errors.push(`الطالب «${name}»: لا ملف بالمعرّف ${spec}`);
      } else if (spec.createMissingAsInactive === true) {
        const groupId = spec.groupId ?? null;
        const group = groupId === null ? null : groups.find((g) => g.id === groupId);
        if (group === undefined) errors.push(`الطالب «${name}»: لا مجموعة بالمعرّف ${groupId}`);
        else
          students[name] = {
            kind: 'create',
            name,
            groupId,
            weekStartsOn: group?.weekStartsOn ?? 0,
          };
      } else errors.push(`الطالب «${name}»: قيمة غير مفهومة`);
    }
  } else {
    daily = guessColumns(answerHeaders(rows.daily), habits, 'daily');
    weekly = guessColumns(answerHeaders(rows.weekly), habits, 'weekly');
  }
  if (file?.blankPolicy && !['not_required', 'not_done'].includes(file.blankPolicy)) {
    errors.push(`blankPolicy غير صالحة: ${file.blankPolicy}`);
  }
  if (file?.dateOrder && !['dmy', 'mdy'].includes(file.dateOrder)) {
    errors.push(`dateOrder غير صالحة: ${file.dateOrder}`);
  }
  if (errors.length > 0) throw new Error(`ملف الربط غير صالح:\n- ${errors.join('\n- ')}`);

  for (const name of sheetNames(rows)) {
    if (name in students) continue;
    if (file) {
      students[name] = null;
      continue;
    }
    const exact = profiles.filter((p) => cleanText(p.fullName) === name);
    students[name] =
      exact.length === 1
        ? { kind: 'profile', profileId: exact[0]!.id, weekStartsOn: exact[0]!.weekStartsOn }
        : null;
  }
  const suggestions: Record<string, Suggestion[]> = {};
  for (const [name, target] of Object.entries(students)) {
    if (target === null) suggestions[name] = suggestNames(name, profiles);
  }

  return {
    blankPolicy: file?.blankPolicy ?? 'not_required',
    dateOrder: file?.dateOrder ?? 'dmy',
    habits,
    daily,
    weekly,
    students,
    suggestions,
  };
}

/** The mapping as a mapping.json (the draft written for review: null = still to decide). */
export function toMappingFile(mapping: Mapping): MappingFile {
  const columns = (list: ColumnTarget[]) =>
    Object.fromEntries(
      list.map((c): [string, ColumnSpec] => [
        c.header,
        Object.keys(c.itemLabels).length > 0
          ? { slug: c.habit.slug, items: c.itemLabels }
          : c.habit.slug,
      ]),
    );
  const students = Object.fromEntries(
    Object.entries(mapping.students).map(([name, target]): [string, StudentSpec] => [
      name,
      target === null
        ? null
        : target.kind === 'profile'
          ? target.profileId
          : { createMissingAsInactive: true, groupId: target.groupId },
    ]),
  );
  return {
    blankPolicy: mapping.blankPolicy,
    dateOrder: mapping.dateOrder,
    daily: columns(mapping.daily),
    weekly: columns(mapping.weekly),
    students,
  };
}

// ───────────── planImport ─────────────
const isActiveOn = (dated: Dated, date: string) =>
  dated.activeFrom <= date && (dated.activeTo === null || date <= dated.activeTo);

/** The start of the week holding `date` (as SQL week_start(): 0 = Sunday). */
export function weekStart(date: string, weekStartsOn: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekStartsOn + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const targetKey = (target: StudentTarget) =>
  target.kind === 'profile' ? target.profileId : `create:${target.name}`;

const ATTENDANCE_VALUES: Record<string, AttendanceStatus> = {
  حاضر: 'present',
  غائب: 'absent',
  معتذر: 'excused',
  مستأذن: 'excused',
  بعذر: 'excused',
  'غائب بعذر': 'excused',
};

type CellResult = { entry: PlannedEntry } | { error: { code: RowErrorCode; value: string } };

function cellEntry(
  habit: HabitInfo,
  column: ColumnTarget | undefined,
  cell: string,
  date: string,
  blankPolicy: BlankPolicy,
): CellResult {
  const status = parseTristate(cell);
  if (status === 'blank') {
    const entry: PlannedEntry = { habit_id: habit.id, status: blankPolicy };
    if (habit.kind === 'checklist' && blankPolicy === 'not_done') entry.checked_item_ids = [];
    return { entry };
  }
  if (status === 'not_required') return { entry: { habit_id: habit.id, status } };
  if (habit.kind === 'tristate') {
    if (status === 'invalid') return { error: { code: 'INVALID_VALUE', value: cell } };
    return { entry: { habit_id: habit.id, status } };
  }
  const active = habit.items.filter((item) => isActiveOn(item, date));
  const checked: string[] = [];
  for (const label of splitChecklist(cell)) {
    const itemName = column?.itemLabels[label] ?? label;
    const item = active.find((candidate) => cleanText(candidate.name) === cleanText(itemName));
    if (!item) return { error: { code: 'INVALID_ITEM', value: label } };
    if (!checked.includes(item.id)) checked.push(item.id);
  }
  const done = active.every((item) => checked.includes(item.id));
  return {
    entry: { habit_id: habit.id, status: done ? 'done' : 'not_done', checked_item_ids: checked },
  };
}

interface Candidate {
  log: PlannedLog;
  stamp: string;
  errors: RowError[];
}

/**
 * Turns the parsed sheets into what executeImport will write: per (student, period, day/week) the
 * newest response by timestamp (ties: the later row), with an entry for every habit active on that
 * date (blank cells per `blankPolicy`, BR-14). Rows of unmapped names, with invalid dates or with a
 * row error (an answer for a habit archived on that date, an unknown checklist option, an
 * unreadable answer) are reported, not imported.
 */
export function planImport(rows: LegacyData, mapping: Mapping): ImportPlan {
  const plan: ImportPlan = {
    toImport: [],
    attendance: [],
    duplicatesResolved: [],
    unmappedNames: [],
    invalidDates: [],
    rowErrors: [],
    accountsToCreate: [],
    ignoredColumns: [],
  };
  const unmapped = new Map<string, number>();
  const countUnmapped = (name: string) => unmapped.set(name, (unmapped.get(name) ?? 0) + 1);

  for (const period of ['daily', 'weekly'] as const) {
    const sheet = rows[period] ?? [];
    const columns = mapping[period];
    for (const header of answerHeaders(sheet)) {
      if (!columns.some((c) => c.header === header)) {
        plan.ignoredColumns.push({ source: period, header });
      }
    }
    const kept = new Map<string, Candidate>();
    for (const row of sheet) {
      const target = mapping.students[row.name] ?? null;
      if (target === null) {
        countUnmapped(row.name);
        continue;
      }
      const date =
        row.date === null
          ? (parseTimestamp(row.timestamp, mapping.dateOrder)?.slice(0, 10) ?? null)
          : parseLegacyDate(row.date, mapping.dateOrder);
      if (date === null) {
        plan.invalidDates.push({
          source: period,
          row: row.row,
          name: row.name,
          value: row.date ?? row.timestamp,
        });
        continue;
      }
      const errors: RowError[] = [];
      const entries: PlannedEntry[] = [];
      const fail = (column: string, code: RowErrorCode, value: string) =>
        errors.push({ source: period, row: row.row, name: row.name, date, code, column, value });
      for (const habit of mapping.habits) {
        if (habit.frequency !== period || !isActiveOn(habit, date)) continue;
        const column = columns.find((c) => c.habit.id === habit.id);
        const cell = column ? (row.answers[column.header] ?? '') : '';
        const result = cellEntry(habit, column, cell, date, mapping.blankPolicy);
        if ('error' in result) fail(column!.header, result.error.code, result.error.value);
        else entries.push(result.entry);
      }
      for (const column of columns) {
        const cell = row.answers[column.header] ?? '';
        if (!isActiveOn(column.habit, date) && cell !== '')
          fail(column.header, 'INACTIVE_HABIT', cell);
      }
      const periodStart = period === 'weekly' ? weekStart(date, target.weekStartsOn) : date;
      const candidate: Candidate = {
        log: { source: period, row: row.row, name: row.name, target, period, periodStart, entries },
        stamp: parseTimestamp(row.timestamp, mapping.dateOrder) ?? '',
        errors,
      };
      const key = `${targetKey(target)}|${periodStart}`;
      const previous = kept.get(key);
      // Rows arrive in sheet order, so on a timestamp tie the later row wins.
      const [winner, loser] =
        previous === undefined || candidate.stamp >= previous.stamp
          ? [candidate, previous]
          : [previous, candidate];
      kept.set(key, winner);
      if (loser) {
        plan.duplicatesResolved.push({
          source: period,
          row: loser.log.row,
          name: loser.log.name,
          periodStart,
          keptRow: winner.log.row,
        });
      }
    }
    const winners = [...kept.values()].sort((a, b) => a.log.row - b.log.row);
    for (const { log, errors } of winners) {
      if (errors.length > 0) plan.rowErrors.push(...errors);
      else plan.toImport.push(log);
    }
  }
  plan.duplicatesResolved.sort((a, b) => a.source.localeCompare(b.source) || a.row - b.row);
  plan.rowErrors.sort((a, b) => a.source.localeCompare(b.source) || a.row - b.row);

  planAttendance(rows.attendance ?? [], mapping, plan, countUnmapped);

  plan.unmappedNames = [...unmapped].map(([name, count]) => ({
    name,
    rows: count,
    suggestions: mapping.suggestions[name] ?? [],
  }));
  const creates = new Map<string, { name: string; groupId: string | null }>();
  for (const { target } of [...plan.toImport, ...plan.attendance]) {
    if (target.kind === 'create' && !creates.has(target.name)) {
      creates.set(target.name, { name: target.name, groupId: target.groupId });
    }
  }
  plan.accountsToCreate = [...creates.values()];
  return plan;
}

function planAttendance(
  sheet: LegacyAttendanceRow[],
  mapping: Mapping,
  plan: ImportPlan,
  countUnmapped: (name: string) => void,
): void {
  const headerDates = new Map<string, string | null>();
  for (const header of new Set(sheet.flatMap((r) => r.marks.map((m) => m.date)))) {
    const date = parseLegacyDate(header, mapping.dateOrder);
    headerDates.set(header, date);
    if (date === null)
      plan.invalidDates.push({ source: 'attendance', row: 1, name: '', value: header });
  }
  const kept = new Map<string, PlannedAttendance>();
  for (const row of sheet) {
    const target = mapping.students[row.name] ?? null;
    if (target === null) {
      countUnmapped(row.name);
      continue;
    }
    for (const mark of row.marks) {
      const date = headerDates.get(mark.date) ?? null;
      if (mark.value === '' || date === null) continue;
      const status = ATTENDANCE_VALUES[mark.value];
      if (!status) {
        plan.rowErrors.push({
          source: 'attendance',
          row: row.row,
          name: row.name,
          date,
          code: 'INVALID_VALUE',
          column: mark.date,
          value: mark.value,
        });
        continue;
      }
      const key = `${targetKey(target)}|${date}`;
      const previous = kept.get(key);
      if (previous) {
        plan.duplicatesResolved.push({
          source: 'attendance',
          row: previous.row,
          name: previous.name,
          periodStart: date,
          keptRow: row.row,
        });
      }
      kept.set(key, { row: row.row, name: row.name, target, date, status });
    }
  }
  plan.attendance = [...kept.values()].sort(
    (a, b) => a.row - b.row || a.date.localeCompare(b.date),
  );
}
