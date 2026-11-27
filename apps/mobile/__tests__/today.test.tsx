import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import TodayScreen from '../app/(tabs)/today';
import { resetSettingsCache } from '../src/hooks/useSettings';
import { ar } from '../src/messages/ar';
import {
  adhkar,
  dailyHabits,
  fakeDb,
  qiyam,
  quran,
  resetFakeDb,
  sahihayn,
  tafsir,
  tristateHabits,
  USER_ID,
} from './helpers/today-fixture';

const TODAY = '2026-11-26';

jest.mock('../src/lib/supabase', () => ({
  supabase: jest.requireActual('./helpers/today-fixture').fakeSupabase,
}));
jest.mock('../src/hooks/SessionProvider', () => ({
  useAppSession: () => {
    const f = jest.requireActual('./helpers/today-fixture');
    return {
      session: { user: { id: f.USER_ID } },
      profile: f.fakeProfile,
      loading: false,
      error: null,
    };
  },
}));
const mockFetchActiveHabits = jest.fn();
const mockSaveLog = jest.fn();
const mockGetStudentSummary = jest.fn();
jest.mock('@awrad/supabase-client', () => ({
  fetchActiveHabits: (...a: unknown[]) => mockFetchActiveHabits(...a),
  saveLog: (...a: unknown[]) => mockSaveLog(...a),
  getStudentSummary: (...a: unknown[]) => mockGetStudentSummary(...a),
  parseRpcError: jest.requireActual('@awrad/supabase-client').parseRpcError,
}));
// Fix "today" in the student's zone (BR-08) instead of the wall clock.
jest.mock('@awrad/domain', () => ({
  ...jest.requireActual('@awrad/domain'),
  todayIn: () => '2026-11-26',
}));

const { supabase } = jest.requireMock('../src/lib/supabase') as { supabase: unknown };

async function renderToday() {
  const utils = await render(<TodayScreen />);
  // The radiogroup is a container (not itself focusable), so it is found by its label.
  await screen.findByLabelText(quran.name);
  return utils;
}

const radio = (habitName: string, label: string) =>
  within(screen.getByLabelText(habitName)).getByRole('radio', { name: label });
const saveButton = () => screen.getByRole('button', { name: ar.today.save });

async function setStatus(habitName: string, label: string) {
  await fireEvent.press(radio(habitName, label));
}

async function setAllTristate(label: string = ar.today.tristate.done) {
  for (const h of tristateHabits) await setStatus(h.name, label);
}

async function checkItems(count: number) {
  for (const item of adhkar.items.slice(0, count)) {
    await fireEvent.press(screen.getByRole('checkbox', { name: item.name }));
  }
}

async function pressSave() {
  await fireEvent.press(saveButton());
  await waitFor(() => expect(mockSaveLog).toHaveBeenCalled());
}

function savedInput() {
  return mockSaveLog.mock.calls.at(-1)![1] as {
    period: string;
    periodStart: string;
    entries: Array<{ habitId: string; status: string; checkedItemIds?: string[] }>;
    note?: string;
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetFakeDb();
  resetSettingsCache();
  await AsyncStorage.clear();
  // Shuffled on purpose: the screen must order by sort_order.
  mockFetchActiveHabits.mockResolvedValue([sahihayn, adhkar, quran, tafsir, qiyam]);
  mockSaveLog.mockResolvedValue('log-1');
  mockGetStudentSummary.mockResolvedValue({ currentStreak: 12 });
});

