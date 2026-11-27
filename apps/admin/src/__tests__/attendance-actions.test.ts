import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const insert = vi.fn();
const select = vi.fn();
const single = vi.fn();
const del = vi.fn();
const eq = vi.fn();
const getCurrentProfile = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, from }),
  getCurrentProfile: () => getCurrentProfile(),
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { createSession, deleteSession, saveAttendance } from '@/actions/attendance';

const GROUP = '22222222-2222-4222-8222-222222222222';
const SESSION = '44444444-4444-4444-8444-444444444444';
const U1 = '55555555-5555-4555-8555-555555555555';

const admin = { id: 'a1', role: 'admin', isActive: true, fullName: 'المدير', groupId: null };
const supervisor = { ...admin, id: 's1', role: 'supervisor' };
const student = { ...admin, id: 'p1', role: 'student' };

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentProfile.mockResolvedValue(admin);
  from.mockReturnValue({ insert, delete: del });
  insert.mockReturnValue({ select });
  select.mockReturnValue({ single });
  del.mockReturnValue({ eq });
});

describe('createSession', () => {
  it('inserts the session as the signed-in user, then opens it', async () => {
    single.mockResolvedValue({ data: { id: SESSION }, error: null });
    await expect(createSession({ group_id: GROUP, session_date: '2026-11-27', title: 'درس' })).rejects.toThrow(
      `REDIRECT /attendance/${SESSION}`,
    );
    expect(from).toHaveBeenCalledWith('sessions');
    expect(insert).toHaveBeenCalledWith({ group_id: GROUP, session_date: '2026-11-27', title: 'درس', created_by: 'a1' });
    expect(revalidatePath).toHaveBeenCalledWith('/attendance');
  });

  it('reports invalid fields without writing', async () => {
    expect(await createSession({ group_id: '', session_date: '2026-11-27', title: null })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      fields: ['group_id'],
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('maps an RLS refusal (a supervisor creating a shared session) to FORBIDDEN', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    single.mockResolvedValue({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
    expect(await createSession({ group_id: null, session_date: '2026-11-27', title: null })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('refuses a student without writing', async () => {
    getCurrentProfile.mockResolvedValue(student);
    expect(await createSession({ group_id: GROUP, session_date: '2026-11-27', title: null })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('saveAttendance', () => {
  it('sends the rows through set_attendance and revalidates the session and the student pages', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    expect(await saveAttendance(SESSION, [{ userId: U1, status: 'absent' }])).toEqual({ ok: true, saved: 1 });
    expect(rpc).toHaveBeenCalledWith('set_attendance', {
      p_session_id: SESSION,
      p_rows: [{ user_id: U1, status: 'absent' }],
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/attendance/${SESSION}`);
    expect(revalidatePath).toHaveBeenCalledWith('/students/[id]', 'page');
  });

  it('maps the RPC codes', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'FORBIDDEN' } });
    expect(await saveAttendance(SESSION, [{ userId: U1, status: 'present' }])).toEqual({ ok: false, code: 'FORBIDDEN' });
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'INVALID_ITEM' } });
    expect(await saveAttendance(SESSION, [{ userId: U1, status: 'present' }])).toEqual({
      ok: false,
      code: 'INVALID_ITEM',
    });
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    expect(await saveAttendance(SESSION, [{ userId: U1, status: 'present' }])).toEqual({
      ok: false,
      code: 'SAVE_FAILED',
    });
  });

  it('refuses empty or malformed rows without calling the RPC', async () => {
    expect(await saveAttendance(SESSION, [])).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('deleteSession', () => {
  it('is for the admin alone', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await deleteSession(SESSION)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes the session and returns to the list', async () => {
    eq.mockResolvedValue({ error: null });
    await expect(deleteSession(SESSION)).rejects.toThrow('REDIRECT /attendance');
    expect(eq).toHaveBeenCalledWith('id', SESSION);
  });
});
