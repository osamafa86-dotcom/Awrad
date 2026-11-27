import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityRow } from '@/components/overview/ActivityRow';
import { KpiCard } from '@/components/overview/KpiCards';
import { periodDates, type OverviewRow } from '@/lib/overview';
import { ar } from '@/messages/ar';

const t = ar.overview;
const TODAY = '2026-11-26';
const dates = periodDates(TODAY, 14);

describe('KpiCard', () => {
  it('shows the label and the value in the normal variant, without the alert mark', () => {
    render(<KpiCard label={t.kpis.loggedThisWeek} value="82%" />);
    const card = screen.getByRole('group', { name: t.kpis.loggedThisWeek });
    expect(card).toHaveAttribute('data-variant', 'normal');
    expect(within(card).getByText('82%')).toBeInTheDocument();
    expect(within(card).queryByRole('img', { name: t.alertMark })).toBeNull();
  });

  it('marks the alert variant with ⚠ and the alert data-variant', () => {
    render(<KpiCard label={t.kpis.inactive} value="4" alert />);
    const card = screen.getByRole('group', { name: t.kpis.inactive });
    expect(card).toHaveAttribute('data-variant', 'alert');
    expect(within(card).getByRole('img', { name: t.alertMark })).toBeInTheDocument();
    expect(within(card).getByText('4')).toBeInTheDocument();
  });
});

function renderRow(row: OverviewRow) {
  return render(
    <table>
      <tbody>
        <ActivityRow row={row} />
      </tbody>
    </table>,
  );
}

const base: OverviewRow = {
  userId: 'u1',
  fullName: 'عبدالرحمن بن محمد بن عبدالله بن إبراهيم آل سعيد',
  groupName: 'مجموعة الفجر',
  cells: dates.map((date, i) => ({
    date,
    state: (['achieved', 'failed', 'neutral', 'missing'] as const)[i % 4]!,
  })),
  currentStreak: 7,
  completionPct: 88,
  inactive: false,
};

describe('ActivityRow', () => {
  it('renders 14 day cells, each state by its own shape and its label from ar.ts', () => {
    renderRow(base);
    const cells = screen.getAllByRole('img', { name: /.+: .+/ });
    expect(cells).toHaveLength(14);
    expect(cells.map((c) => c.getAttribute('data-state')).slice(0, 4)).toEqual(['achieved', 'failed', 'neutral', 'missing']);
    // The first cell is 13 November, achieved.
    expect(cells[0]).toHaveAccessibleName(`13 نوفمبر: ${ar.dayState.achieved}`);
    expect(cells[1]).toHaveAccessibleName(`14 نوفمبر: ${ar.dayState.failed}`);
    expect(cells[2]).toHaveAccessibleName(`15 نوفمبر: ${ar.dayState.neutral}`);
    expect(cells[3]).toHaveAccessibleName(`16 نوفمبر: ${ar.dayState.missing}`);
    // Shapes, not colour alone (DESIGN.md §7 rule 2): filled, hatched, outlined, dot.
    const glyph = (i: number) => cells[i]!.firstElementChild!;
    expect(glyph(0)).toHaveClass('bg-status-done-fill');
    expect(glyph(1)).toHaveClass('cal-hatch');
    expect(glyph(2)).toHaveClass('border-status-neutral');
    expect(glyph(3).querySelector('.bg-status-missing')).not.toBeNull();
    // Today is the last cell (index 13: failed), with its own label.
    expect(cells[13]).toHaveAccessibleName(`26 نوفمبر: ${ar.students.detail.todaySuffix(ar.dayState.failed)}`);
  });

  it('links the full name to the student page and shows the streak and completion', () => {
    renderRow(base);
    expect(screen.getByRole('link', { name: base.fullName })).toHaveAttribute('href', '/students/u1');
    expect(screen.getByText(base.groupName)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('88%', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: t.inactiveMark })).toBeNull();
  });

  it('carries ⚠ when the person is inactive, and — for unknown numbers', () => {
    renderRow({ ...base, inactive: true, currentStreak: null, completionPct: null });
    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('data-inactive', 'true');
    expect(within(row).getByRole('img', { name: t.inactiveMark })).toBeInTheDocument();
    expect(within(row).getAllByText(t.none)).toHaveLength(2);
  });
});
