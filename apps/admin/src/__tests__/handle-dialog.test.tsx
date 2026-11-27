import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleSupportRequest = vi.fn();
vi.mock('@/actions/support', () => ({ handleSupportRequest: (...a: unknown[]) => handleSupportRequest(...a) }));

import { HandleDialog } from '@/components/support/HandleDialog';
import type { SupportRequest } from '@/lib/support';
import { ar } from '@/messages/ar';

const t = ar.support;

// Fixture data only (AGENTS.md §3). Long texts: the dialog shows them whole (DESIGN.md §7 rule 9).
const LONG_REVIEW = 'راجعتُ حفظي هذا الأسبوع '.repeat(30).trim();
const LONG_REQUEST = 'أحتاج مساعدة في ترتيب وقت ورد القيام بعد العمل '.repeat(20).trim();

const request: SupportRequest = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '99999999-9999-4999-8999-999999999991',
  studentName: 'طالب أول',
  groupName: 'المجموعة الأولى',
  period: 'weekly',
  periodStart: '2026-11-22',
  reviewText: LONG_REVIEW,
  requestText: LONG_REQUEST,
  status: 'open',
  handledAt: null,
  handledByName: null,
  handledNote: null,
};

async function openDialog() {
  render(<HandleDialog request={request} hijriAdjustment={0} />);
  await userEvent.click(screen.getByRole('button', { name: t.handle.open }));
  return screen.getByRole('dialog', { name: t.handle.title });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('HandleDialog', () => {
  it('shows the student, the week and both texts in full', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByText('طالب أول')).toBeInTheDocument();
    expect(within(dialog).getByText(/22 نوفمبر 2026/)).toBeInTheDocument();
    const review = within(dialog).getByText(LONG_REVIEW);
    const text = within(dialog).getByText(LONG_REQUEST);
    for (const el of [review, text]) {
      expect(el.textContent).toBe(el === review ? LONG_REVIEW : LONG_REQUEST);
      expect(el.className).not.toMatch(/truncate|line-clamp/); // why: asserts there is no clamp class
    }
  });

  it('needs nothing: «تمّت المعالجة» without a note sends an empty one and closes on success', async () => {
    handleSupportRequest.mockResolvedValue({ ok: true });
    const dialog = await openDialog();
    const buttons = within(dialog).getAllByRole('button');
    // The primary action is last in the line (DESIGN.md §7 rule 3).
    expect(buttons.at(-1)).toHaveTextContent(t.handle.submit);
    await userEvent.click(within(dialog).getByRole('button', { name: t.handle.submit }));
    expect(handleSupportRequest).toHaveBeenCalledWith(request.id, '');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends the internal note', async () => {
    handleSupportRequest.mockResolvedValue({ ok: true });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(t.handle.note), 'اتصلتُ به');
    await userEvent.click(within(dialog).getByRole('button', { name: t.handle.submit }));
    expect(handleSupportRequest).toHaveBeenCalledWith(request.id, 'اتصلتُ به');
  });

  it.each(['FORBIDDEN', 'INVALID_ITEM'] as const)('shows the mapped message for %s and stays open', async (code) => {
    handleSupportRequest.mockResolvedValue({ ok: false, code });
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: t.handle.submit }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(t.errors[code]);
    expect(screen.getByRole('dialog', { name: t.handle.title })).toBeInTheDocument();
  });
});
