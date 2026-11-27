import { toHijri } from '@awrad/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CalendarCell } from '../src/components/CalendarCell';
import { MonthCalendar } from '../src/components/MonthCalendar';
import type { CalendarDay } from '../src/hooks/useCalendar';
import { ar } from '../src/messages/ar';

function monthDays(month: string, count: number): CalendarDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    state: 'missing',
    completionPct: null,
    isToday: false,
    isFuture: false,
  }));
}

const base = {
  hijriAdjustment: 0,
  onPrevMonth: jest.fn(),
  onNextMonth: jest.fn(),
  canNext: true,
};

/** The expected Hijri header, computed from toHijri itself. */
function expectedHijri(first: string, last: string, adjustment = 0): string {
  const a = toHijri(first, adjustment);
  const b = toHijri(last, adjustment);
  if (a.year === b.year) {
    return a.month === b.month ? `${a.monthName} ${b.year}` : `${a.monthName} – ${b.monthName} ${b.year}`;
  }
  return `${a.monthName} ${a.year} – ${b.monthName} ${b.year}`;
}

describe('MonthCalendar', () => {
  test('header: Gregorian month + year, Hijri range under it', async () => {
    await render(<MonthCalendar {...base} month="2026-11" days={monthDays('2026-11', 30)} weekStartsOn={0} />);
    expect(screen.getByText('نوفمبر 2026')).toBeTruthy();
    expect(screen.getByTestId('calendar-hijri').props.children).toBe(expectedHijri('2026-11-01', '2026-11-30'));
  });

  test('Hijri header with two years when the month straddles New Year', async () => {
    // 2025-06-20 .. 2025-07-19 spans 1446-12-24 .. 1447-01-23 (Umm al-Qura).
    const a = toHijri('2025-06-20');
    const b = toHijri('2025-07-19');
    expect(a.year).not.toBe(b.year);
    await render(<MonthCalendar {...base} month="2025-06" days={monthDays('2025-06', 30)} weekStartsOn={0} />);
    expect(screen.getByTestId('calendar-hijri').props.children).toBe(expectedHijri('2025-06-01', '2025-06-30'));
  });

  test('weekday header starts at ح for Sunday and س for Saturday', async () => {
    const view = await render(<MonthCalendar {...base} month="2026-11" days={monthDays('2026-11', 30)} weekStartsOn={0} />);
    expect(screen.getByTestId('weekday-0').props.children).toBe('ح');
    expect(screen.getByTestId('weekday-1').props.children).toBe('ن');
    expect(screen.getByTestId('weekday-6').props.children).toBe('س');
    await view.unmount();
    await render(<MonthCalendar {...base} month="2026-11" days={monthDays('2026-11', 30)} weekStartsOn={6} />);
    expect(screen.getByTestId('weekday-0').props.children).toBe('س');
    expect(screen.getByTestId('weekday-1').props.children).toBe('ح');
  });

  test('leading blanks align the 1st under its weekday (1 Nov 2026 is a Sunday)', async () => {
    const view = await render(<MonthCalendar {...base} month="2026-11" days={monthDays('2026-11', 30)} weekStartsOn={0} />);
    expect(screen.getByTestId('grid-row-0').children[0]).toBe(screen.getByTestId('grid-cell-2026-11-01'));
    await view.unmount();
    // Week starting Saturday: Sunday is the second column → one blank first.
    await render(<MonthCalendar {...base} month="2026-11" days={monthDays('2026-11', 30)} weekStartsOn={6} />);
    expect(screen.getByTestId('grid-row-0').children[1]).toBe(screen.getByTestId('grid-cell-2026-11-01'));
    expect(screen.getByTestId('grid-row-0').children[0]).not.toBe(screen.getByTestId('grid-cell-2026-11-01'));
  });

  const blanksInFirstRow = () =>
    screen.getByTestId('grid-row-0').children.filter((c) => !(c as { props: { testID?: string } }).props.testID).length;

  test('February 2026 (28 days, starts on Sunday) fills exactly four rows', async () => {
    await render(<MonthCalendar {...base} month="2026-02" days={monthDays('2026-02', 28)} weekStartsOn={0} />);
    expect(blanksInFirstRow()).toBe(0);
    expect(screen.getByTestId('grid-cell-2026-02-28')).toBeTruthy();
    expect(screen.queryByTestId('grid-row-4')).toBeNull();
  });

  test('August 2026 starts on a Saturday: no blanks for weekStartsOn 6, six for 0', async () => {
    const view = await render(<MonthCalendar {...base} month="2026-08" days={monthDays('2026-08', 31)} weekStartsOn={6} />);
    expect(blanksInFirstRow()).toBe(0);
    await view.unmount();
    await render(<MonthCalendar {...base} month="2026-08" days={monthDays('2026-08', 31)} weekStartsOn={0} />);
    expect(blanksInFirstRow()).toBe(6);
  });

  test('hijriAdjustment shifts the Hijri header', async () => {
    // The header names months only, so look for a month where the shift crosses a Hijri month boundary.
    const months = Array.from({ length: 48 }, (_, i) => `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    const last = (m: string) => `${m}-${new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).getUTCDate()}`;
    const month = months.find(
      (m) => expectedHijri(`${m}-01`, last(m), 1) !== expectedHijri(`${m}-01`, last(m), 0),
    );
    expect(month).toBeDefined();
    await render(<MonthCalendar {...base} month={month!} days={[]} weekStartsOn={0} hijriAdjustment={1} />);
    expect(screen.getByTestId('calendar-hijri').props.children).toBe(
      expectedHijri(`${month}-01`, last(month!), 1),
    );
  });

  test('navigation buttons and canNext', async () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    await render(
      <MonthCalendar {...base} month="2026-11" days={[]} weekStartsOn={0} onPrevMonth={onPrev} onNextMonth={onNext} canNext={false} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: ar.summary.prevMonth }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: ar.summary.nextMonth }));
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('CalendarCell', () => {
  test.each([
    ['achieved', 'cell-achieved'],
    ['failed', 'cell-failed-hatch'],
    ['neutral', 'cell-neutral'],
    ['missing', 'cell-missing-dot'],
  ] as const)('%s → %s', async (state, marker) => {
    await render(<CalendarCell day="2026-11-05" state={state} isToday={false} isFuture={false} completionPct={null} />);
    expect(screen.getByTestId(marker)).toBeTruthy();
    expect(screen.queryByTestId('cell-today')).toBeNull();
    expect(screen.getByText('5')).toBeTruthy();
  });
  test('future wins over state', async () => {
    await render(<CalendarCell day="2026-11-27" state="missing" isToday={false} isFuture completionPct={null} />);
    expect(screen.getByTestId('cell-future')).toBeTruthy();
    expect(screen.queryByTestId('cell-missing-dot')).toBeNull();
  });
});
