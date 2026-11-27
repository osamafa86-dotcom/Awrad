import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXPO_PUSH_URL,
  chunk,
  handleRequest,
  handleSend,
  type DueReminder,
  type FetchLike,
  type SendDeps,
} from './handler';
import { REMINDER_COPY } from './messages';

const NOW = new Date('2026-11-28T18:00:00Z');
const SECRET = 'cron-secret-value';

const tokensOf = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `ExponentPushToken[${prefix}${i}]`);

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: string;
  channelId: string;
  data: { kind: string };
}

/** A fake Expo endpoint: answers every message with an ok ticket unless the token is listed. */
function fakeExpo(opts: { unregistered?: string[]; status?: number } = {}) {
  const requests: PushMessage[][] = [];
  const fetch = vi.fn<FetchLike>(async (url, init) => {
    expect(url).toBe(EXPO_PUSH_URL);
    const messages = JSON.parse(init.body) as PushMessage[];
    requests.push(messages);
    if (opts.status && opts.status >= 400) {
      return { ok: false, status: opts.status, json: async () => ({ errors: [{ code: 'INTERNAL' }] }) };
    }
    const data = messages.map((m) =>
      opts.unregistered?.includes(m.to)
        ? {
            status: 'error',
            message: `"${m.to}" is not a registered push notification recipient`,
            details: { error: 'DeviceNotRegistered' },
          }
        : { status: 'ok', id: `ticket-${m.to}` },
    );
    return { ok: true, status: 200, json: async () => ({ data }) };
  });
  return { fetch, requests };
}

/** reminder_log as a set, with the database's `on conflict do nothing`. */
function fakeLog() {
  const rows = new Set<string>();
  const logSent = vi.fn<SendDeps['logSent']>(async (batch) => {
    for (const row of batch) rows.add(`${row.user_id}|${row.kind}|${row.sent_for}`);
  });
  return { rows, logSent };
}

function makeDeps(due: DueReminder[], expo = fakeExpo()) {
  const log = fakeLog();
  const deps = {
    dueReminders: vi.fn<SendDeps['dueReminders']>().mockResolvedValue(due),
    fetch: expo.fetch,
    deleteTokens: vi.fn<SendDeps['deleteTokens']>().mockResolvedValue(undefined),
    logSent: log.logSent,
  };
  return { deps, expo, log };
}

const daily: DueReminder = {
  user_id: 'u1',
  kind: 'daily',
  sent_for: '2026-11-28',
  tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
};
const weekly: DueReminder = {
  user_id: 'u1',
  kind: 'weekly',
  sent_for: '2026-11-22',
  tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
};

describe('chunk', () => {
  it.each([
    [0, []],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ])('splits %i items into batches of 100', (n, sizes) => {
    const items = tokensOf('t', n);
    const batches = chunk(items, 100);
    expect(batches.map((b) => b.length)).toEqual(sizes);
    expect(batches.flat()).toEqual(items);
  });
});

