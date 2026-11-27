import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors } from '@awrad/design-tokens';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import SummaryScreen from '../app/(tabs)/summary';
import { HabitBar } from '../src/components/HabitBar';
import { resetSettingsCache } from '../src/hooks/useSettings';
import { ar } from '../src/messages/ar';
import { resetFakeDb } from './helpers/today-fixture';

jest.mock('../src/lib/supabase', () => ({
  supabase: jest.requireActual('./helpers/today-fixture').fakeSupabase,
}));
jest.mock('../src/hooks/SessionProvider', () => ({
  useAppSession: () => {
    const f = jest.requireActual('./helpers/today-fixture');
    return { session: { user: { id: f.USER_ID } }, profile: f.fakeProfile, loading: false, error: null };
  },
}));
const mockGetSummary = jest.fn();
const mockGetCalendar = jest.fn();
jest.mock('@awrad/supabase-client', () => ({
  getStudentSummary: (...a: unknown[]) => mockGetSummary(...a),
  getCalendar: (...a: unknown[]) => mockGetCalendar(...a),
}));
jest.mock('@awrad/domain', () => ({
  ...jest.requireActual('@awrad/domain'),
  todayIn: () => '2026-11-26',
}));
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn() },
}));

const iso = (s: string) => `⁦${s}⁩`;
const summary = {
  daysLogged: 86,
  completionPct: 91,
  attendancePct: 75,
  longestStreak: 23,
  currentStreak: 12,
  perHabit: [
    { habitId: 'h1', slug: 'quran', name: 'ورد القرآن', completionPct: 90 },
    { habitId: 'h2', slug: 'adhkar', name: 'أذكار الصباح', completionPct: 40 },
    { habitId: 'h3', slug: 'qiyam', name: 'قيام الليل', completionPct: null },
  ],
  weekly: { weeksLogged: 11, completionPct: 84 },
};

async function renderSummary() {
  const utils = await render(<SummaryScreen />);
  await screen.findByTestId('stat-days');
  return utils;
}
const stat = (id: string) => within(screen.getByTestId(id));
const valueStyle = (id: string) => StyleSheet.flatten(screen.getByTestId(`${id}-value`).props.style);

beforeEach(async () => {
  jest.clearAllMocks();
  resetFakeDb();
  resetSettingsCache();
  await AsyncStorage.clear();
  mockGetSummary.mockResolvedValue(summary);
  mockGetCalendar.mockResolvedValue([]);
});

describe('summary screen — stat cards', () => {
  test('five cards show the summary values', async () => {
    await renderSummary();
    expect(stat('stat-days').getByText('86')).toBeTruthy();
    expect(stat('stat-completion').getByText(iso('91%'))).toBeTruthy();
    expect(stat('stat-attendance').getByText(iso('75%'))).toBeTruthy();
    expect(stat('stat-longest-streak').getByText('23')).toBeTruthy();
    expect(stat('stat-current-streak').getByText('12')).toBeTruthy();
    expect(stat('stat-days').getByText(ar.summary.stats.daysLogged)).toBeTruthy();
  });

  test('a null percentage renders a dash', async () => {
    mockGetSummary.mockResolvedValue({ ...summary, attendancePct: null });
    await renderSummary();
    expect(stat('stat-attendance').getByText('—')).toBeTruthy();
  });

  test('streak numbers are gold only when above zero', async () => {
    await renderSummary();
    expect(valueStyle('stat-current-streak').color).toBe(lightColors.goldText);
    expect(valueStyle('stat-days').color).toBe(lightColors.textPrimary);
    expect(stat('stat-current-streak').getByTestId('streak-flame')).toBeTruthy();
  });

  test('a zero streak is not gold', async () => {
    mockGetSummary.mockResolvedValue({ ...summary, currentStreak: 0, longestStreak: 0 });
    await renderSummary();
    expect(valueStyle('stat-current-streak').color).toBe(lightColors.textPrimary);
    expect(valueStyle('stat-longest-streak').color).toBe(lightColors.textPrimary);
  });
});

