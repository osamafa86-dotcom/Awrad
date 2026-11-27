import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertGroup = vi.fn();
vi.mock('@/actions/settings', () => ({ upsertGroup: (...a: unknown[]) => upsertGroup(...a) }));

import { GroupForm } from '@/components/settings/GroupForm';
import { timezoneOptions, type GroupRow, type SupervisorOption } from '@/lib/settings';
import { ar } from '@/messages/ar';

const t = ar.settings.groupForm;

// Fixture data only (AGENTS.md §3).
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const G1 = '33333333-3333-4333-8333-333333333333';
const candidates: SupervisorOption[] = [
  { id: S1, name: 'مشرف أول' },
  { id: S2, name: 'مشرف ثانٍ' },
];
const timezones = timezoneOptions(['Europe/London', 'America/New_York']);
const existing: GroupRow = {
  id: G1,
  name: 'مجموعة قائمة',
  timezone: 'Asia/Amman',
  weekStartsOn: 1,
  supervisors: [{ id: S2, name: 'مشرف ثانٍ' }],
  memberCount: 4,
};

async function openCreate(takenNames: string[] = []) {
  render(<GroupForm mode="create" timezones={timezones} candidates={candidates} takenNames={takenNames} />);
  await userEvent.click(screen.getByRole('button', { name: ar.settings.groups.newGroup }));
  return screen.getByRole('dialog', { name: t.title });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GroupForm', () => {
  it('lists every candidate supervisor as a checkbox, none checked for a new group', async () => {
    const dialog = await openCreate();
    const fieldset = within(dialog).getByRole('group', { name: t.supervisors });
    const boxes = within(fieldset).getAllByRole('checkbox');
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, false]);
    expect(within(fieldset).getByLabelText('مشرف أول')).toBeInTheDocument();
    expect(within(fieldset).getByLabelText('مشرف ثانٍ')).toBeInTheDocument();
    // Asia/Riyadh (the app default) is selected; the region zones come first.
    const zone = within(dialog).getByLabelText(t.timezone) as HTMLSelectElement;
    expect(zone).toHaveValue('Asia/Riyadh');
    expect([...zone.options].slice(0, 3).map((o) => o.value)).toEqual(['Asia/Riyadh', 'Asia/Amman', 'Asia/Hebron']);
  });

  it('requires a name before calling the server', async () => {
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole('button', { name: t.submit }));
    expect(upsertGroup).not.toHaveBeenCalled();
    expect(within(dialog).getByText(ar.settings.groupFieldErrors.name)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(t.name)).toHaveAttribute('aria-invalid', 'true');
  });

  it("refuses another group's name before calling the server", async () => {
    const dialog = await openCreate(['مجموعة قائمة']);
    await userEvent.type(within(dialog).getByLabelText(t.name), 'مجموعة قائمة');
    await userEvent.click(within(dialog).getByRole('button', { name: t.submit }));
    expect(upsertGroup).not.toHaveBeenCalled();
    expect(within(dialog).getByText(ar.settings.groupFieldErrors.name_taken)).toBeInTheDocument();
  });

  it('the search narrows the zones; the chosen zone and supervisors are sent, and the dialog closes', async () => {
    upsertGroup.mockResolvedValue({ ok: true, id: G1 });
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText(t.name), 'مجموعة جديدة');
    await userEvent.type(within(dialog).getByRole('searchbox', { name: t.timezoneSearch }), 'new_y');
    const zone = within(dialog).getByLabelText(t.timezone) as HTMLSelectElement;
    // The selected zone stays listed beside the matches.
    expect([...zone.options].map((o) => o.value)).toEqual(['Asia/Riyadh', 'America/New_York']);
    await userEvent.selectOptions(zone, 'America/New_York');
    await userEvent.click(within(dialog).getByLabelText('مشرف ثانٍ'));
    await userEvent.click(within(dialog).getByRole('button', { name: t.submit }));
    expect(upsertGroup).toHaveBeenCalledWith({
      id: null,
      name: 'مجموعة جديدة',
      timezone: 'America/New_York',
      weekStartsOn: 0,
      supervisorIds: [S2],
    });
    expect(await screen.findByRole('button', { name: ar.settings.groups.newGroup })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits an existing group: its values are prefilled and its id is sent', async () => {
    upsertGroup.mockResolvedValue({ ok: true, id: G1 });
    render(<GroupForm mode="edit" group={existing} timezones={timezones} candidates={candidates} takenNames={[]} />);
    await userEvent.click(screen.getByRole('button', { name: ar.settings.groups.edit(existing.name) }));
    const dialog = screen.getByRole('dialog', { name: t.editTitle });
    expect(within(dialog).getByLabelText(t.name)).toHaveValue(existing.name);
    expect(within(dialog).getByLabelText(t.timezone)).toHaveValue('Asia/Amman');
    expect(within(dialog).getByLabelText('مشرف ثانٍ')).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText('مشرف ثانٍ'));
    await userEvent.click(within(dialog).getByRole('button', { name: t.save }));
    expect(upsertGroup).toHaveBeenCalledWith({
      id: G1,
      name: existing.name,
      timezone: 'Asia/Amman',
      weekStartsOn: 1,
      supervisorIds: [],
    });
  });

  it('keeps the dialog open with the mapped message when the server refuses', async () => {
    upsertGroup.mockResolvedValue({ ok: false, code: 'INVALID_ITEM' });
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText(t.name), 'مجموعة');
    await userEvent.click(within(dialog).getByRole('button', { name: t.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(ar.settings.errors.group.INVALID_ITEM);
  });
});
