import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/support', () => ({ handleSupportRequest: vi.fn(), dismissDeletionRequest: vi.fn() }));
const deleteStudent = vi.fn();
vi.mock('@/actions/students', () => ({ deleteStudent: (...a: unknown[]) => deleteStudent(...a) }));

import { SupportList, type SupportListProps } from '@/components/support/SupportList';
import type { DeletionRequest, SupportRequest } from '@/lib/support';
import { ar } from '@/messages/ar';

const t = ar.support;

// Fixture data only (AGENTS.md §3).
const request = (over: Partial<SupportRequest>): SupportRequest => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: '99999999-9999-4999-8999-999999999991',
  studentName: 'طالب أول',
  groupName: 'المجموعة الأولى',
  period: 'weekly',
  periodStart: '2026-11-22',
  reviewText: 'أسبوع جيد',
  requestText: 'أحتاج مساعدة في ورد القيام',
  status: 'open',
  handledAt: null,
  handledByName: null,
  handledNote: null,
  ...over,
});

const open = [
  request({}),
  request({
    id: '11111111-1111-4111-8111-111111111112',
    userId: '99999999-9999-4999-8999-999999999992',
    studentName: 'طالب ثان',
    period: 'daily',
    periodStart: '2026-11-25',
    reviewText: null,
    requestText: 'سؤال',
  }),
];
const handled = [
  request({
    id: '11111111-1111-4111-8111-111111111113',
    status: 'handled',
    requestText: 'طلب قديم',
    handledAt: '2026-11-26T10:00:00Z',
    handledByName: 'مشرف المجموعة',
    handledNote: 'اتصلتُ به',
  }),
];
const deletions: DeletionRequest[] = [
  {
    id: '22222222-2222-4222-8222-222222222221',
    userId: '99999999-9999-4999-8999-999999999993',
    studentName: 'طالب يطلب الحذف',
    groupName: 'المجموعة الأولى',
    requestedAt: '2026-10-20T09:00:00Z',
  },
];

function renderList(props: Partial<SupportListProps> = {}) {
  return render(
    <SupportList
      open={open}
      handled={handled}
      deletions={deletions}
      today="2026-11-27"
      timezone="Asia/Riyadh"
      hijriAdjustment={0}
      {...props}
    />,
  );
}

function tab(name: string) {
  return screen.getByRole('tab', { name: new RegExp(name) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SupportList', () => {
  it('has three tabs with their counts; «المفتوحة» is selected', () => {
    renderList();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(tab(t.tabs.open)).toHaveAttribute('aria-selected', 'true');
    expect(within(tab(t.tabs.open)).getByText(t.count(2))).toBeInTheDocument();
    expect(within(tab(t.tabs.handled)).getByText(t.count(1))).toBeInTheDocument();
    expect(within(tab(t.tabs.deletion)).getByText(t.count(1))).toBeInTheDocument();
  });

  it('hides the deletion tab from a supervisor (no deletion list)', () => {
    renderList({ deletions: null });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: new RegExp(t.tabs.deletion) })).toBeNull();
  });

  it('an open request shows the student (linking to their page), the group, the week, the review and the request', () => {
    renderList();
    const item = screen.getByRole('article', { name: 'طالب أول' });
    expect(within(item).getByRole('link', { name: 'طالب أول' })).toHaveAttribute(
      'href',
      '/students/99999999-9999-4999-8999-999999999991',
    );
    expect(within(item).getByText('المجموعة الأولى')).toBeInTheDocument();
    expect(within(item).getByText(/22 نوفمبر 2026/)).toBeInTheDocument();
    expect(within(item).getByText('أسبوع جيد')).toBeInTheDocument();
    expect(within(item).getByText('أحتاج مساعدة في ورد القيام')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: t.handle.open })).toBeInTheDocument();
    // A weekly request carries no frequency chip; a daily one does.
    expect(within(item).queryByText(t.frequency.daily)).toBeNull();
    const daily = screen.getByRole('article', { name: 'طالب ثان' });
    expect(within(daily).getByText(t.frequency.daily)).toBeInTheDocument();
    expect(within(daily).getByText(t.noReview)).toBeInTheDocument();
  });

  it('«المعالَجة» shows the internal note, who handled it and when, without the handle button', async () => {
    renderList();
    await userEvent.click(tab(t.tabs.handled));
    const item = screen.getByRole('article', { name: 'طالب أول' });
    expect(within(item).getByText('اتصلتُ به')).toBeInTheDocument();
    expect(within(item).getByText(t.handledBy('مشرف المجموعة', '26 نوفمبر 2026'))).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: t.handle.open })).toBeNull();
  });

  it('each tab has its own empty state', async () => {
    renderList({ open: [], handled: [], deletions: [] });
    expect(screen.getByText(t.empty.open.title)).toBeInTheDocument();
    await userEvent.click(tab(t.tabs.handled));
    expect(screen.getByText(t.empty.handled.title)).toBeInTheDocument();
    await userEvent.click(tab(t.tabs.deletion));
    expect(screen.getByText(t.empty.deletion.title)).toBeInTheDocument();
  });

  it('a deletion request shows the date, the 30-day deadline and «متأخّر» once it has passed', async () => {
    renderList();
    await userEvent.click(tab(t.tabs.deletion));
    const item = screen.getByRole('article', { name: 'طالب يطلب الحذف' });
    expect(within(item).getByText(/20 أكتوبر 2026/)).toBeInTheDocument();
    expect(within(item).getByText(t.deletion.deadline('19 نوفمبر 2026'))).toBeInTheDocument();
    expect(within(item).getByText(t.deletion.overdue)).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: t.deletion.delete })).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: t.deletion.dismiss })).toBeInTheDocument();
  });

  it('«حذف نهائي» asks for confirmation naming the student, then deletes the account and stays in the inbox', async () => {
    deleteStudent.mockResolvedValue({ ok: true });
    renderList({ initialTab: 'deletion' });
    await userEvent.click(screen.getByRole('button', { name: t.deletion.delete }));
    const dialog = screen.getByRole('dialog', { name: t.deletion.confirmTitle('طالب يطلب الحذف') });
    expect(deleteStudent).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: t.deletion.confirm }));
    expect(deleteStudent).toHaveBeenCalledWith('99999999-9999-4999-8999-999999999993', 'support');
  });
});
