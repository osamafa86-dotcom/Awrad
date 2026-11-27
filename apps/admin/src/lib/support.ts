// Support inbox (F-64, BR-10) and account-deletion requests (§13): shapes, validation, the 30-day deadline
// and error codes shared by the Server Actions, the page and the client components. Pure, so it is
// unit-tested without Next or Supabase.
import { addDays, todayIn } from '@awrad/domain';
import { z } from 'zod';

import { ar } from '@/messages/ar';

export type SupportStatus = 'open' | 'handled';
export const SUPPORT_TABS = ['open', 'handled', 'deletion'] as const;
export type SupportTab = (typeof SUPPORT_TABS)[number];

/** A log that carries a support request (support_status open or handled). */
export interface SupportRequest {
  /** logs.id */
  id: string;
  userId: string;
  /** null when RLS hides the profile (should not happen: logs and profiles share the same visibility). */
  studentName: string | null;
  groupName: string | null;
  /** Requests come from weekly logs; a daily one is shown with its frequency chip. */
  period: 'daily' | 'weekly';
  /** `YYYY-MM-DD`: the day, or the first day of the week. */
  periodStart: string;
  reviewText: string | null;
  requestText: string;
  status: SupportStatus;
  /** timestamptz, ISO; null while open. */
  handledAt: string | null;
  /** null while open, or when the viewer may not read the handler's profile (a supervisor, an admin's). */
  handledByName: string | null;
  handledNote: string | null;
}

/** An open account-deletion request (deletion_requests.handled_at is null). */
export interface DeletionRequest {
  id: string;
  userId: string;
  studentName: string | null;
  groupName: string | null;
  /** timestamptz, ISO */
  requestedAt: string;
}

/** «المعالَجة» lists the requests handled in this many days. */
export const HANDLED_WINDOW_DAYS = 90;

/** §13: the admin executes a deletion request within this many days. */
export const DELETION_DEADLINE_DAYS = 30;

export const NOTE_MAX = 2000;

/** The deadline day of a deletion request (in `timeZone`) and whether `today` is past it. */
export function deletionDeadline(requestedAt: string, timeZone: string, today: string): { date: string; overdue: boolean } {
  const date = addDays(todayIn(timeZone, new Date(requestedAt)), DELETION_DEADLINE_DAYS);
  return { date, overdue: today > date };
}

export type SupportErrorCode = 'FORBIDDEN' | 'INVALID_INPUT' | 'INVALID_ITEM' | 'SAVE_FAILED';

/** Outcome of a support Server Action. */
export type SupportResult = { ok: true } | { ok: false; code: SupportErrorCode };

const handleSchema = z.object({
  logId: z.uuid(),
  note: z
    .string()
    .trim()
    .max(NOTE_MAX)
    .nullable()
    .transform((note) => note || null),
});

/** «تمّت المعالجة»: the log id and the optional internal note (trimmed; empty → null). */
export function parseHandleSupport(
  logId: string,
  note: string | null,
): { ok: true; value: { logId: string; note: string | null } } | { ok: false } {
  const result = handleSchema.safeParse({ logId, note });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

/** «رفض الطلب»: a deletion request id. */
export function parseRequestId(id: string): { ok: true; value: string } | { ok: false } {
  const result = z.uuid().safeParse(id);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

// Typed so a new code without a message fails to compile.
const ERROR_TEXT: Record<SupportErrorCode, string> = ar.support.errors;

/** The message for a failed action result; null when there is nothing to show. */
export function supportErrorText(result: SupportResult | null): string | null {
  return result && !result.ok ? ERROR_TEXT[result.code] : null;
}
