// invite-user logic (F-01, Ruling FN-1). Pure: no Deno globals and no imports, so the same module runs
// under the Supabase Edge Runtime (index.ts) and under Node/Vitest with fake dependencies.

export type Role = 'student' | 'supervisor' | 'admin';

/** The `invitations` row to insert; omitted joined_at / is_tracked fall back to the column defaults. */
export interface InvitationRow {
  email: string;
  full_name: string;
  role: Role;
  group_id: string | null;
  joined_at?: string;
  is_tracked?: boolean;
  invited_by: string;
}

export type CreateUserResult =
  { ok: true; id: string } | { ok: false; reason: 'EMAIL_EXISTS' | 'FAILED' };

export interface InviteDeps {
  /** The caller behind the request's JWT and whether they are an active admin; null without a valid session. */
  caller(): Promise<{ id: string; isAdmin: boolean } | null>;
  /** Inserts the pending invitation (service role) and returns its id. */
  insertInvitation(row: InvitationRow): Promise<string>;
  /** Withdraws an invitation whose account could not be created. */
  deleteInvitation(id: string): Promise<void>;
  /** Creates the confirmed auth user; the handle_new_user trigger builds the profile from the invitation. */
  createUser(user: { email: string; full_name: string }): Promise<CreateUserResult>;
  /** Sends the sign-in code email that doubles as the welcome; false when it could not be sent. */
  sendWelcome(email: string): Promise<boolean>;
}

export type InviteErrorCode = 'FORBIDDEN' | 'INVALID_INPUT' | 'EMAIL_EXISTS' | 'INVITE_FAILED';

export type InviteResponse =
  | { status: 200; body: { profile_id: string; welcome_sent: boolean } }
  | { status: 400 | 403 | 409 | 500; body: { code: InviteErrorCode } };

const ROLES: readonly Role[] = ['student', 'supervisor', 'admin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type Parsed = Omit<InvitationRow, 'invited_by'>;

/** Validates the request body `{ email, full_name, role, group_id, joined_at?, is_tracked? }`. */
export function parseInvite(body: unknown): Parsed | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  if (!EMAIL.test(email) || fullName === '') return null;
  if (!ROLES.includes(b.role as Role)) return null;

  const groupId = b.group_id ?? null;
  if (groupId !== null && (typeof groupId !== 'string' || !UUID.test(groupId))) return null;

  const row: Parsed = { email, full_name: fullName, role: b.role as Role, group_id: groupId };
  if (b.joined_at !== undefined) {
    if (typeof b.joined_at !== 'string' || !isDate(b.joined_at)) return null;
    row.joined_at = b.joined_at;
  }
  if (b.is_tracked !== undefined) {
    if (typeof b.is_tracked !== 'boolean') return null;
    row.is_tracked = b.is_tracked;
  }
  return row;
}

const fail = (status: 400 | 403 | 409 | 500, code: InviteErrorCode): InviteResponse => ({
  status,
  body: { code },
});

/**
 * POST /invite-user. Order matters: the caller must be an admin before anything else is looked at; the
 * invitation is written before the user so the trigger finds it; a failed account creation withdraws it.
 */
export async function handleInvite(body: unknown, deps: InviteDeps): Promise<InviteResponse> {
  const caller = await deps.caller();
  if (!caller?.isAdmin) return fail(403, 'FORBIDDEN');

  const input = parseInvite(body);
  if (!input) return fail(400, 'INVALID_INPUT');

  let invitationId: string;
  try {
    invitationId = await deps.insertInvitation({ ...input, invited_by: caller.id });
  } catch {
    return fail(500, 'INVITE_FAILED');
  }

  let created: CreateUserResult;
  try {
    created = await deps.createUser({ email: input.email, full_name: input.full_name });
  } catch {
    created = { ok: false, reason: 'FAILED' };
  }
  if (!created.ok) {
    await deps.deleteInvitation(invitationId).catch(() => undefined);
    return created.reason === 'EMAIL_EXISTS'
      ? fail(409, 'EMAIL_EXISTS')
      : fail(500, 'INVITE_FAILED');
  }

  const welcomeSent = await deps.sendWelcome(input.email).catch(() => false);
  return { status: 200, body: { profile_id: created.id, welcome_sent: welcomeSent } };
}
