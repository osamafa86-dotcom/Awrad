import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const is = vi.fn();
const select = vi.fn();
const getCurrentProfile = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, from }),
  getCurrentProfile: () => getCurrentProfile(),
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { dismissDeletionRequest, handleSupportRequest } from '@/actions/support';

const LOG = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

const admin = { id: 'a1', role: 'admin', isActive: true, fullName: 'المدير', groupId: null };
const supervisor = { ...admin, id: 's1', role: 'supervisor' };
const student = { ...admin, id: 'p1', role: 'student' };

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentProfile.mockResolvedValue(admin);
  from.mockReturnValue({ update });
  update.mockReturnValue({ eq });
  eq.mockReturnValue({ is });
  is.mockReturnValue({ select });
});

describe('handleSupportRequest', () => {
  it('calls handle_support_request with the trimmed note and refreshes the inbox, the overview and the student page', async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await handleSupportRequest(LOG, '  تمّ الاتصال ')).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('handle_support_request', { p_log_id: LOG, p_note: 'تمّ الاتصال' });
    expect(revalidatePath).toHaveBeenCalledWith('/support');
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath).toHaveBeenCalledWith('/students/[id]', 'page');
  });

  it('a supervisor may call it too (the RPC checks their group); no note sends an empty one', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    rpc.mockResolvedValue({ error: null });
    expect(await handleSupportRequest(LOG, null)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('handle_support_request', { p_log_id: LOG, p_note: '' });
  });

  it('refuses a student without calling the server', async () => {
    getCurrentProfile.mockResolvedValue(student);
    expect(await handleSupportRequest(LOG, null)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports invalid input without calling the server', async () => {
    expect(await handleSupportRequest('nope', null)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps FORBIDDEN and INVALID_ITEM from the RPC, anything else to SAVE_FAILED', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'FORBIDDEN' } });
    expect(await handleSupportRequest(LOG, null)).toEqual({ ok: false, code: 'FORBIDDEN' });
    rpc.mockResolvedValue({ error: { code: '22023', message: 'INVALID_ITEM' } });
    expect(await handleSupportRequest(LOG, null)).toEqual({ ok: false, code: 'INVALID_ITEM' });
    rpc.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } });
    expect(await handleSupportRequest(LOG, null)).toEqual({ ok: false, code: 'SAVE_FAILED' });
    rpc.mockRejectedValue(new Error('network'));
    expect(await handleSupportRequest(LOG, null)).toEqual({ ok: false, code: 'SAVE_FAILED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('dismissDeletionRequest', () => {
  it('closes the open request as the signed-in admin', async () => {
    select.mockResolvedValue({ data: [{ id: REQUEST }], error: null });
    expect(await dismissDeletionRequest(REQUEST)).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('deletion_requests');
    expect(update).toHaveBeenCalledWith({ handled_at: expect.any(String), handled_by: 'a1' });
    expect(eq).toHaveBeenCalledWith('id', REQUEST);
    expect(is).toHaveBeenCalledWith('handled_at', null);
    expect(revalidatePath).toHaveBeenCalledWith('/support');
  });

  it('refuses a supervisor and bad input without writing', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await dismissDeletionRequest(REQUEST)).toEqual({ ok: false, code: 'FORBIDDEN' });
    getCurrentProfile.mockResolvedValue(admin);
    expect(await dismissDeletionRequest('x')).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(update).not.toHaveBeenCalled();
  });

  it('a request that is no longer open (no row updated) → INVALID_ITEM; an error → SAVE_FAILED', async () => {
    select.mockResolvedValue({ data: [], error: null });
    expect(await dismissDeletionRequest(REQUEST)).toEqual({ ok: false, code: 'INVALID_ITEM' });
    select.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    expect(await dismissDeletionRequest(REQUEST)).toEqual({ ok: false, code: 'FORBIDDEN' });
    select.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect(await dismissDeletionRequest(REQUEST)).toEqual({ ok: false, code: 'SAVE_FAILED' });
  });
});