describe('summary screen — range', () => {
  test('defaults to 30 days: from = today-29, to = today', async () => {
    await renderSummary();
    expect(mockGetSummary).toHaveBeenLastCalledWith(expect.anything(), { from: '2026-10-28', to: '2026-11-26' });
    expect(screen.getByRole('tab', { name: ar.summary.range.d30 }).props.accessibilityState.selected).toBe(true);
  });

  test('90 days: from = today-89', async () => {
    await renderSummary();
    await fireEvent.press(screen.getByRole('tab', { name: ar.summary.range.d90 }));
    await waitFor(() =>
      expect(mockGetSummary).toHaveBeenLastCalledWith(expect.anything(), { from: '2026-08-29', to: '2026-11-26' }),
    );
  });

  test('all: no from/to', async () => {
    await renderSummary();
    await fireEvent.press(screen.getByRole('tab', { name: ar.summary.range.all }));
    await waitFor(() => expect(mockGetSummary).toHaveBeenLastCalledWith(expect.anything(), {}));
  });

  test('the chosen range survives a remount', async () => {
    const first = await renderSummary();
    await fireEvent.press(screen.getByRole('tab', { name: ar.summary.range.d90 }));
    await waitFor(() => expect(mockGetSummary).toHaveBeenCalledTimes(2));
    await waitFor(async () => expect(await AsyncStorage.getItem('pref:summary:range')).toBe('90d'));
    await first.unmount();
    mockGetSummary.mockClear();
    await renderSummary();
    expect(mockGetSummary).toHaveBeenCalledTimes(1);
    expect(mockGetSummary).toHaveBeenLastCalledWith(expect.anything(), { from: '2026-08-29', to: '2026-11-26' });
    expect(screen.getByRole('tab', { name: ar.summary.range.d90 }).props.accessibilityState.selected).toBe(true);
  });
});

describe('summary screen — calendar', () => {
  const days = [
    { date: '2026-11-01', state: 'achieved', completionPct: 100 },
    { date: '2026-11-02', state: 'failed', completionPct: 40 },
    { date: '2026-11-03', state: 'neutral', completionPct: null },
    { date: '2026-11-04', state: 'missing', completionPct: null },
    { date: '2026-11-26', state: 'achieved', completionPct: 100 },
  ];

  test('asks for the whole Gregorian month', async () => {
    mockGetCalendar.mockResolvedValue(days);
    await renderSummary();
    await screen.findByLabelText('1 نوفمبر: مُنجَز');
    expect(mockGetCalendar).toHaveBeenLastCalledWith(expect.anything(), 'u-1', '2026-11-01', '2026-11-30');
  });

  test('each state has its own shape marker, plus today and future', async () => {
    mockGetCalendar.mockResolvedValue(days);
    await renderSummary();
    const cell = async (label: string) => within(await screen.findByLabelText(label));
    expect((await cell('1 نوفمبر: مُنجَز')).getByTestId('cell-achieved')).toBeTruthy();
    expect((await cell('2 نوفمبر: غير مُنجَز')).getByTestId('cell-failed-hatch')).toBeTruthy();
    expect((await cell('3 نوفمبر: بلا تكليف')).getByTestId('cell-neutral')).toBeTruthy();
    expect((await cell('4 نوفمبر: غير مسجَّل')).getByTestId('cell-missing-dot')).toBeTruthy();
    expect((await cell('27 نوفمبر: لم يأتِ بعد')).getByTestId('cell-future')).toBeTruthy();
    const today = await cell('26 نوفمبر: مُنجَز، اليوم');
    expect(today.getByTestId('cell-today')).toBeTruthy();
    expect(today.getByTestId('cell-achieved')).toBeTruthy();
    expect(screen.getAllByTestId('cell-today')).toHaveLength(1);
    // The four states never share a marker.
    expect(within(await screen.findByLabelText('1 نوفمبر: مُنجَز')).queryByTestId('cell-failed-hatch')).toBeNull();
  });

  test('previous month navigates; next is disabled on the current month', async () => {
    await renderSummary();
    await screen.findByText(ar.summary.monthYear('2026-11'));
    expect(screen.getByRole('button', { name: ar.summary.nextMonth }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: ar.summary.prevMonth }));
    await screen.findByText(ar.summary.monthYear('2026-10'));
    await waitFor(() =>
      expect(mockGetCalendar).toHaveBeenLastCalledWith(expect.anything(), 'u-1', '2026-10-01', '2026-10-31'),
    );
    expect(screen.getByRole('button', { name: ar.summary.nextMonth }).props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: ar.summary.nextMonth }));
    await screen.findByText(ar.summary.monthYear('2026-11'));
  });
});

