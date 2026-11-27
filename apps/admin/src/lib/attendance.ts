// Attendance section (F-62): shapes, validation, section building and error codes shared by the Server
// Actions, the pages and the client components. Pure, so it is unit-tested without Next or Supabase.
import { z } from 'zod';

import { ar } from '@/messages/ar';

import type { GroupOption } from './students';

export type AttendanceStatus = 'present' | 'absent' | 'excused';
export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused'] as const satisfies readonly AttendanceStatus[];

/** A row of the sessions list. */
export interface SessionRow {
  id: string;
  /** null = a shared session for every group. */
  groupId: string | null;
  groupName: string | null;
  /** `YYYY-MM-DD` */
  date: string;
  title: string | null;
  /** The viewer's people with a saved mark, out of those the viewer marks in this session. */
  marked: number;
  total: number;
}

export interface SessionDetail {
  id: string;
  groupId: string | null;
  groupName: string | null;
  date: string;
  title: string | null;
}

/** A tracked, active person who is marked in a session. */
export interface Member {
  id: string;
  fullName: string;
  groupId: string;
}

export interface Mark {
  userId: string;
  status: AttendanceStatus;
  /** timestamptz, ISO */
  recordedAt: string;
}

export interface MemberSection {
  group: GroupOption;
  members: Member[];
}

/**
 * The grid's sections. A group session has the one section of its group, when the viewer marks that
 * group; a shared session has one section per group the viewer marks (admin: every group; supervisor:
 * the supervised ones), leaving out groups with nobody to mark. `groups` sets the order.
 */
export function buildSections(sessionGroupId: string | null, groups: GroupOption[], members: Member[]): MemberSection[] {
  const shown = sessionGroupId ? groups.filter((group) => group.id === sessionGroupId) : groups;
  const sections = shown.map((group) => ({ group, members: members.filter((m) => m.groupId === group.id) }));
  return sessionGroupId ? sections : sections.filter((section) => section.members.length > 0);
}

export interface MarkCounts {
  marked: number;
  total: number;
  present: number;
  absent: number;
  excused: number;
  /** The latest recorded_at among the counted marks, or null without any. */
  lastSavedAt: string | null;
}

/** Saved marks of the people in `sections` (marks of anyone no longer listed are left out). */
export function countMarks(sections: MemberSection[], marks: Mark[]): MarkCounts {
  const shown = new Set(sections.flatMap((section) => section.members.map((m) => m.id)));
  const counted = marks.filter((mark) => shown.has(mark.userId));
  const by = (status: AttendanceStatus) => counted.filter((mark) => mark.status === status).length;
  const lastSavedAt = counted.reduce<string | null>(
    (latest, mark) => (latest === null || Date.parse(mark.recordedAt) > Date.parse(latest) ? mark.recordedAt : latest),
    null,
  );
  return {
    marked: counted.length,
    total: shown.size,
    present: by('present'),
    absent: by('absent'),
    excused: by('excused'),
    lastSavedAt,
  };
}

export type AttendanceErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_ITEM'
  | 'CREATE_FAILED'
  | 'SAVE_FAILED'
  | 'DELETE_FAILED';
export type SessionField = 'group_id' | 'session_date' | 'title';

/** Outcome of an attendance Server Action that did not redirect. */
export type AttendanceResult =
  | { ok: true; saved?: number }
  | { ok: false; code: AttendanceErrorCode; fields?: SessionField[] };

/** The «مجلس جديد» values. `group_id` null = a shared session; '' = none picked yet (invalid). */
export interface NewSession {
  group_id: string | null;
  session_date: string;
  title: string | null;
}

const FIELD_ORDER: SessionField[] = ['group_id', 'session_date', 'title'];
export const TITLE_MAX = 200;

const newSessionSchema = z.object({
  group_id: z.uuid().nullable(),
  session_date: z.iso.date(),
  title: z
    .string()
    .trim()
    .max(TITLE_MAX)
    .nullable()
    .transform((title) => title || null),
});

export function parseNewSession(
  values: NewSession,
): { ok: true; value: NewSession } | { ok: false; fields: SessionField[] } {
  const result = newSessionSchema.safeParse(values);
  if (result.success) return { ok: true, value: result.data };
  const named = new Set(result.error.issues.map((issue) => issue.path[0]));
  return { ok: false, fields: FIELD_ORDER.filter((field) => named.has(field)) };
}

export interface AttendanceRowInput {
  userId: string;
  status: AttendanceStatus;
}

const saveSchema = z.object({
  sessionId: z.uuid(),
  rows: z
    .array(z.object({ userId: z.uuid(), status: z.enum(ATTENDANCE_STATUSES) }))
    .min(1)
    .refine((rows) => new Set(rows.map((row) => row.userId)).size === rows.length),
});

/** The marked rows «حفظ» sends: at least one, each person once, never the unmarked state. */
export function parseSaveAttendance(
  sessionId: string,
  rows: AttendanceRowInput[],
): { ok: true; value: { sessionId: string; rows: AttendanceRowInput[] } } | { ok: false } {
  const result = saveSchema.safeParse({ sessionId, rows });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

// Typed so a new code without a message fails to compile.
const ERROR_TEXT: Record<AttendanceErrorCode, string> = ar.attendance.errors;

/** The message for a failed action result; null when there is nothing to show. */
export function attendanceErrorText(result: AttendanceResult | null): string | null {
  return result && !result.ok ? ERROR_TEXT[result.code] : null;
}
