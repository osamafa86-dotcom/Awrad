import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const rpc = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const from = vi.fn();
const getCurrentProfile = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ functions: { invoke }, rpc, from }),
  getCurrentProfile: () => getCurrentProfile(),
}));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { deleteStudent, inviteStudent, updateStudent } from '@/actions/students';
import { studentErrorText } from '@/lib/students';

const GROUP = '22222222-2222-4222-8222-222222222222';
const STUDENT = '33333333-3333-4333-8333-333333333333';

const admin = { id: 'a1', role: 'admin', isActive: true, fullName: 'المدير', groupId: null };
const supervisor = { ...admin, id: 's1', role: 'supervisor' };

const inviteForm = () => {
  const data = new FormData();
  data.set('email', 'New@Example.com');
  data.set('full_name', 'طالب جديد');
  data.set('group_id', GROUP);
  data.set('joined_at', '2026-11-01');
  data.set('is_tracked', 'true');
  return data;
};

/** A FunctionsHttpError as supabase-js returns it: the function's Response in `context`. */
const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
});

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentProfile.mockResolvedValue(admin);
  from.mockReturnValue({ update });
  update.mockReturnValue({ eq });
});

describe('inviteStudent', () => {
  it('refuses a supervisor without calling the function', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await inviteStudent(null, inviteForm())).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports invalid fields without calling the function', async () => {
    const data = inviteForm();
    data.set('email', 'nope');
    expect(await inviteStudent(null, data)).toEqual({ ok: false, code: 'INVALID_INPUT', fields: ['email'] });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes invite-user with the student body, then opens the new student', async () => {
    invoke.mockResolvedValue({ data: { profile_id: STUDENT, welcome_sent: true }, error: null });
    await expect(inviteStudent(null, inviteForm())).rejects.toThrow(`REDIRECT /students/${STUDENT}`);
    expect(invoke).toHaveBeenCalledWith('invite-user', {
      body: {
        email: 'new@example.com',
        full_name: 'طالب جديد',
        role: 'student',
        group_id: GROUP,
        joined_at: '2026-11-01',
        is_tracked: true,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/students');
  });

  it.each([
    [403, { code: 'FORBIDDEN' }, 'FORBIDDEN'],
    [409, { code: 'EMAIL_EXISTS' }, 'EMAIL_EXISTS'],
    [400, { code: 'INVALID_INPUT' }, 'INVALID_INPUT'],
    [500, { code: 'INVITE_FAILED' }, 'INVITE_FAILED'],
    [500, { code: 'SOMETHING_NEW' }, 'INVITE_FAILED'],
    [401, { msg: 'Invalid JWT' }, 'INVITE_FAILED'],
  ])('maps a %i %j answer to %s', async (status, body, code) => {
    invoke.mockResolvedValue({ data: null, error: httpError(status, body) });
    expect(await inviteStudent(null, inviteForm())).toEqual({ ok: false, code });
  });

  it('maps an unreachable function to INVITE_FAILED, returned or thrown', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request' } });
    expect(await inviteStudent(null, inviteForm())).toEqual({ ok: false, code: 'INVITE_FAILED' });
    invoke.mockRejectedValue(new Error('fetch failed'));
    expect(await inviteStudent(null, inviteForm())).toEqual({ ok: false, code: 'INVITE_FAILED' });
  });
});

describe('updateStudent', () => {
  const values = { full_name: 'خالد', group_id: GROUP, is_active: false, is_tracked: true, joined_at: '2026-10-01' };

  it('refuses a supervisor without touching the database', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await updateStudent(STUDENT, values)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(from).not.toHaveBeenCalled();
  });

  it('updates the profile row and refreshes the student pages', async () => {
    eq.mockResolvedValue({ error: null });
    expect(await updateStudent(STUDENT, values)).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(values);
    expect(eq).toHaveBeenCalledWith('id', STUDENT);
    expect(revalidatePath).toHaveBeenCalledWith(`/students/${STUDENT}`);
    expect(revalidatePath).toHaveBeenCalledWith('/students');
  });

  it('refuses an admin deactivating their own account, but lets them edit it', async () => {
    expect(await updateStudent(admin.id, values)).toEqual({ ok: false, code: 'SELF_FORBIDDEN' });
    expect(from).not.toHaveBeenCalled();
    eq.mockResolvedValue({ error: null });
    expect(await updateStudent(admin.id, { ...values, is_active: true })).toEqual({ ok: true });
  });

  it('reports invalid input and failed saves', async () => {
    expect(await updateStudent(STUDENT, { ...values, full_name: ' ' })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      fields: ['full_name'],
    });
    eq.mockResolvedValue({ error: { code: '42501', message: 'FORBIDDEN' } });
    expect(await updateStudent(STUDENT, values)).toEqual({ ok: false, code: 'FORBIDDEN' });
    eq.mockResolvedValue({ error: { code: '23503', message: 'fk' } });
    expect(await updateStudent(STUDENT, values)).toEqual({ ok: false, code: 'SAVE_FAILED' });
  });
});

describe('deleteStudent', () => {
  it('refuses a supervisor', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await deleteStudent(STUDENT)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls admin_delete_user and returns to the list', async () => {
    rpc.mockResolvedValue({ error: null });
    await expect(deleteStudent(STUDENT)).rejects.toThrow('REDIRECT /students');
    expect(rpc).toHaveBeenCalledWith('admin_delete_user', { p_user_id: STUDENT });
    expect(revalidatePath).toHaveBeenCalledWith('/students');
  });

  it('from the support inbox: stays there, refreshing the inbox, the list and the overview', async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await deleteStudent(STUDENT, 'support')).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('admin_delete_user', { p_user_id: STUDENT });
    expect(revalidatePath).toHaveBeenCalledWith('/support');
    expect(revalidatePath).toHaveBeenCalledWith('/students');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('maps the RPC errors', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'FORBIDDEN' } });
    expect(await deleteStudent(STUDENT)).toEqual({ ok: false, code: 'FORBIDDEN' });
    rpc.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } });
    expect(await deleteStudent(STUDENT)).toEqual({ ok: false, code: 'DELETE_FAILED' });
  });
});

describe('studentErrorText', () => {
  it('has a message for every code and nothing for success', () => {
    expect(studentErrorText({ ok: false, code: 'EMAIL_EXISTS' })).toBe('هذا البريد مسجَّل لحساب آخر.');
    expect(studentErrorText({ ok: true })).toBeNull();
    expect(studentErrorText(null)).toBeNull();
  });
});
