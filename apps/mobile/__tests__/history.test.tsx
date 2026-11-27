import { toHijri } from '@awrad/domain';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import HistoryScreen from '../app/(tabs)/history';
import { StatusChip } from '../src/components/StatusChip';
import { resetSettingsCache } from '../src/hooks/useSettings';
import { ar } from '../src/messages/ar';
import { fakeDb, resetFakeDb, USER_ID, type FakeLogRow } from './helpers/today-fixture';

jest.mock('../src/lib/supabase', () => ({
  supabase: jest.requireActual('./helpers/today-fixture').fakeSupabase,
}));
jest.mock('../src/hooks/SessionProvider', () => ({
  useAppSession: () => {
    const f = jest.requireActual('./helpers/today-fixture');
    return { session: { user: { id: f.USER_ID } }, profile: f.fakeProfile, loading: false, error: null };
  },
}));
const mockGetCalendar = jest.fn();
jest.mock('@awrad/supabase-client', () => ({
  getCalendar: (...a: unknown[]) => mockGetCalendar(...a),
}));
let mockToday = '2026-11-26';
jest.mock('@awrad/domain', () => ({
  ...jest.requireActual('@awrad/domain'),
  todayIn: () => mockToday,
}));
const mockPush = jest.fn();
// The latest focus callback the screen registered; tests call it to simulate coming back to the tab.
let mockFocusCb: (() => void) | null = null;
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...a: unknown[]) => mockPush(...a), navigate: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    mockFocusCb = cb;
  },
}));

const DAY_MS = 86_400_000;
const dayAt = (offset: number) =>
  new Date(Date.UTC(2026, 10, 26) - offset * DAY_MS).toISOString().slice(0, 10);

const STATES: Record<string, { state: string; completionPct: number | null }> = {
  '2026-11-26': { state: 'achieved', completionPct: 100 },
  '2026-11-25': { state: 'failed', completionPct: 60 },
  '2026-11-24': { state: 'neutral', completionPct: null },
  '2026-11-23': { state: 'missing', completionPct: null },
};

function addLog(period: 'daily' | 'weekly', date: string) {
  fakeDb.logs[`${period}:${date}`] = {
    id: `l-${period}-${date}`,
    user_id: USER_ID,
    period,
    period_start: date,
    note: null,
    log_entries: [],
  } as FakeLogRow;
}
const calendarRows = (from: string, to: string) => {
  const out = [];
  for (let d = from; d <= to; d = new Date(Date.parse(d) + DAY_MS).toISOString().slice(0, 10)) {
    out.push({ date: d, ...(STATES[d] ?? { state: 'achieved', completionPct: 100 }) });
  }
  return out;
};

