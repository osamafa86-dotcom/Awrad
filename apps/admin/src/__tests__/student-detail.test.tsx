import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/students', () => ({ updateStudent: vi.fn(), deleteStudent: vi.fn() }));

import { StudentDetail, type StudentDetailProps } from '@/components/students/StudentDetail';

const student = {
  id: 's1',
  fullName: 'أحمد محمد',
  role: 'student' as const,
  groupId: 'g1',
  groupName: 'المجموعة الأولى',
  isActive: true,
  isTracked: true,
  joinedAt: '2025-09-01',
  timezone: null,
  weekStartsOn: 0,
};

// A daily note far past the old 140-character excerpt, with a line break.
const LONG_NOTE = `${'قرأتُ الورد كاملًا بعد الفجر وراجعتُ ما حفظتُ في الأسبوع الماضي، '.repeat(5)}\nوالسطر الثاني من الملاحظة.`;

const ROW = {
  period: 'daily' as const,
  periodStart: '2026-11-26',
  state: 'achieved' as const,
  completionPct: 100,
  text: LONG_NOTE,
  supportStatus: 'none' as const,
};

function props(overrides: Partial<StudentDetailProps> = {}): StudentDetailProps {
  return {
    student,
    today: '2026-11-27',
    month: '2026-10',
    hijriAdjustment: 0,
    summary: { ok: false },
    calendar: { ok: true, data: new Map() },
    logs: {
      ok: true,
      data: { rows: [ROW], hasMore: true },
    },
    attendance: { ok: true, data: [] },
    canEdit: false,
    groups: [],
    links: { prevMonth: '/students/s1?month=2026-09', nextMonth: '/students/s1?month=2026-11', olderLogs: '/students/s1?month=2026-10&logs=60' },
    ...overrides,
  };
}

describe('StudentDetail — the full record (F-61, DESIGN.md §7 rule 9)', () => {
  it('shows a long note in full, as text a phone or keyboard user can read (no excerpt, no tooltip)', () => {
    render(<StudentDetail {...props()} />);
    const cell = screen.getByText((_, node) => node?.textContent === LONG_NOTE && node.tagName === 'TD');
    expect(cell).not.toHaveAttribute('title');
    expect(cell.textContent).not.toContain('…');
    expect(cell.className).toMatch(/whitespace-pre-wrap/);
  });

  it('navigates the calendar month by month with labelled links', () => {
    render(<StudentDetail {...props()} />);
    expect(screen.getByRole('link', { name: 'الشهر السابق' })).toHaveAttribute('href', '/students/s1?month=2026-09');
    expect(screen.getByRole('link', { name: 'الشهر التالي' })).toHaveAttribute('href', '/students/s1?month=2026-11');
  });

  it('has no next link on the current month, and no previous link at the joined month', () => {
    render(<StudentDetail {...props({ links: { prevMonth: null, nextMonth: null, olderLogs: null } })} />);
    expect(screen.queryByRole('link', { name: 'الشهر السابق' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'الشهر التالي' })).not.toBeInTheDocument();
  });

  it('offers the older logs while there are any', () => {
    render(<StudentDetail {...props()} />);
    const logs = screen.getByRole('region', { name: 'السجلّات' });
    expect(within(logs).getByRole('link', { name: 'عرض السجلّات الأقدم' })).toHaveAttribute(
      'href',
      '/students/s1?month=2026-10&logs=60',
    );
  });

  it('says the record is complete once the oldest log is shown', () => {
    render(
      <StudentDetail
        {...props({
          logs: { ok: true, data: { rows: [ROW], hasMore: false } },
          links: { prevMonth: null, nextMonth: null, olderLogs: null },
        })}
      />,
    );
    expect(screen.queryByRole('link', { name: 'عرض السجلّات الأقدم' })).not.toBeInTheDocument();
    expect(screen.getByText('هذه كل السجلّات.')).toBeInTheDocument();
  });
});
