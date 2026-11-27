import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleInvite, type InviteDeps } from './handler';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '33333333-3333-4333-8333-333333333333';

const valid = {
  email: ' New.Student@Example.com ',
  full_name: ' طالب جديد ',
  role: 'student',
  group_id: GROUP_ID,
  joined_at: '2026-11-01',
  is_tracked: true,
};

function fakeDeps() {
  return {
    caller: vi.fn<InviteDeps['caller']>().mockResolvedValue({ id: ADMIN_ID, isAdmin: true }),
    insertInvitation: vi.fn<InviteDeps['insertInvitation']>().mockResolvedValue('inv-1'),
    deleteInvitation: vi.fn<InviteDeps['deleteInvitation']>().mockResolvedValue(undefined),
    createUser: vi.fn<InviteDeps['createUser']>().mockResolvedValue({ ok: true, id: NEW_ID }),
    sendWelcome: vi.fn<InviteDeps['sendWelcome']>().mockResolvedValue(true),
  };
}

let deps: ReturnType<typeof fakeDeps>;
beforeEach(() => {
  deps = fakeDeps();
});

describe('handleInvite', () => {
  it('refuses a caller without a session (403 FORBIDDEN) and touches nothing', async () => {
    deps.caller.mockResolvedValue(null);
    expect(await handleInvite(valid, deps)).toEqual({ status: 403, body: { code: 'FORBIDDEN' } });
    expect(deps.insertInvitation).not.toHaveBeenCalled();
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('refuses a signed-in caller who is not an admin (403 FORBIDDEN)', async () => {
    deps.caller.mockResolvedValue({ id: ADMIN_ID, isAdmin: false });
    expect(await handleInvite(valid, deps)).toEqual({ status: 403, body: { code: 'FORBIDDEN' } });
    expect(deps.insertInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', null],
    ['a bad email', { ...valid, email: 'not-an-email' }],
    ['an empty name', { ...valid, full_name: '   ' }],
    ['an unknown role', { ...valid, role: 'owner' }],
    ['a group that is not a uuid', { ...valid, group_id: 'g1' }],
    ['an impossible joined_at', { ...valid, joined_at: '2026-02-30' }],
    ['a joined_at in another format', { ...valid, joined_at: '01/11/2026' }],
    ['a non-boolean is_tracked', { ...valid, is_tracked: 'yes' }],
  ])('rejects %s (400 INVALID_INPUT)', async (_name, body) => {
    expect(await handleInvite(body, deps)).toEqual({
      status: 400,
      body: { code: 'INVALID_INPUT' },
    });
    expect(deps.insertInvitation).not.toHaveBeenCalled();
  });

  it('invites: records the invitation, creates the confirmed user, sends the welcome, returns the profile id', async () => {
    expect(await handleInvite(valid, deps)).toEqual({
      status: 200,
      body: { profile_id: NEW_ID, welcome_sent: true },
    });
    expect(deps.insertInvitation).toHaveBeenCalledWith({
      email: 'new.student@example.com',
      full_name: 'طالب جديد',
      role: 'student',
      group_id: GROUP_ID,
      joined_at: '2026-11-01',
      is_tracked: true,
      invited_by: ADMIN_ID,
    });
    expect(deps.createUser).toHaveBeenCalledWith({
      email: 'new.student@example.com',
      full_name: 'طالب جديد',
    });
    expect(deps.sendWelcome).toHaveBeenCalledWith('new.student@example.com');
    // the invitation exists before the user, so the handle_new_user trigger can build the profile from it
    expect(deps.insertInvitation.mock.invocationCallOrder[0]!).toBeLessThan(
      deps.createUser.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves joined_at and is_tracked to the column defaults when they are omitted', async () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.joined_at;
    delete rest.is_tracked;
    await handleInvite(rest, deps);
    const row = deps.insertInvitation.mock.calls[0]![0];
    expect(row).not.toHaveProperty('joined_at');
    expect(row).not.toHaveProperty('is_tracked');
  });

  it('answers 409 EMAIL_EXISTS for an address that already has an account, and withdraws the invitation', async () => {
    deps.createUser.mockResolvedValue({ ok: false, reason: 'EMAIL_EXISTS' });
    expect(await handleInvite(valid, deps)).toEqual({
      status: 409,
      body: { code: 'EMAIL_EXISTS' },
    });
    expect(deps.deleteInvitation).toHaveBeenCalledWith('inv-1');
    expect(deps.sendWelcome).not.toHaveBeenCalled();
  });

  it('answers 500 INVITE_FAILED when the account cannot be created, and withdraws the invitation', async () => {
    deps.createUser.mockResolvedValue({ ok: false, reason: 'FAILED' });
    expect(await handleInvite(valid, deps)).toEqual({
      status: 500,
      body: { code: 'INVITE_FAILED' },
    });
    expect(deps.deleteInvitation).toHaveBeenCalledWith('inv-1');
  });

  it('answers 500 INVITE_FAILED when the invitation cannot be recorded', async () => {
    deps.insertInvitation.mockRejectedValue(new Error('db down'));
    expect(await handleInvite(valid, deps)).toEqual({
      status: 500,
      body: { code: 'INVITE_FAILED' },
    });
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('still succeeds when the welcome email fails: the account exists either way', async () => {
    deps.sendWelcome.mockResolvedValue(false);
    expect(await handleInvite(valid, deps)).toEqual({
      status: 200,
      body: { profile_id: NEW_ID, welcome_sent: false },
    });
    deps.sendWelcome.mockRejectedValue(new Error('smtp down'));
    expect((await handleInvite(valid, deps)).body).toEqual({
      profile_id: NEW_ID,
      welcome_sent: false,
    });
  });
});