async function renderHistory() {
  const utils = await render(<HistoryScreen />);
  await screen.findByTestId('history-row-2026-11-26');
  return utils;
}
const flush = () => act(async () => {});
const row = (date: string) => screen.getByTestId(`history-row-${date}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockToday = '2026-11-26';
  mockFocusCb = null;
  resetFakeDb();
  resetSettingsCache();
  for (const d of ['2026-11-26', '2026-11-25', '2026-11-24', '2026-11-23']) addLog('daily', d);
  mockGetCalendar.mockImplementation((_c: unknown, _u: string, from: string, to: string) =>
    Promise.resolve(calendarRows(from, to)),
  );
});

describe('StatusChip', () => {
  test.each([
    ['achieved', ar.history.chip.achieved],
    ['failed', ar.history.chip.failed],
    ['neutral', ar.history.chip.neutral],
    ['missing', ar.history.chip.missing],
  ] as const)('%s renders its own shape marker and label', async (state, label) => {
    await render(<StatusChip state={state} />);
    expect(screen.getByTestId(`status-chip-${state}`)).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText(label)).toBeTruthy();
  });
});

describe('history list — daily', () => {
  test('shows Hijri primary and Gregorian secondary date per row', async () => {
    await renderHistory();
    const hijri = toHijri('2026-11-26').formatted;
    expect(within(row('2026-11-26')).getByText(hijri)).toBeTruthy();
    expect(within(row('2026-11-26')).getByText(ar.today.gregorianDate(26, 'نوفمبر', 2026))).toBeTruthy();
  });

  test('one StatusChip per daily row, with the four states', async () => {
    await renderHistory();
    expect(within(row('2026-11-26')).getByTestId('status-chip-achieved')).toBeTruthy();
    expect(within(row('2026-11-25')).getByTestId('status-chip-failed')).toBeTruthy();
    expect(within(row('2026-11-24')).getByTestId('status-chip-neutral')).toBeTruthy();
    expect(within(row('2026-11-23')).getByTestId('status-chip-missing')).toBeTruthy();
  });

  test('today and the backfill window are editable; the badge is not shown on today', async () => {
    await renderHistory();
    expect(within(row('2026-11-26')).queryByText(ar.history.editable)).toBeNull();
    expect(within(row('2026-11-26')).queryByTestId('history-lock-2026-11-26')).toBeNull();
    expect(within(row('2026-11-25')).getByText(ar.history.editable)).toBeTruthy();
    expect(within(row('2026-11-24')).getByText(ar.history.editable)).toBeTruthy();
    expect(within(row('2026-11-24')).queryByTestId('history-lock-2026-11-24')).toBeNull();
  });

  test('a day beyond the window shows the lock with a read-only hint', async () => {
    await renderHistory();
    expect(within(row('2026-11-23')).getByTestId('history-lock-2026-11-23')).toBeTruthy();
    expect(within(row('2026-11-23')).queryByText(ar.history.editable)).toBeNull();
    expect(row('2026-11-23').props.accessibilityHint).toBe(ar.history.readOnlyHint);
  });

  test('tapping a row pushes the detail route', async () => {
    await renderHistory();
    await fireEvent.press(row('2026-11-24'));
    expect(mockPush).toHaveBeenCalledWith('/log/daily/2026-11-24');
  });

  test('requests page 0 as range(0, 19), newest first, for the signed-in user', async () => {
    await renderHistory();
    const call = fakeDb.calls.find((c) => c.table === 'logs' && c.range)!;
    expect(call.range).toEqual([0, 19]);
    expect(call.order).toEqual(['period_start', { ascending: false }]);
    expect(call.filters).toMatchObject({ user_id: USER_ID, period: 'daily' });
    expect(call.select).toBe('id, period, period_start, note, updated_at');
  });
});

describe('history list — paging', () => {
  beforeEach(() => {
    fakeDb.logs = {};
    // 45 daily logs, every fourth day, so a page spans > 62 days.
    for (let i = 0; i < 45; i++) addLog('daily', dayAt(i * 4));
  });

  test('loadMore asks for range(20, 39); chunks never exceed 62 days', async () => {
    await renderHistory();
    const list = screen.getByTestId('history-list');
    await fireEvent(list, 'endReached');
    await waitFor(() =>
      expect(fakeDb.calls.some((c) => c.table === 'logs' && c.range?.[0] === 20 && c.range[1] === 39)).toBe(
        true,
      ),
    );
    await waitFor(() => expect(mockGetCalendar.mock.calls.length).toBeGreaterThan(2));
    await flush();
    for (const [, , from, to] of mockGetCalendar.mock.calls as [unknown, string, string, string][]) {
      const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
      expect(days).toBeLessThanOrEqual(62);
    }
  });

  test('stops asking once a short page arrives', async () => {
    await renderHistory();
    const list = screen.getByTestId('history-list');
    await fireEvent(list, 'endReached');
    await waitFor(() => expect(fakeDb.calls.filter((c) => c.range).length).toBe(2));
    await flush();
    await fireEvent(list, 'endReached');
    await waitFor(() =>
      expect(fakeDb.calls.some((c) => c.range?.[0] === 40 && c.range[1] === 59)).toBe(true),
    );
    await flush();
    const before = fakeDb.calls.filter((c) => c.range).length;
    await fireEvent(list, 'endReached');
    await flush();
    expect(fakeDb.calls.filter((c) => c.range).length).toBe(before);
  });
});

describe('history list — weekly', () => {
  beforeEach(() => {
    addLog('weekly', '2026-11-22');
    addLog('weekly', '2026-11-15');
  });

  test('weekly tab lists weeks with labels; grace decides editability', async () => {
    await renderHistory();
    await fireEvent.press(screen.getByRole('tab', { name: ar.history.tabs.weekly }));
    await screen.findByTestId('history-row-2026-11-22');
    expect(screen.getByText(ar.weekly.title('22 نوفمبر', '28 نوفمبر'))).toBeTruthy();
    expect(screen.getByText(ar.weekly.title('15 نوفمبر', '21 نوفمبر'))).toBeTruthy();
    // week 22–28: today (26) is inside it → editable, with the badge (not "today")
    expect(within(row('2026-11-22')).queryByTestId('history-lock-2026-11-22')).toBeNull();
    // week 15–21 ended 5 days ago, grace is 3 days → locked
    expect(within(row('2026-11-15')).getByTestId('history-lock-2026-11-15')).toBeTruthy();
    // weekly rows carry no day state chip, only «مسجَّل»
    expect(within(row('2026-11-22')).queryByTestId('status-chip-achieved')).toBeNull();
    expect(within(row('2026-11-22')).getByText(ar.history.weeklyLogged)).toBeTruthy();
  });

  test('tapping a week pushes the weekly detail route', async () => {
    await renderHistory();
    await fireEvent.press(screen.getByRole('tab', { name: ar.history.tabs.weekly }));
    await screen.findByTestId('history-row-2026-11-15');
    await fireEvent.press(row('2026-11-15'));
    expect(mockPush).toHaveBeenCalledWith('/log/weekly/2026-11-15');
  });
});

describe('history list — empty and error', () => {
  test('no logs → EmptyState', async () => {
    fakeDb.logs = {};
    await render(<HistoryScreen />);
    expect(await screen.findByText(ar.history.empty.title)).toBeTruthy();
    expect(screen.getByText(ar.history.empty.body)).toBeTruthy();
  });

  test('a failed read shows the banner and retry reloads', async () => {
    fakeDb.failLogList = true;
    await render(<HistoryScreen />);
    expect(await screen.findByText(ar.history.loadFailed)).toBeTruthy();
    fakeDb.failLogList = false;
    await fireEvent.press(screen.getByRole('button', { name: ar.history.retry }));
    expect(await screen.findByTestId('history-row-2026-11-26')).toBeTruthy();
    expect(screen.queryByText(ar.history.loadFailed)).toBeNull();
  });
});

describe('history list — focus refresh', () => {
  test('coming back re-reads page 0 and updates rows without emptying the list', async () => {
    await renderHistory();
    expect(within(row('2026-11-25')).getByTestId('status-chip-failed')).toBeTruthy();
    const before = fakeDb.calls.filter((c) => c.range?.[0] === 0).length;
    STATES['2026-11-25'] = { state: 'achieved', completionPct: 100 };
    try {
      await act(async () => {
        mockFocusCb?.();
      });
      // right after the call the rows are still there (no spinner, no empty state)
      expect(screen.getByTestId('history-row-2026-11-26')).toBeTruthy();
      await waitFor(() =>
        expect(within(row('2026-11-25')).getByTestId('status-chip-achieved')).toBeTruthy(),
      );
      expect(fakeDb.calls.filter((c) => c.range?.[0] === 0 && c.range[1] === 19).length).toBe(before + 1);
      expect(screen.queryByText(ar.history.loading)).toBeNull();
    } finally {
      STATES['2026-11-25'] = { state: 'failed', completionPct: 60 };
    }
  });
});

describe('history list — weekly grace boundary', () => {
  beforeEach(() => addLog('weekly', '2026-11-15'));
  const open = async () => {
    await render(<HistoryScreen />);
    await screen.findByTestId('history-row-2026-11-26');
    await fireEvent.press(screen.getByRole('tab', { name: ar.history.tabs.weekly }));
    await screen.findByTestId('history-row-2026-11-15');
  };
  test('weekEnd + 3 days is still editable', async () => {
    mockToday = '2026-11-24';
    await open();
    expect(within(row('2026-11-15')).queryByTestId('history-lock-2026-11-15')).toBeNull();
  });
  test('weekEnd + 4 days is locked', async () => {
    mockToday = '2026-11-25';
    await open();
    expect(within(row('2026-11-15')).getByTestId('history-lock-2026-11-15')).toBeTruthy();
  });
});

describe('history list — loadMore failure', () => {
  test('a failed page 1 shows a footer retry; retry re-requests range(20, 39); page 0 stays', async () => {
    fakeDb.logs = {};
    for (let i = 0; i < 30; i++) addLog('daily', dayAt(i));
    await renderHistory();
    fakeDb.failLogList = 20;
    await fireEvent(screen.getByTestId('history-list'), 'endReached');
    expect(await screen.findByText(ar.history.loadFailed)).toBeTruthy();
    expect(screen.getByTestId('history-row-2026-11-26')).toBeTruthy();
    const calendarCalls = mockGetCalendar.mock.calls.length;
    fakeDb.failLogList = false;
    const before = fakeDb.calls.filter((c) => c.range?.[0] === 20).length;
    await fireEvent.press(screen.getByRole('button', { name: ar.history.retry }));
    await waitFor(() => expect(fakeDb.calls.filter((c) => c.range?.[0] === 20).length).toBe(before + 1));
    await waitFor(() => expect(screen.queryByText(ar.history.loadFailed)).toBeNull());
    expect(screen.getByTestId('history-row-2026-11-26')).toBeTruthy();
    // page 0's calendar chunk is not requested again (only page 1's)
    expect(mockGetCalendar.mock.calls.length).toBe(calendarCalls + 1);
  });
});
