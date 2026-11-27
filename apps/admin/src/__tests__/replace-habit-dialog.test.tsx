import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceHabit = vi.fn();
vi.mock('@/actions/habits', () => ({ replaceHabit: (...a: unknown[]) => replaceHabit(...a) }));

import { ReplaceHabitDialog } from '@/components/habits/ReplaceHabitDialog';
import type { HabitView } from '@/lib/habits';
import { ar } from '@/messages/ar';

const t = ar.habits;

// Fixture data only (AGENTS.md §3).
const old: HabitView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'كتاب حالي',
  description: null,
  targetText: 'ست صفحات',
  frequency: 'daily',
  kind: 'tristate',
  sortOrder: 4,
  activeFrom: '2026-03-01',
  activeTo: null,
  hasLogs: true,
  items: [],
};

async function open(habit: HabitView = old) {
  render(<ReplaceHabitDialog habit={habit} today="2026-11-30" />);
  await userEvent.click(screen.getByRole('button', { name: t.actions.replace }));
  return screen.getByRole('dialog', { name: t.replace.title(habit.name) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ReplaceHabitDialog', () => {
  it('asks for the new name, the target and the start date (tomorrow by default)', async () => {
    await open();
    expect(screen.getByLabelText(t.replace.name)).toHaveValue('');
    expect(screen.getByLabelText(t.replace.target)).toHaveValue(old.targetText);
    expect(screen.getByLabelText(t.replace.startDate)).toHaveValue('2026-12-01');
    expect(screen.getByText(t.replace.endsOn(old.name, '30 نوفمبر 2026'))).toBeInTheDocument();
  });

  it('requires a name and a start date before calling the server', async () => {
    await open();
    await userEvent.clear(screen.getByLabelText(t.replace.startDate));
    await userEvent.click(screen.getByRole('button', { name: t.replace.submit }));
    expect(replaceHabit).not.toHaveBeenCalled();
    expect(screen.getByText(t.fieldErrors.name)).toBeInTheDocument();
    expect(screen.getByText(t.fieldErrors.date)).toBeInTheDocument();
    expect(screen.getByLabelText(t.replace.name)).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends the replacement and shows the mapped message for DATE_OUT_OF_WINDOW', async () => {
    replaceHabit.mockResolvedValue({ ok: false, code: 'DATE_OUT_OF_WINDOW' });
    await open();
    await userEvent.type(screen.getByLabelText(t.replace.name), 'كتاب تال');
    await userEvent.click(screen.getByRole('button', { name: t.replace.submit }));
    expect(replaceHabit).toHaveBeenCalledWith(
      old.id,
      { name: 'كتاب تال', description: null, target_text: old.targetText, items: [] },
      '2026-12-01',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.DATE_OUT_OF_WINDOW);
  });

  it('a checklist replacement starts from the active items and needs at least one', async () => {
    const checklist: HabitView = {
      ...old,
      kind: 'checklist',
      items: [
        { id: 'i1', habitId: old.id, name: 'بند أول', sortOrder: 1, activeFrom: '2026-03-01', activeTo: null, hasLogs: false },
        { id: 'i2', habitId: old.id, name: 'بند مؤرشف', sortOrder: 2, activeFrom: '2026-03-01', activeTo: '2026-05-01', hasLogs: false },
      ],
    };
    await open(checklist);
    const items = screen.getByLabelText(t.replace.items);
    expect(items).toHaveValue('بند أول');
    await userEvent.clear(items);
    await userEvent.type(screen.getByLabelText(t.replace.name), 'قائمة');
    await userEvent.click(screen.getByRole('button', { name: t.replace.submit }));
    expect(replaceHabit).not.toHaveBeenCalled();
    expect(screen.getByText(t.fieldErrors.items)).toBeInTheDocument();
  });
});
