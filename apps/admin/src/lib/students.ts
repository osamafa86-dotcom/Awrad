// Students section (F-61): shapes, form validation and error codes shared by the Server Actions, the
// pages and the client components. Pure, so it is unit-tested without Next or Supabase.
import { z } from 'zod';

import { ar } from '@/messages/ar';

import type { Role } from './access';

/** The zone «today» is taken in when the form has no other: the app default (spec §5). */
export const DEFAULT_TIMEZONE = 'Asia/Riyadh';

export type StudentStatus = 'active' | 'inactive';

export interface StudentRow {
  id: string;
  fullName: string;
  role: Role;
  groupId: string | null;
  groupName: string | null;
  isActive: boolean;
  isTracked: boolean;
  /** `YYYY-MM-DD` */
  joinedAt: string;
}

export interface GroupOption {
  id: string;
  name: string;
}

/** The list filters the server applies (URL search params `group` and `status`). */
export interface StudentFilters {
  group?: string;
  status?: StudentStatus;
}

/** Reads the shareable list filters from the page's search params; anything unknown is ignored. */
export function parseFilters(params: Record<string, string | string[] | undefined>): StudentFilters {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const group = one(params.group);
  const status = one(params.status);
  return {
    ...(group && z.uuid().safeParse(group).success ? { group } : {}),
    ...(status === 'active' || status === 'inactive' ? { status } : {}),
  };
}

export type InviteErrorCode = 'FORBIDDEN' | 'EMAIL_EXISTS' | 'INVALID_INPUT' | 'INVITE_FAILED';
export type StudentErrorCode = InviteErrorCode | 'SELF_FORBIDDEN' | 'SAVE_FAILED' | 'DELETE_FAILED';
export type StudentField = 'email' | 'full_name' | 'group_id' | 'joined_at';

/** Outcome of a students Server Action that did not redirect. `fields` names the invalid inputs. */
export type StudentResult = { ok: true } | { ok: false; code: StudentErrorCode; fields?: StudentField[] };

type Parsed<T> = { ok: true; value: T } | { ok: false; fields: StudentField[] };

const FIELD_ORDER: StudentField[] = ['email', 'full_name', 'group_id', 'joined_at'];

function invalidFields(error: z.ZodError): StudentField[] {
  const named = new Set(error.issues.map((issue) => issue.path[0]));
  return FIELD_ORDER.filter((field) => named.has(field));
}

const fullName = z.string().trim().min(1);

/** The body sent to the invite-user Edge Function from the «دعوة طالب» form. */
export interface InviteBody {
  email: string;
  full_name: string;
  role: 'student';
  group_id: string;
  joined_at: string;
  is_tracked: boolean;
}

/**
 * Validates the invite form (a09). The role is always `student` here; joined_at defaults to `today` and
 * may not be after it; is_tracked arrives as the toggle's hidden "true"/"false" and defaults to true.
 */
export function parseInviteForm(form: FormData, today: string): Parsed<InviteBody> {
  const text = (name: string) => String(form.get(name) ?? '');
  const schema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    full_name: fullName,
    group_id: z.uuid(),
    joined_at: z.iso.date().refine((date) => date <= today),
  });
  const result = schema.safeParse({
    email: text('email'),
    full_name: text('full_name'),
    group_id: text('group_id'),
    joined_at: text('joined_at') || today,
  });
  if (!result.success) return { ok: false, fields: invalidFields(result.error) };
  return {
    ok: true,
    value: { ...result.data, role: 'student', is_tracked: text('is_tracked') !== 'false' },
  };
}

/** The profile fields an admin edits on the student page. */
export interface StudentUpdate {
  full_name: string;
  group_id: string | null;
  is_active: boolean;
  is_tracked: boolean;
  joined_at: string;
}

const updateSchema = z.object({
  full_name: fullName,
  group_id: z.uuid().nullable(),
  is_active: z.boolean(),
  is_tracked: z.boolean(),
  joined_at: z.iso.date(),
});

export function parseStudentUpdate(values: StudentUpdate): Parsed<StudentUpdate> {
  const result = updateSchema.safeParse(values);
  return result.success ? { ok: true, value: result.data } : { ok: false, fields: invalidFields(result.error) };
}

const INVITE_CODES: readonly InviteErrorCode[] = ['FORBIDDEN', 'EMAIL_EXISTS', 'INVALID_INPUT', 'INVITE_FAILED'];

/**
 * The code behind a failed `functions.invoke('invite-user')`: a FunctionsHttpError carries the function's
 * Response in `context`, whose JSON body is `{ code }`. Anything else (unreachable, relay error, a body
 * without one of our codes, e.g. the gateway's 401) is INVITE_FAILED.
 */
export async function inviteErrorCode(error: unknown): Promise<InviteErrorCode> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return 'INVITE_FAILED';
  try {
    const body = (await context.clone().json()) as { code?: unknown };
    return INVITE_CODES.find((code) => code === body.code) ?? 'INVITE_FAILED';
  } catch {
    return 'INVITE_FAILED';
  }
}

/** A PostgREST/RPC error that RLS or a FORBIDDEN raise produced. */
export function isForbidden(error: { code?: string; message?: string }): boolean {
  return error.code === '42501' || error.message === 'FORBIDDEN';
}

// Typed so a new code without a message fails to compile.
const ERROR_TEXT: Record<StudentErrorCode, string> = ar.students.errors;

/** The message for a failed action result; null when there is nothing to show. */
export function studentErrorText(result: StudentResult | null): string | null {
  return result && !result.ok ? ERROR_TEXT[result.code] : null;
}
