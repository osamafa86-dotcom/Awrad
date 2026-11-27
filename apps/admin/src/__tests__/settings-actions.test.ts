import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getCurrentProfile = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc }),
  getCurrentProfile: () => getCurrentProfile(),
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { updateAppSettings, upsertGroup } from '@/actions/settings';
import { DEFAULT_SETTINGS, type GroupInput } from '@/lib/settings';

const G1 = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222222';

const admin = { id: 'a1', role: 'admin', isActive: true, fullName: 'المدير', groupId: null };
const supervisor = { ...admin, id: 's1', role: 'supervisor' };

function settingsForm(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    streak_threshold_pct: '100',
    backfill_days: '5',
    weekly_grace_days: '3',
    hijri_adjustment_days: '0',
    excused_counts_as_absent: 'false',
    default_reminder_time: '21:00',
    ...values,
  })) {
    data.set(key, value);
  }
  return data;
}

const group: GroupInput = { id: null, name: ' مجموعة ', timezone: 'Asia/Amman', weekStartsOn: 1, supervisorIds: [S1] };

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentProfile.mockResolvedValue(admin);
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('updateAppSettings', () => {
  it('sends the six values to update_app_settings and revalidates /settings and /', async () => {
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('update_app_settings', { p_values: { ...DEFAULT_SETTINGS, backfill_days: 5 } });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('refuses a supervisor or an inactive admin without calling the database', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: false, code: 'FORBIDDEN' });
    getCurrentProfile.mockResolvedValue({ ...admin, isActive: false });
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the invalid fields without calling the database', async () => {
    expect(await updateAppSettings(null, settingsForm({ backfill_days: '15' }))).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      fields: ['backfill_days'],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps the RPC errors: FORBIDDEN, INVALID_ITEM, anything else SAVE_FAILED', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'FORBIDDEN' } });
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: false, code: 'FORBIDDEN' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'INVALID_ITEM' } });
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: false, code: 'INVALID_ITEM' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: false, code: 'SAVE_FAILED' });
    rpc.mockRejectedValueOnce(new Error('offline'));
    expect(await updateAppSettings(null, settingsForm())).toEqual({ ok: false, code: 'SAVE_FAILED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('upsertGroup', () => {
  it('creates through upsert_group with a null id and returns the new id', async () => {
    rpc.mockResolvedValue({ data: G1, error: null });
    expect(await upsertGroup(group)).toEqual({ ok: true, id: G1 });
    expect(rpc).toHaveBeenCalledWith('upsert_group', {
      p_id: null,
      p_name: 'مجموعة',
      p_timezone: 'Asia/Amman',
      p_week_starts_on: 1,
      p_supervisor_ids: [S1],
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('updates an existing group by id', async () => {
    rpc.mockResolvedValue({ data: G1, error: null });
    expect(await upsertGroup({ ...group, id: G1, supervisorIds: [] })).toEqual({ ok: true, id: G1 });
    expect(rpc).toHaveBeenCalledWith('upsert_group', expect.objectContaining({ p_id: G1, p_supervisor_ids: [] }));
  });

  it('refuses a supervisor, and names invalid fields, without calling the database', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await upsertGroup(group)).toEqual({ ok: false, code: 'FORBIDDEN' });
    getCurrentProfile.mockResolvedValue(admin);
    expect(await upsertGroup({ ...group, name: '', timezone: 'Mars/Olympus' })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      fields: ['name', 'timezone'],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps INVALID_ITEM (a taken name, an inactive supervisor…) and other failures', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'INVALID_ITEM' } });
    expect(await upsertGroup(group)).toEqual({ ok: false, code: 'INVALID_ITEM' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect(await upsertGroup(group)).toEqual({ ok: false, code: 'SAVE_FAILED' });
  });
});