describe('today screen', () => {
  test('renders 5 daily habits from fetchActiveHabits in sort order', async () => {
    await renderToday();
    expect(mockFetchActiveHabits).toHaveBeenCalledWith(supabase, TODAY, 'daily');
    const names = screen
      .getAllByRole('header')
      .map((h) => h.props.children as unknown)
      .filter((c): c is string => typeof c === 'string' && dailyHabits.some((d) => d.name === c));
    expect(names).toEqual(dailyHabits.map((h) => h.name));
  });

  test('checklist counter shows "10/13" (no spaces) after checking 10 items', async () => {
    await renderToday();
    expect(screen.getByText('0/13')).toBeTruthy();
    await checkItems(10);
    expect(screen.getByText('10/13')).toBeTruthy();
    expect(screen.queryByText('10 / 13')).toBeNull();
  });

  test('save sends SaveLogInput with period daily, periodStart = today, checkedItemIds for checklist', async () => {
    await renderToday();
    await setAllTristate();
    await checkItems(10);
    await pressSave();
    expect(mockSaveLog.mock.calls[0]![0]).toBe(supabase);
    const input = savedInput();
    expect(input.period).toBe('daily');
    expect(input.periodStart).toBe(TODAY);
    expect(input.entries).toHaveLength(5);
    expect(input.entries.map((e) => e.habitId).sort()).toEqual(dailyHabits.map((h) => h.id).sort());
    const checklist = input.entries.find((e) => e.habitId === adhkar.id)!;
    expect(checklist.status).toBe('not_done');
    expect(checklist.checkedItemIds).toEqual(adhkar.items.slice(0, 10).map((i) => i.id));
  });

  test('after save, banner shows "يوم مُنجَز" when all done; "بقي بندان" when 2 missing', async () => {
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.markAllDone }));
    await pressSave();
    expect(await screen.findByText(ar.today.banner.achieved)).toBeTruthy();
    expect(ar.today.banner.achieved).toContain('يوم مُنجَز');

    // Two habits short: qiyam not done and the adhkar list incomplete.
    await setStatus(qiyam.name, ar.today.tristate.notDone);
    await fireEvent.press(screen.getByRole('checkbox', { name: adhkar.items[12]!.name }));
    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockSaveLog).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(ar.today.banner.failed(2))).toBeTruthy();
    expect(ar.today.banner.failed(2)).toContain('بقي بندان');
  });

  test('prev arrow disabled beyond backfill window (today-2) and next disabled at today', async () => {
    await renderToday();
    const prev = () => screen.getByRole('button', { name: ar.today.prevDay });
    const next = () => screen.getByRole('button', { name: ar.today.nextDay });
    expect(next()).toBeDisabled();
    expect(prev()).toBeEnabled();
    await fireEvent.press(prev());
    await waitFor(() =>
      expect(mockFetchActiveHabits).toHaveBeenLastCalledWith(supabase, '2026-11-25', 'daily'),
    );
    expect(next()).toBeEnabled();
    expect(prev()).toBeEnabled();
    await fireEvent.press(prev());
    await waitFor(() =>
      expect(mockFetchActiveHabits).toHaveBeenLastCalledWith(supabase, '2026-11-24', 'daily'),
    );
    expect(prev()).toBeDisabled();
    expect(next()).toBeEnabled();
    await fireEvent.press(next());
    await waitFor(() =>
      expect(mockFetchActiveHabits).toHaveBeenLastCalledWith(supabase, '2026-11-25', 'daily'),
    );
  });

  test('DATE_OUT_OF_WINDOW error shows messages.ar.errors.DATE_OUT_OF_WINDOW', async () => {
    mockSaveLog.mockRejectedValue({ message: 'DATE_OUT_OF_WINDOW', code: 'P0001' });
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.markAllDone }));
    await pressSave();
    expect(await screen.findByText(ar.errors.DATE_OUT_OF_WINDOW)).toBeTruthy();
    expect(screen.getByText(ar.today.banner.errorTitle)).toBeTruthy();
  });

  test('save button disabled until every tristate habit has a status; checklist needs none (0 checked = not_done)', async () => {
    await renderToday();
    expect(saveButton()).toBeDisabled();
    for (const h of tristateHabits.slice(0, 3)) await setStatus(h.name, ar.today.tristate.done);
    expect(saveButton()).toBeDisabled();
    await setStatus(tristateHabits[3]!.name, ar.today.tristate.notRequired);
    expect(saveButton()).toBeEnabled();
    await pressSave();
    const checklist = savedInput().entries.find((e) => e.habitId === adhkar.id)!;
    expect(checklist).toEqual({ habitId: adhkar.id, status: 'not_done', checkedItemIds: [] });
  });

  test('disabled save shows one reason line, e.g. "بقي ورد القيام بلا حالة"', async () => {
    await renderToday();
    for (const h of tristateHabits.filter((t) => t.id !== qiyam.id))
      await setStatus(h.name, ar.today.tristate.done);
    expect(ar.today.missingStatus(qiyam.name)).toBe('بقي ورد القيام بلا حالة');
    expect(screen.getByText(ar.today.missingStatus(qiyam.name))).toBeTruthy();
    // One line only, naming one habit.
    for (const h of tristateHabits.filter((t) => t.id !== qiyam.id)) {
      expect(screen.queryByText(ar.today.missingStatus(h.name))).toBeNull();
    }
    await setStatus(qiyam.name, ar.today.tristate.notDone);
    expect(screen.queryByText(ar.today.missingStatus(qiyam.name))).toBeNull();
  });

  test('"تعليم الكل تم" sets every tristate to done and checks all checklist items', async () => {
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.markAllDone }));
    for (const h of tristateHabits) expect(radio(h.name, ar.today.tristate.done)).toBeChecked();
    for (const item of adhkar.items)
      expect(screen.getByRole('checkbox', { name: item.name })).toBeChecked();
    expect(screen.getByText('13/13')).toBeTruthy();
    expect(saveButton()).toBeEnabled();
  });

  test('draft restored after remount when no server log; cleared after successful save', async () => {
    const first = await renderToday();
    await setStatus(quran.name, ar.today.tristate.done);
    await checkItems(3);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(`draft:daily:${TODAY}`)).not.toBeNull(),
    );
    await first.unmount();

    await renderToday();
    await waitFor(() => expect(radio(quran.name, ar.today.tristate.done)).toBeChecked());
    expect(screen.getByText('3/13')).toBeTruthy();

    for (const h of tristateHabits) await setStatus(h.name, ar.today.tristate.done);
    await pressSave();
    await screen.findByText(ar.today.banner.failed(1));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(`draft:daily:${TODAY}`)).toBeNull(),
    );
  });

  test('a saved server log wins over a local draft', async () => {
    await AsyncStorage.setItem(
      `draft:daily:${TODAY}`,
      JSON.stringify({
        entries: { [quran.id]: { status: 'not_done', checkedItemIds: [] } },
        note: '',
      }),
    );
    fakeDb.logs[TODAY] = {
      id: 'log-1',
      user_id: USER_ID,
      period: 'daily',
      period_start: TODAY,
      note: null,
      log_entries: [
        ...tristateHabits.map((h, i) => ({
          id: `e${i}`,
          habit_id: h.id,
          status: 'done' as const,
          log_entry_items: [],
        })),
        {
          id: 'e-adhkar',
          habit_id: adhkar.id,
          status: 'not_done' as const,
          log_entry_items: adhkar.items
            .slice(0, 5)
            .map((i) => ({ entry_id: 'e-adhkar', habit_item_id: i.id })),
        },
      ],
    };
    await renderToday();
    await waitFor(() => expect(radio(quran.name, ar.today.tristate.done)).toBeChecked());
    expect(screen.getByText('5/13')).toBeTruthy();
    const logCall = fakeDb.calls.find((c) => c.table === 'logs')!;
    expect(logCall.filters).toMatchObject({
      user_id: USER_ID,
      period: 'daily',
      period_start: TODAY,
    });
    expect(logCall.select).toContain('log_entries');
    expect(logCall.select).toContain('log_entry_items');
  });

  test('checklist "غير مطلوب اليوم" sends not_required with no items', async () => {
    await renderToday();
    await checkItems(4);
    await setAllTristate();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.notRequiredToday }));
    await pressSave();
    const checklist = savedInput().entries.find((e) => e.habitId === adhkar.id)!;
    expect(checklist.status).toBe('not_required');
    expect(checklist.checkedItemIds ?? []).toEqual([]);
  });

  test('tristate entries never include checkedItemIds', async () => {
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.markAllDone }));
    await pressSave();
    const tristateIds = new Set(tristateHabits.map((h) => h.id));
    const tristateEntries = savedInput().entries.filter((e) => tristateIds.has(e.habitId));
    expect(tristateEntries).toHaveLength(4);
    for (const e of tristateEntries) expect(e).not.toHaveProperty('checkedItemIds');
  });

  test('error banner shows messages.ar.errors.MISSING_ENTRY text for MISSING_ENTRY', async () => {
    mockSaveLog.mockRejectedValue({ message: 'MISSING_ENTRY', code: 'P0001' });
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.markAllDone }));
    await pressSave();
    expect(await screen.findByText(ar.errors.MISSING_ENTRY)).toBeTruthy();
    // The draft is kept after a failed save.
    expect(await AsyncStorage.getItem(`draft:daily:${TODAY}`)).not.toBeNull();
  });
});