describe('summary screen — habit bars and weekly block', () => {
  test('per-habit bars with names and widths; null → dash', async () => {
    await renderSummary();
    const quran = within(screen.getByTestId('habit-bar-quran'));
    expect(quran.getByText('ورد القرآن')).toBeTruthy();
    expect(quran.getByText(iso('90%'))).toBeTruthy();
    expect(StyleSheet.flatten(quran.getByTestId('habit-bar-fill').props.style).width).toBe('90%');
    const qiyam = within(screen.getByTestId('habit-bar-qiyam'));
    expect(qiyam.getByText('—')).toBeTruthy();
    expect(StyleSheet.flatten(qiyam.getByTestId('habit-bar-fill').props.style).width).toBe('0%');
    expect(screen.getByText(ar.summary.habitsTitle)).toBeTruthy();
  });

  test('weekly block shows weeks and percentage', async () => {
    await renderSummary();
    expect(screen.getByText(`الأسبوعي: 11 أسبوعًا · ${iso('84%')}`)).toBeTruthy();
  });

  test.each([
    [1, 'أسبوع واحد'],
    [2, 'أسبوعان'],
    [5, '5 أسابيع'],
    [11, '11 أسبوعًا'],
  ])('weekly block plural for %i weeks', async (n, text) => {
    mockGetSummary.mockResolvedValue({ ...summary, weekly: { weeksLogged: n, completionPct: 84 } });
    await renderSummary();
    expect(screen.getByText(`الأسبوعي: ${text} · ${iso('84%')}`)).toBeTruthy();
  });

  test('weekly block hidden when weekly is null', async () => {
    mockGetSummary.mockResolvedValue({ ...summary, weekly: null });
    await renderSummary();
    expect(screen.queryByText(/^الأسبوعي/)).toBeNull();
  });
});

describe('HabitBar', () => {
  test('renders name, value and width', async () => {
    await render(<HabitBar name="ورد" pct={55} testID="b" />);
    expect(screen.getByText('ورد')).toBeTruthy();
    expect(screen.getByText(iso('55%'))).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('habit-bar-fill').props.style).width).toBe('55%');
  });
  test('null shows a dash and an empty bar', async () => {
    await render(<HabitBar name="ورد" pct={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('habit-bar-fill').props.style).width).toBe('0%');
  });
});

describe('summary screen — empty and error', () => {
  test('nothing logged → empty state with a button to Today, no cards or calendar', async () => {
    mockGetSummary.mockResolvedValue({ ...summary, daysLogged: 0, weekly: null, perHabit: [] });
    await render(<SummaryScreen />);
    await screen.findByText(ar.summary.empty.title);
    expect(screen.getByText(ar.summary.empty.body)).toBeTruthy();
    expect(screen.queryByTestId('stat-days')).toBeNull();
    expect(screen.queryByTestId('calendar-title')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: ar.summary.empty.action }));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/today');
  });

  test('only weekly logs → not empty', async () => {
    mockGetSummary.mockResolvedValue({ ...summary, daysLogged: 0 });
    await renderSummary();
    expect(screen.queryByText(ar.summary.empty.title)).toBeNull();
  });

  test('a failed load shows a banner; retry calls the RPC again', async () => {
    mockGetSummary.mockRejectedValueOnce(new Error('offline'));
    await render(<SummaryScreen />);
    await screen.findByText(ar.summary.loadFailed);
    expect(mockGetSummary).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: ar.common.retry }));
    await screen.findByTestId('stat-days');
    expect(mockGetSummary).toHaveBeenCalledTimes(2);
  });
});
