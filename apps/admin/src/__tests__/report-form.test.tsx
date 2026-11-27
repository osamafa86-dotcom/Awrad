import { toHijri } from '@awrad/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReportForm } from '@/components/reports/ReportForm';
import { ar } from '@/messages/ar';

const t = ar.reports;
const groups = [{ id: '11111111-1111-4111-8111-111111111111', name: 'المجموعة الأولى' }];

function setup(props: Partial<Parameters<typeof ReportForm>[0]> = {}) {
  render(<ReportForm groups={groups} today="2026-11-27" hijriAdjustment={0} {...props} />);
}

function link() {
  return screen.getByRole('link', { name: t.download });
}

describe('ReportForm (a10)', () => {
  it('starts on the daily report for this month and all groups, linking to the export', () => {
    setup();
    expect(link()).toHaveAttribute('href', '/api/export?kind=daily&from=2026-11-01&to=2026-11-30&group=all');
    expect(link()).toHaveAttribute('download');
    expect(screen.getByRole('button', { name: t.presets.thisMonth })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(t.excelNote)).toBeInTheDocument();
  });

  it('a preset fills both dates', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: t.presets.last30 }));
    expect(screen.getByLabelText(t.from)).toHaveValue('2026-10-29');
    expect(screen.getByLabelText(t.to)).toHaveValue('2026-11-27');
    expect(link()).toHaveAttribute('href', expect.stringContaining('from=2026-10-29&to=2026-11-27'));
    expect(screen.getByRole('button', { name: t.presets.thisMonth })).toHaveAttribute('aria-pressed', 'false');
  });

  it('each date shows its Hijri equivalent next to the label', () => {
    setup({ hijriAdjustment: 1 });
    expect(screen.getByLabelText(t.from)).toHaveAccessibleDescription(toHijri('2026-11-01', 1).formatted);
  });

  it('a start after the end disables the download with one reason', () => {
    setup();
    fireEvent.change(screen.getByLabelText(t.from), { target: { value: '2026-12-15' } });
    expect(screen.queryByRole('link', { name: t.download })).toBeNull();
    const button = screen.getByRole('button', { name: t.download });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(t.invalid.order);
  });

  it('without groups it says the file will be empty', () => {
    setup({ groups: [] });
    expect(screen.getByText(t.noGroups)).toBeInTheDocument();
  });
});
