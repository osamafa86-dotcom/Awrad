import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/students',
  useSearchParams: () => new URLSearchParams(),
}));

import { StudentsTable } from '@/components/students/StudentsTable';
import type { StudentRow } from '@/lib/students';

const groups = [
  { id: 'g1', name: 'مجموعة الفجر' },
  { id: 'g2', name: 'مجموعة العصر' },
];

const rows: StudentRow[] = [
  { id: 's1', fullName: 'أحمد محمد', role: 'student', groupId: 'g1', groupName: 'مجموعة الفجر', isActive: true, isTracked: true, joinedAt: '2026-11-26' },
  { id: 's2', fullName: 'خالد سعيد', role: 'student', groupId: 'g2', groupName: 'مجموعة العصر', isActive: false, isTracked: true, joinedAt: '2026-10-01' },
  { id: 's3', fullName: 'أحمد علي', role: 'supervisor', groupId: 'g1', groupName: 'مجموعة الفجر', isActive: true, isTracked: false, joinedAt: '2026-09-15' },
];

function names() {
  return screen.getAllByRole('row').slice(1).map((row) => within(row).getByRole('link').textContent);
}

describe('StudentsTable', () => {
  it('lists every student with a link to their page, group, status and joined date', () => {
    render(<StudentsTable rows={rows} groups={groups} canInvite filters={{}} />);
    expect(names()).toEqual(['أحمد محمد', 'خالد سعيد', 'أحمد علي']);
    expect(screen.getByRole('link', { name: 'أحمد محمد' })).toHaveAttribute('href', '/students/s1');
    const row = screen.getByRole('row', { name: /خالد سعيد/ });
    expect(within(row).getByText('مجموعة العصر')).toBeInTheDocument();
    expect(within(row).getByText('معطَّل')).toBeInTheDocument();
    expect(within(row).getByText('1 أكتوبر 2026')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /أحمد محمد/ })).getByText('نشط')).toBeInTheDocument();
  });

  it('filters by name as the user types', async () => {
    const user = userEvent.setup();
    render(<StudentsTable rows={rows} groups={groups} canInvite filters={{}} />);
    await user.type(screen.getByRole('searchbox', { name: 'ابحث بالاسم' }), 'أحمد');
    expect(names()).toEqual(['أحمد محمد', 'أحمد علي']);
    await user.type(screen.getByRole('searchbox', { name: 'ابحث بالاسم' }), ' علي');
    expect(names()).toEqual(['أحمد علي']);
  });

  it('says so when nothing matches the search', async () => {
    const user = userEvent.setup();
    render(<StudentsTable rows={rows} groups={groups} canInvite filters={{}} />);
    await user.type(screen.getByRole('searchbox', { name: 'ابحث بالاسم' }), 'زيد');
    expect(screen.getByText('لا أحد بهذا الاسم.')).toBeInTheDocument();
  });

  it('shows the invite button to an admin and hides it from a supervisor', () => {
    const { unmount } = render(<StudentsTable rows={rows} groups={groups} canInvite filters={{}} />);
    expect(screen.getByRole('link', { name: 'دعوة طالب' })).toHaveAttribute('href', '/students/new');
    unmount();
    render(<StudentsTable rows={rows} groups={groups} canInvite={false} filters={{}} />);
    expect(screen.queryByRole('link', { name: 'دعوة طالب' })).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no students at all', () => {
    render(<StudentsTable rows={[]} groups={groups} canInvite filters={{}} />);
    expect(screen.getByText('لا طلاب بعد')).toBeInTheDocument();
  });
});
