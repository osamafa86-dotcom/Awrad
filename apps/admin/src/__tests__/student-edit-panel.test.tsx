import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// jsdom has no ResizeObserver; Radix Switch measures its thumb with one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.mock('@/actions/students', () => ({ updateStudent: vi.fn(), deleteStudent: vi.fn() }));

import { StudentEditPanel } from '@/components/students/StudentEditPanel';

const student = {
  id: 's1',
  fullName: 'أحمد محمد',
  role: 'student' as const,
  groupId: null,
  groupName: null,
  isActive: true,
  isTracked: true,
  joinedAt: '2026-11-01',
  timezone: null,
  weekStartsOn: 0,
};

describe('StudentEditPanel', () => {
  it('offers deactivate and delete on another person', () => {
    render(<StudentEditPanel student={student} groups={[]} today="2026-11-26" />);
    expect(screen.getByRole('button', { name: 'تعطيل الحساب' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف الحساب نهائيًا' })).toBeInTheDocument();
  });

  it('hides deactivate and delete on the admin own profile', () => {
    render(<StudentEditPanel student={student} groups={[]} today="2026-11-26" isSelf />);
    expect(screen.getByRole('button', { name: 'حفظ التغييرات' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعطيل الحساب' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف الحساب نهائيًا' })).not.toBeInTheDocument();
  });
});
