// send-reminders logic (spec §12, Ruling FN-1). Pure: no Deno globals; its only import is the copy, so the same
// module runs under the Supabase Edge Runtime (index.ts) and under Node/Vitest with fake dependencies.
import { REMINDER_COPY } from './messages.ts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const BATCH = 100;

export type ReminderKind = 'daily' | 'weekly';

/** A row of `due_reminders(p_now)`: sent_for is the local day (daily) or the week start (weekly). */
export interface DueReminder {
  user_id: string;
  kind: ReminderKind;
  sent_for: string;
  tokens: string[];
}

export type ReminderLogRow = Omit<DueReminder, 'tokens'>;

/** The slice of `fetch` the handler uses (a JSON POST). */
export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface SendDeps {
  /** `due_reminders(p_now)` with the service role. */
  dueReminders(now: Date): Promise<DueReminder[]>;
  fetch: FetchLike;
  /** Deletes these push_tokens rows (by token). */
  deleteTokens(tokens: string[]): Promise<void>;
  /** Inserts into reminder_log with `on conflict do nothing`. */
  logSent(rows: ReminderLogRow[]): Promise<void>;
}

export interface SendResult {
  /** Due (user, kind) reminders. */
  due: number;
  /** Messages Expo accepted (an ok ticket). */
  sent: number;
  /** Messages with an error ticket or in a batch that failed as a whole. */
  failed: number;
  deletedTokens: number;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { kind: ReminderKind };
}

interface Ticket {
  status?: string;
  details?: { error?: string };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function messagesFor(due: readonly DueReminder[]): PushMessage[] {
  return due.flatMap((reminder) =>
    reminder.tokens.map((to) => ({
      to,
      title: REMINDER_COPY.title,
      body: REMINDER_COPY[reminder.kind],
      sound: 'default' as const,
      data: { kind: reminder.kind },
    })),
  );
}

/** One Expo request; its tickets in message order, or null when the whole request failed. */
async function push(fetch: FetchLike, batch: PushMessage[]): Promise<Ticket[] | null> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: unknown };
    return Array.isArray(payload.data) ? (payload.data as Ticket[]) : null;
  } catch {
    return null;
  }
}

/**
 * Sends the reminders due at `now`: one push per token, 100 per Expo request; deletes the tokens Expo calls
 * DeviceNotRegistered; then logs every due reminder whatever Expo answered, so a failed hour is not resent.
 * Only `dueReminders` may throw (nothing to send without it); every later failure is counted, not thrown.
 */
export async function handleSend(deps: SendDeps, now: Date): Promise<SendResult> {
  const due = await deps.dueReminders(now);
  const result: SendResult = { due: due.length, sent: 0, failed: 0, deletedTokens: 0 };
  if (due.length === 0) return result;

  const unregistered: string[] = [];
  for (const batch of chunk(messagesFor(due), BATCH)) {
    const tickets = await push(deps.fetch, batch);
    batch.forEach((message, i) => {
      const ticket = tickets?.[i];
      if (ticket?.status === 'ok') {
        result.sent += 1;
        return;
      }
      result.failed += 1;
      if (ticket?.details?.error === 'DeviceNotRegistered') unregistered.push(message.to);
    });
  }

  const stale = [...new Set(unregistered)];
  if (stale.length > 0) {
    try {
      await deps.deleteTokens(stale);
      result.deletedTokens = stale.length;
    } catch {
      // Kept for the next run: Expo will say DeviceNotRegistered again.
    }
  }

  try {
    await deps.logSent(due.map(({ user_id, kind, sent_for }) => ({ user_id, kind, sent_for })));
  } catch {
    // Not fatal: at worst the same reminder goes out again next hour.
  }
  return result;
}

export type SendResponse =
  { status: 200; body: SendResult } | { status: 401; body: { code: 'UNAUTHORIZED' } };

/** Compares in time independent of where the strings first differ. */
function sameSecret(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** POST /send-reminders from the hourly job: `Authorization: Bearer <CRON_SECRET>`, else 401 and nothing sent. */
export async function handleRequest(
  req: { authorization: string | null; secret: string | undefined; now: Date },
  deps: SendDeps,
): Promise<SendResponse> {
  const given = /^Bearer\s+(.+)$/i.exec(req.authorization ?? '')?.[1] ?? '';
  if (!req.secret || !given || !sameSecret(given, req.secret)) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  return { status: 200, body: await handleSend(deps, req.now) };
}
