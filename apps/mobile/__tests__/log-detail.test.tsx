import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';

import LogDetail from '../app/log/[period]/[date]';
import { resetSettingsCache } from '../src/hooks/useSettings';
import { ar } from '../src/messages/ar';
import { dailyHabits, quran, resetFakeDb, weeklyHabits, memorization } from './helpers/today-fixture';

jest.mock('../src/lib/supabase', () => ({
  supabase: jest.requireActual('./helpers/today-fixture').fakeSupabase,
}));
jest.mock('../src/hooks/SessionProvider', () => ({
  useAppSession: () => {
    const f = jest.requireActual('./helpers/today-fixture');
    return { session: { user: { id: f.USER_ID } }, profile: f.fakeProfile, loading: false, error: null };
  },
}));
const mockFetchActiveHabits = jest.fn();
jest.mock('@awrad/supabase-client', () => ({
  fetchActiveHabits: (...a: unknown[]) => mockFetchActiveHabits(...a),
  saveLog: jest.fn(),
  getStudentSummary: jest.fn().mockResolvedValue({ currentStreak: 0 }),
  getCalendar: jest.fn().mockResolvedValue([]),
  parseRpcError: () => 'UNKNOWN',
}));
let mockToday = '2026-11-26';
jest.mock('@awrad/domain', () => ({
  ...jest.requireActual('@awrad/domain'),
  todayIn: () => mockToday,
}));

const routes = { 'log/[period]/[date]': LogDetail };

beforeEach(async () => {
  jest.clearAllMocks();
  mockToday = '2026-11-26';
  resetFakeDb();
  resetSettingsCache();
  await AsyncStorage.clear();
  mockFetchActiveHabits.mockImplementation((_c: unknown, _d: string, freq: string) =>
    Promise.resolve(freq === 'weekly' ? weeklyHabits : dailyHabits),
  );
});

async function open(url: string, firstHabit: string) {
  await renderRouter(routes, { initialUrl: url });
  await screen.findByLabelText(firstHabit);
}
const save = (label: string) => screen.queryByRole('button', { name: label });

describe('log detail — daily', () => {
  test('a day beyond the window is read-only: banner, no save, no date arrows', async () => {
    await open('/log/daily/2026-11-23', quran.name);
    expect(screen.getByText(ar.today.banner.readOnly)).toBeTruthy();
    expect(save(ar.today.save)).toBeNull();
    expect(screen.queryByRole('button', { name: ar.today.prevDay })).toBeNull();
    expect(screen.queryByRole('button', { name: ar.today.nextDay })).toBeNull();
  });

  test('a day inside the window is editable with the SaveBar, still without date arrows', async () => {
    await open('/log/daily/2026-11-25', quran.name);
    expect(screen.queryByText(ar.today.banner.readOnly)).toBeNull();
    expect(save(ar.today.save)).toBeTruthy();
    expect(screen.queryByRole('button', { name: ar.today.prevDay })).toBeNull();
    expect(screen.queryByRole('button', { name: ar.today.nextDay })).toBeNull();
  });

  test('an unusable date shows an error instead of a log', async () => {
    await renderRouter(routes, { initialUrl: '/log/daily/not-a-date' });
    expect(await screen.findByText(ar.history.invalidLog)).toBeTruthy();
  });
});

describe('log detail — deep-link validation', () => {
  test.each([
    ['/log/daily/2026-11-27', 'a future day'],
    ['/log/weekly/2026-11-16', 'a date that is not a week start'],
    ['/log/weekly/2026-11-29', 'a future week'],
  ])('%s (%s) shows the invalid message', async (url) => {
    await renderRouter(routes, { initialUrl: url });
    expect(await screen.findByText(ar.history.invalidLog)).toBeTruthy();
    expect(screen.queryByRole('button', { name: ar.today.save })).toBeNull();
    expect(screen.queryByRole('button', { name: ar.weekly.save })).toBeNull();
  });
});

describe('log detail — weekly', () => {
  test('grace boundary: weekEnd + 3 editable, weekEnd + 4 read-only', async () => {
    mockToday = '2026-11-24';
    await open('/log/weekly/2026-11-15', memorization.name);
    expect(save(ar.weekly.save)).toBeTruthy();
  });
  test('grace boundary: the day after the grace is read-only', async () => {
    mockToday = '2026-11-25';
    await open('/log/weekly/2026-11-15', memorization.name);
    expect(save(ar.weekly.save)).toBeNull();
    expect(screen.getByText(ar.today.banner.readOnly)).toBeTruthy();
  });

  test('a week past its grace is read-only, without save or week arrows', async () => {
    await open('/log/weekly/2026-11-15', memorization.name);
    expect(screen.getByText(ar.today.banner.readOnly)).toBeTruthy();
    expect(save(ar.weekly.save)).toBeNull();
    expect(screen.queryByRole('button', { name: ar.weekly.prevWeek })).toBeNull();
    expect(screen.queryByRole('button', { name: ar.weekly.nextWeek })).toBeNull();
    expect(screen.getByText(ar.weekly.title('15 نوفمبر', '21 نوفمبر'))).toBeTruthy();
  });

  test('the current week is editable with the SaveBar', async () => {
    await open('/log/weekly/2026-11-22', memorization.name);
    expect(screen.queryByText(ar.today.banner.readOnly)).toBeNull();
    expect(save(ar.weekly.save)).toBeTruthy();
    expect(screen.queryByRole('button', { name: ar.weekly.prevWeek })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: ar.weekly.nextWeek })).toBeNull());
  });
});