describe('handleSend', () => {
  let setup: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    setup = makeDeps([daily, weekly]);
  });

  it('asks for the reminders due now and sends one message per token with the copy of its kind', async () => {
    const result = await handleSend(setup.deps, NOW);
    expect(setup.deps.dueReminders).toHaveBeenCalledWith(NOW);
    expect(setup.expo.requests).toHaveLength(1);
    // channelId: the Android channel the app creates («التذكيرات», apps/mobile/src/lib/notifications.ts), so muting it
    // in Android settings works and reminders do not land on Expo's English default channel (final review mobile minor 6).
    const msg = (to: string, kind: 'daily' | 'weekly') => ({
      to,
      title: 'أوراد',
      body: REMINDER_COPY[kind],
      sound: 'default',
      channelId: 'reminders',
      data: { kind },
    });
    expect(setup.expo.requests[0]).toEqual([
      msg('ExponentPushToken[a]', 'daily'),
      msg('ExponentPushToken[b]', 'daily'),
      msg('ExponentPushToken[a]', 'weekly'),
      msg('ExponentPushToken[b]', 'weekly'),
    ]);
    expect(result).toEqual({ due: 2, sent: 4, failed: 0, deletedTokens: 0, logFailures: 0, deleteFailures: 0 });
  });

  it('uses the agreed Arabic copy (messages.ts)', () => {
    expect(REMINDER_COPY).toEqual({
      title: 'أوراد',
      daily: 'لم تسجّل وردك اليوم بعد — دقيقة واحدة تكفي.',
      weekly: 'حان وقت مراجعتك الأسبوعية.',
    });
  });

  it('sends at most 100 messages per Expo request', async () => {
    const many: DueReminder[] = [
      { user_id: 'u1', kind: 'daily', sent_for: '2026-11-28', tokens: tokensOf('x', 150) },
      { user_id: 'u2', kind: 'daily', sent_for: '2026-11-28', tokens: tokensOf('y', 100) },
    ];
    const { deps, expo } = makeDeps(many);
    const result = await handleSend(deps, NOW);
    expect(expo.requests.map((r) => r.length)).toEqual([100, 100, 50]);
    expect(result).toEqual({ due: 2, sent: 250, failed: 0, deletedTokens: 0, logFailures: 0, deleteFailures: 0 });
  });

  it('deletes exactly the token whose ticket says DeviceNotRegistered', async () => {
    const { deps } = makeDeps([daily, weekly], fakeExpo({ unregistered: ['ExponentPushToken[b]'] }));
    const result = await handleSend(deps, NOW);
    expect(deps.deleteTokens).toHaveBeenCalledTimes(1);
    expect(deps.deleteTokens).toHaveBeenCalledWith(['ExponentPushToken[b]']);
    expect(result).toEqual({ due: 2, sent: 2, failed: 2, deletedTokens: 1, logFailures: 0, deleteFailures: 0 });
  });

  it('logs every due reminder once the messages are out', async () => {
    await handleSend(setup.deps, NOW);
    expect(setup.deps.logSent).toHaveBeenCalledWith([
      { user_id: 'u1', kind: 'daily', sent_for: '2026-11-28' },
      { user_id: 'u1', kind: 'weekly', sent_for: '2026-11-22' },
    ]);
    expect([...setup.log.rows]).toEqual(['u1|daily|2026-11-28', 'u1|weekly|2026-11-22']);
  });

  it('logging is idempotent: a second run over rows already logged changes nothing and does not fail', async () => {
    await handleSend(setup.deps, NOW);
    const again = await handleSend(setup.deps, NOW);
    expect(again).toEqual({ due: 2, sent: 4, failed: 0, deletedTokens: 0, logFailures: 0, deleteFailures: 0 });
    expect(setup.log.rows.size).toBe(2);
  });

  it('an Expo 5xx marks the batch failed but still logs the reminders (no second send within the hour)', async () => {
    const { deps, log } = makeDeps([daily, weekly], fakeExpo({ status: 503 }));
    const result = await handleSend(deps, NOW);
    expect(result).toEqual({ due: 2, sent: 0, failed: 4, deletedTokens: 0, logFailures: 0, deleteFailures: 0 });
    expect(deps.deleteTokens).not.toHaveBeenCalled();
    expect(log.rows.size).toBe(2);
  });

  it('a network error on one batch fails only that batch', async () => {
    const many: DueReminder[] = [
      { user_id: 'u1', kind: 'daily', sent_for: '2026-11-28', tokens: tokensOf('x', 120) },
    ];
    const { deps, expo, log } = makeDeps(many);
    const ok = expo.fetch.getMockImplementation()!;
    expo.fetch.mockImplementationOnce(async () => {
      throw new Error('connection reset');
    });
    expo.fetch.mockImplementation(ok);
    const result = await handleSend(deps, NOW);
    expect(result).toEqual({ due: 1, sent: 20, failed: 100, deletedTokens: 0, logFailures: 0, deleteFailures: 0 });
    expect(log.rows.size).toBe(1);
  });

  it('never throws when deleting tokens or writing the log fails: it counts and reports the failures', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps } = makeDeps([daily], fakeExpo({ unregistered: ['ExponentPushToken[a]'] }));
    deps.deleteTokens.mockRejectedValue(new Error('db down'));
    deps.logSent.mockRejectedValue(new Error('db down'));
    expect(await handleSend(deps, NOW)).toEqual({
      due: 1,
      sent: 1,
      failed: 1,
      deletedTokens: 0,
      logFailures: 1,
      deleteFailures: 1,
    });
    // Counts only: nothing of the token or the error text reaches the log.
    expect(errors.mock.calls).toEqual([
      ['send-reminders: deleting tokens failed', JSON.stringify({ deleteFailures: 1 })],
      ['send-reminders: writing reminder_log failed', JSON.stringify({ logFailures: 1 })],
    ]);
    errors.mockRestore();
  });

  it('nothing due: no Expo request, no log write', async () => {
    const { deps, expo } = makeDeps([]);
    expect(await handleSend(deps, NOW)).toEqual({ due: 0, sent: 0, failed: 0, deletedTokens: 0, logFailures: 0, deleteFailures: 0 });
    expect(expo.fetch).not.toHaveBeenCalled();
    expect(deps.logSent).not.toHaveBeenCalled();
  });
});

describe('handleRequest', () => {
  it.each([
    ['no Authorization header', null],
    ['a wrong secret', 'Bearer not-the-secret'],
    ['the secret without Bearer', SECRET],
    ['an empty bearer', 'Bearer '],
  ])('answers 401 to %s without building the deps (so nothing is sent)', async (_name, authorization) => {
    const factory = vi.fn(() => makeDeps([daily]).deps);
    expect(await handleRequest({ authorization, secret: SECRET, now: NOW }, factory)).toEqual({
      status: 401,
      body: { code: 'UNAUTHORIZED' },
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('answers 401 to everyone while CRON_SECRET is not configured, without building the deps', async () => {
    const factory = vi.fn(() => makeDeps([daily]).deps);
    expect(await handleRequest({ authorization: 'Bearer ', secret: '', now: NOW }, factory)).toMatchObject({
      status: 401,
    });
    expect(
      await handleRequest({ authorization: 'Bearer undefined', secret: undefined, now: NOW }, factory),
    ).toMatchObject({ status: 401 });
    expect(factory).not.toHaveBeenCalled();
  });

  it('with the right secret runs the send and answers 200 with the counts', async () => {
    const { deps } = makeDeps([daily]);
    expect(
      await handleRequest({ authorization: `Bearer ${SECRET}`, secret: SECRET, now: NOW }, () => deps),
    ).toEqual({ status: 200, body: { due: 1, sent: 2, failed: 0, deletedTokens: 0, logFailures: 0, deleteFailures: 0 } });
  });
});
