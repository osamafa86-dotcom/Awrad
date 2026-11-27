import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/settings', () => ({ upsertGroup: vi.fn() }));

import { GroupsTable } from '@/components/settings/GroupsTable';
import type { GroupRow } from '@/lib/settings';
import { ar } from '@/messages/ar';

const t = ar.settings.groups;

// Fixture data only (AGENTS.md §3).
const rows: GroupRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'مجموعة أولى',
    timezone: 'Asia/Amman',
    weekStartsOn: 1,
    supervisors: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'مشرف أول' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'مشرف ثانٍ' },
    ],
    memberCount: 12,
  },
  { id: '44444444-4444-4444-8444-444444444444', name: 'مجموعة ثانية', timezone: 'Asia/Riyadh', weekStartsOn: 0, supervisors: [], memberCount: 0 },
];

describe('GroupsTable', () => {
  it('shows each group with its zone, week start day, supervisors and members, and an edit button', () => {
    render(<GroupsTable rows={rows} timezones={['Asia/Riyadh', 'Asia/Amman']} candidates={[]} />);
    const table = screen.getByRole('table', { name: t.tableLabel });
    const first = within(table).getByRole('row', { name: /مجموعة أولى/ });
    expect(first).toHaveTextContent('Asia/Amman');
    expect(first).toHaveTextContent(ar.dates.weekdays[1]!);
    expect(first).toHaveTextContent('مشرف أول');
    expect(first).toHaveTextContent('مشرف ثانٍ');
    expect(first).toHaveTextContent('12');
    expect(within(first).getByRole('button', { name: t.edit('مجموعة أولى') })).toBeInTheDocument();
    const second = within(table).getByRole('row', { name: /مجموعة ثانية/ });
    expect(second).toHaveTextContent(ar.dates.weekdays[0]!);
    expect(second).toHaveTextContent(t.noSupervisors);
  });

  it('shows the empty state without groups', () => {
    render(<GroupsTable rows={[]} timezones={['Asia/Riyadh']} candidates={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(t.empty.title)).toBeInTheDocument();
  });
});
