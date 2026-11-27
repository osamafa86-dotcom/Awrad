import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertHabit = vi.fn();
const reorderHabits = vi.fn();
vi.mock('@/actions/habits', () => ({
  upsertHabit: (...a: unknown[]) => upsertHabit(...a),
  reorderHabits: (...a: unknown[]) => reorderHabits(...a),
  upsertItem: vi.fn(),
  reorderItems: vi.fn(),
  archiveHabit: vi.fn(),
  archiveItem: vi.fn(),
  deleteHabit: vi.fn(),
  deleteItem: vi.fn(),
  replaceHabit: vi.fn(),
}));

import { HabitTable } from '@/components/habits/HabitTable';
import type { HabitView } from '@/lib/habits';
import { ar } from '@/messages/ar';

const t = ar.habits;

// Fixture data only (AGENTS.md §3: habit names live in data, never in app code).
function habit(id: string, name: string, extra: Partial<HabitView> = {}): HabitView {
  return {
    id,
    name,
    description: null,
    targetText: `هدف ${name}`,
    frequency: 'weekly',
    kind: 'tristate',
    sortOrder: 1,
    activeFrom: '2026-03-01',
    activeTo: null,
    hasLogs: false,
    items: [],
    ...extra,
  };
}

const logged = habit('h1', 'عادة لها سجلات', { hasLogs: true, sortOrder: 1 });
const fresh = habit('h2', 'عادة بلا سجلات', { sortOrder: 2 });
const archived = habit('h3', 'عادة قديمة', { activeTo: '2026-10-31', hasLogs: true });

function renderTable(habits: HabitView[] = [logged, fresh, archived]) {
  return render(<HabitTable frequency="weekly" habits={habits} today="2026-11-27" />);
}

beforeEach(() => {
  vi.resetAllMocks();
  upsertHabit.mockResolvedValue({ ok: true });
});

describe('HabitTable', () => {
  it('lists the active habits in sort order with a drag handle each', () => {
    renderTable();
    const table = screen.getByRole('table', { name: t.tableLabel.weekly });
    expect(within(table).getByRole('button', { name: t.reorder.handle(logged.name) })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: t.reorder.handle(fresh.name) })).toBeInTheDocument();
    expect(within(table).queryByText(archived.name)).not.toBeInTheDocument();
  });

  it('renames in place: Enter saves and the new name shows at once', async () => {
    let resolve: (value: unknown) => void = () => {};
    upsertHabit.mockReturnValue(new Promise((r) => (resolve = r)));
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: fresh.name }));
    const input = screen.getByRole('textbox', { name: t.inline.name });
    expect(input).toHaveValue(fresh.name);
    await userEvent.clear(input);
    await userEvent.type(input, 'اسم مصحح{Enter}');
    expect(upsertHabit).toHaveBeenCalledWith({ id: fresh.id, patch: { name: 'اسم مصحح' } });
    // Shown before the action answers.
    expect(screen.getByRole('button', { name: 'اسم مصحح' })).toBeInTheDocument();
    resolve({ ok: true });
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  it('Esc cancels the edit without saving', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: fresh.name }));
    await userEvent.type(screen.getByRole('textbox', { name: t.inline.name }), ' زيادة{Escape}');
    expect(upsertHabit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: fresh.name })).toHaveFocus();
  });

  it('gives focus back to the name after Enter saves', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: fresh.name }));
    await userEvent.type(screen.getByRole('textbox', { name: t.inline.name }), 'ة{Enter}');
    expect(screen.getByRole('button', { name: `${fresh.name}ة` })).toHaveFocus();
  });

  it('puts the old name back and explains when the rename fails', async () => {
    upsertHabit.mockResolvedValue({ ok: false, code: 'SAVE_FAILED' });
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: fresh.name }));
    await userEvent.type(screen.getByRole('textbox', { name: t.inline.name }), 'س{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.SAVE_FAILED);
    expect(screen.getByRole('button', { name: fresh.name })).toBeInTheDocument();
  });

  it('edits the target in place too', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: fresh.targetText! }));
    const input = screen.getByRole('textbox', { name: t.inline.target });
    await userEvent.clear(input);
    await userEvent.type(input, 'هدف جديد');
    await userEvent.tab();
    expect(upsertHabit).toHaveBeenCalledWith({ id: fresh.id, patch: { target_text: 'هدف جديد' } });
  });

  it('offers «حذف» only for a habit without logs', async () => {
    renderTable();
    const user = userEvent.setup();
    screen.getByRole('button', { name: t.actions.more(logged.name) }).focus();
    await user.keyboard('{Enter}');
    let menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: t.actions.archive })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: t.actions.delete })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    screen.getByRole('button', { name: t.actions.more(fresh.name) }).focus();
    await user.keyboard('{Enter}');
    menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: t.actions.delete })).toBeInTheDocument();
  });

  it('lists archived habits in a collapsed «المؤرشفة» section with their period', async () => {
    renderTable();
    const summary = screen.getByText(t.archived(1));
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(summary);
    expect(within(details).getByText(archived.name)).toBeInTheDocument();
    expect(within(details).getByText(/31 أكتوبر 2026/)).toBeInTheDocument();
  });

  it('shows the empty state without active habits', () => {
    renderTable([archived]);
    expect(screen.getByText(t.empty.title)).toBeInTheDocument();
  });
});
