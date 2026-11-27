import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const getCurrentProfile = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, from }),
  getCurrentProfile: () => getCurrentProfile(),
}));
vi.mock('@/lib/supabase/attendance', () => ({ viewerTimezone: async () => 'Asia/Riyadh' }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import {
  archiveHabit,
  deleteHabit,
  reorderHabits,
  replaceHabit,
  upsertHabit,
  upsertItem,
} from '@/actions/habits';

const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const H3 = '33333333-3333-4333-8333-333333333333';

const admin = { id: 'a1', role: 'admin', isActive: true, fullName: 'المدير', groupId: null };
const supervisor = { ...admin, id: 's1', role: 'supervisor' };

/** A PostgREST builder stand-in: every call is recorded and chains; awaiting it yields `result`. */
function query(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'order', 'limit', 'single']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  return { builder, calls };
}

// «Today» in the admin's zone (Asia/Riyadh) is 2026-11-27: the dates below are the day after and the day before.
const TOMORROW = '2026-11-28';
const YESTERDAY = '2026-11-26';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T09:00:00Z'));
  vi.resetAllMocks();
  getCurrentProfile.mockResolvedValue(admin);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('habits actions', () => {
  it('refuse anyone but an active admin without touching the database', async () => {
    getCurrentProfile.mockResolvedValue(supervisor);
    expect(await reorderHabits('daily', [H1])).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await deleteHabit(H1)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await replaceHabit(H1, { name: 'x', description: null, target_text: null, items: [] }, '2026-12-01')).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    getCurrentProfile.mockResolvedValue({ ...admin, isActive: false });
    expect(await archiveHabit(H1, TOMORROW)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reorderHabits writes sort_order 1..n for that frequency, in order', async () => {
    const writes = [H3, H1, H2].map(() => query({ data: [{ id: 'x' }], error: null }));
    for (const w of writes) from.mockReturnValueOnce(w.builder);
    expect(await reorderHabits('weekly', [H3, H1, H2])).toEqual({ ok: true });
    expect(writes.map((w) => w.calls)).toEqual(
      [H3, H1, H2].map((id, index) => [
        ['update', [{ sort_order: index + 1 }]],
        ['eq', ['id', id]],
        ['eq', ['frequency', 'weekly']],
        ['select', ['id']],
      ]),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/habits');
  });

  it('reorderHabits rejects duplicates and reports a failed write', async () => {
    expect(await reorderHabits('daily', [H1, H1])).toEqual({ ok: false, code: 'INVALID_INPUT' });
    from.mockReturnValueOnce(query({ data: null, error: { message: 'boom' } }).builder);
    expect(await reorderHabits('daily', [H1, H2])).toEqual({ ok: false, code: 'SAVE_FAILED' });
  });

  it('an inline rename updates only the name', async () => {
    const update = query({ data: [{ id: H1 }], error: null });
    from.mockReturnValueOnce(update.builder);
    expect(await upsertHabit({ id: H1, patch: { name: ' اسم ' } })).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('habits');
    expect(update.calls[0]).toEqual(['update', [{ name: 'اسم' }]]);
  });

  it('a rename that RLS filtered out (no row) is a failure, not a silent success', async () => {
    from.mockReturnValueOnce(query({ data: [], error: null }).builder);
    expect(await upsertHabit({ id: H1, patch: { name: 'اسم' } })).toEqual({ ok: false, code: 'SAVE_FAILED' });
  });

  it('a new checklist habit goes last in its frequency with its items', async () => {
    const last = query({ data: [{ sort_order: 4 }], error: null });
    const insert = query({ data: { id: H2 }, error: null });
    const items = query({ data: null, error: null });
    from.mockReturnValueOnce(last.builder).mockReturnValueOnce(insert.builder).mockReturnValueOnce(items.builder);
    const result = await upsertHabit({
      values: {
        name: 'جديدة',
        description: null,
        target_text: null,
        frequency: 'weekly',
        kind: 'checklist',
        active_from: TOMORROW,
        items: ['أ', 'ب'],
      },
    });
    expect(result).toEqual({ ok: true, id: H2 });
    const inserted = insert.calls[0]![1][0] as Record<string, unknown>;
    expect(inserted).toMatchObject({ name: 'جديدة', frequency: 'weekly', kind: 'checklist', sort_order: 5 });
    expect(inserted.slug).toMatch(/^habit_\d{8}_[0-9a-f]{8}$/);
    expect(items.calls[0]).toEqual([
      'insert',
      [
        [
          { habit_id: H2, name: 'أ', sort_order: 1, active_from: TOMORROW },
          { habit_id: H2, name: 'ب', sort_order: 2, active_from: TOMORROW },
        ],
      ],
    ]);
  });

  it('a new habit may not start before today', async () => {
    const result = await upsertHabit({
      values: {
        name: 'x',
        description: null,
        target_text: null,
        frequency: 'daily',
        kind: 'tristate',
        active_from: YESTERDAY,
        items: [],
      },
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', fields: ['active_from'] });
  });

  it('deleteHabit maps the delete guard to HABIT_HAS_LOGS', async () => {
    from.mockReturnValueOnce(query({ data: null, error: { message: 'HABIT_HAS_LOGS', code: '22023' } }).builder);
    expect(await deleteHabit(H1)).toEqual({ ok: false, code: 'HABIT_HAS_LOGS' });
  });

  it('archiveHabit refuses a past date and an already archived habit', async () => {
    expect(await archiveHabit(H1, YESTERDAY)).toEqual({ ok: false, code: 'DATE_OUT_OF_WINDOW' });
    const update = query({ data: [], error: null });
    from.mockReturnValueOnce(update.builder);
    expect(await archiveHabit(H1, TOMORROW)).toEqual({ ok: false, code: 'INACTIVE_HABIT' });
    expect(update.calls).toEqual([
      ['update', [{ active_to: TOMORROW }]],
      ['eq', ['id', H1]],
      ['is', ['active_to', null]],
      ['select', ['id']],
    ]);
  });

  it('replaceHabit calls archive_and_replace_habit and maps its codes', async () => {
    rpc.mockResolvedValueOnce({ data: H2, error: null });
    const values = { name: ' جديدة ', description: null, target_text: 'هدف', items: [] };
    expect(await replaceHabit(H1, values, '2026-12-01')).toEqual({ ok: true, id: H2 });
    expect(rpc).toHaveBeenCalledWith('archive_and_replace_habit', {
      p_old_habit_id: H1,
      p_new: { name: 'جديدة', description: null, target_text: 'هدف' },
      p_switch_date: '2026-12-01',
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DATE_OUT_OF_WINDOW', code: '22023' } });
    expect(await replaceHabit(H1, values, '2026-12-01')).toEqual({ ok: false, code: 'DATE_OUT_OF_WINDOW' });
    expect(await replaceHabit(H1, { ...values, name: '' }, '')).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      fields: ['name', 'date'],
    });
  });

  it('upsertItem adds an item last in its checklist', async () => {
    const last = query({ data: [{ sort_order: 2 }], error: null });
    const insert = query({ data: [{ id: H3 }], error: null });
    from.mockReturnValueOnce(last.builder).mockReturnValueOnce(insert.builder);
    expect(await upsertItem({ habitId: H1, name: 'بند' })).toEqual({ ok: true });
    expect(insert.calls[0]![1][0]).toMatchObject({ habit_id: H1, name: 'بند', sort_order: 3 });
  });
});
