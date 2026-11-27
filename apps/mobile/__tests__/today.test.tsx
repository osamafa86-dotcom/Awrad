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
/** The counter text exactly as rendered: bidi-isolated (LRI…PDI), no spaces. */
/** Matches a banner body that starts with the given error copy (a draft note may follow). */
const escapeRe = (copy: string) => copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startsWith = (copy: string) => new RegExp(`^${escapeRe(copy)}`);
const counter = (done: number, total = 13) => `\u2066${done}/${total}\u2069`;

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
    expect(screen.getByText(counter(0))).toBeTruthy();
    await checkItems(10);
    expect(ar.today.counter(10, 13)).toBe(counter(10));
    expect(screen.getByText(counter(10))).toBeTruthy();
    expect(ar.today.counter(10, 13)).toContain('10/13');
    expect(ar.today.counter(10, 13)).not.toMatch(/\s/);
  });

  test('save sends SaveLogInput with period daily, periodStart = today, checkedItemIds for checklist', async () => {
    await renderToday();
    await setStatus(quran.name, ar.today.tristate.done);
    await setStatus(qiyam.name, ar.today.tristate.notDone);
    await setStatus(tafsir.name, ar.today.tristate.notRequired);
    await setStatus(sahihayn.name, ar.today.tristate.done);
    await checkItems(10);
    await pressSave();
    expect(mockSaveLog).toHaveBeenCalledTimes(1);
    expect(mockSaveLog.mock.calls[0]![0]).toBe(supabase);
    // Deep equality: every active habit, in sort order; no note key when the note is empty.
    expect(savedInput()).toEqual({
      period: 'daily',
      periodStart: TODAY,
      entries: [
        { habitId: quran.id, status: 'done' },
        {
          habitId: adhkar.id,
          status: 'not_done',
          checkedItemIds: adhkar.items.slice(0, 10).map((i) => i.id),
        },
        { habitId: qiyam.id, status: 'not_done' },
        { habitId: tafsir.id, status: 'not_required' },
        { habitId: sahihayn.id, status: 'done' },
      ],
    });
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
    expect(await screen.findByText(startsWith(ar.errors.DATE_OUT_OF_WINDOW))).toBeTruthy();
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
    expect(screen.getByText(counter(13))).toBeTruthy();
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
    expect(screen.getByText(counter(3))).toBeTruthy();

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
    expect(screen.getByText(counter(5))).toBeTruthy();
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
    const notRequired = screen.getByRole('checkbox', { name: ar.today.notRequiredToday });
    expect(notRequired).not.toBeChecked();
    await fireEvent.press(notRequired);
    expect(screen.getByRole('checkbox', { name: ar.today.notRequiredToday })).toBeChecked();
    await pressSave();
    const checklist = savedInput().entries.find((e) => e.habitId === adhkar.id)!;
    expect(checklist.status).toBe('not_required');
    expect(checklist.checkedItemIds).toEqual([]);
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
    expect(await screen.findByText(startsWith(ar.errors.MISSING_ENTRY))).toBeTruthy();
    // The draft is kept after a failed save.
    expect(await AsyncStorage.getItem(`draft:daily:${TODAY}`)).not.toBeNull();
  });
  test("navigating keeps each day's draft under its own key", async () => {
    await renderToday();
    await setStatus(quran.name, ar.today.tristate.done);
    await setStatus(qiyam.name, ar.today.tristate.notDone);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(`draft:daily:${TODAY}`)).not.toBeNull(),
    );

    await fireEvent.press(screen.getByRole('button', { name: ar.today.prevDay }));
    await waitFor(() =>
      expect(mockFetchActiveHabits).toHaveBeenLastCalledWith(supabase, '2026-11-25', 'daily'),
    );
    await screen.findByLabelText(quran.name);
    expect(radio(quran.name, ar.today.tristate.done)).not.toBeChecked();
    expect(await AsyncStorage.getItem('draft:daily:2026-11-25')).toBeNull();

    // Back and forth again: yesterday must still open empty, today keeps its edits.
    await fireEvent.press(screen.getByRole('button', { name: ar.today.nextDay }));
    await waitFor(() => expect(radio(quran.name, ar.today.tristate.done)).toBeChecked());
    await fireEvent.press(screen.getByRole('button', { name: ar.today.prevDay }));
    await waitFor(() =>
      expect(mockFetchActiveHabits).toHaveBeenLastCalledWith(supabase, '2026-11-25', 'daily'),
    );
    await screen.findByLabelText(quran.name);
    expect(radio(quran.name, ar.today.tristate.done)).not.toBeChecked();
    expect(await AsyncStorage.getItem('draft:daily:2026-11-25')).toBeNull();

    const stored = JSON.parse((await AsyncStorage.getItem(`draft:daily:${TODAY}`))!) as {
      entries: Record<string, { status?: string }>;
    };
    expect(stored.entries[quran.id]?.status).toBe('done');
    expect(stored.entries[qiyam.id]?.status).toBe('not_done');
  });

  test('a stale-habit error reloads the habits, keeps the edits and retries with the current list', async () => {
    mockSaveLog.mockRejectedValueOnce({ message: 'INACTIVE_HABIT', code: 'P0001' });
    await renderToday();
    await setStatus(quran.name, ar.today.tristate.done);
    await setStatus(qiyam.name, ar.today.tristate.notDone);
    await setStatus(tafsir.name, ar.today.tristate.notRequired);
    await setStatus(sahihayn.name, ar.today.tristate.done);
    await checkItems(2);
    // After the error the server no longer has sahihayn active.
    mockFetchActiveHabits.mockResolvedValue([quran, adhkar, qiyam, tafsir]);
    await pressSave();
    expect(await screen.findByText(startsWith(ar.errors.INACTIVE_HABIT))).toBeTruthy();
    await waitFor(() => expect(mockFetchActiveHabits).toHaveBeenCalledTimes(2));
    await screen.findByLabelText(quran.name);
    expect(screen.queryByLabelText(sahihayn.name)).toBeNull();
    expect(radio(qiyam.name, ar.today.tristate.notDone)).toBeChecked();

    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockSaveLog).toHaveBeenCalledTimes(2));
    expect(savedInput().entries).toEqual([
      { habitId: quran.id, status: 'done' },
      {
        habitId: adhkar.id,
        status: 'not_done',
        checkedItemIds: adhkar.items.slice(0, 2).map((i) => i.id),
      },
      { habitId: qiyam.id, status: 'not_done' },
      { habitId: tafsir.id, status: 'not_required' },
    ]);
  });

  test('the error banner keeps the last error copy while a retry is in flight', async () => {
    mockSaveLog.mockRejectedValueOnce({ message: 'FORBIDDEN', code: 'P0001' });
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: ar.today.markAllDone }));
    await pressSave();
    await screen.findByText(startsWith(ar.errors.FORBIDDEN));
    let finish: (v: string) => void = () => undefined;
    mockSaveLog.mockReturnValueOnce(new Promise<string>((r) => (finish = r)));
    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockSaveLog).toHaveBeenCalledTimes(2));
    expect(screen.getByText(startsWith(ar.errors.FORBIDDEN))).toBeTruthy();
    expect(screen.queryByText(startsWith(ar.errors.UNKNOWN))).toBeNull();
    finish('log-1');
    expect(await screen.findByText(ar.today.banner.achieved)).toBeTruthy();
  });

  test('a connection failure mentions the device draft only when there are unsaved edits', async () => {
    mockSaveLog.mockRejectedValue(new Error('Failed to fetch'));
    fakeDb.logs[TODAY] = {
      id: 'log-1',
      user_id: USER_ID,
      period: 'daily',
      period_start: TODAY,
      note: null,
      log_entries: dailyHabits.map((h, i) => ({
        id: `e${i}`,
        habit_id: h.id,
        status: 'done' as const,
        log_entry_items: [],
      })),
    };
    await renderToday();
    await waitFor(() => expect(saveButton()).toBeEnabled());
    // Re-saving the server log as is: nothing was edited, so no draft is claimed.
    await pressSave();
    expect(await screen.findByText(ar.errors.UNKNOWN)).toBeTruthy();
    expect(screen.queryByText(new RegExp(escapeRe(ar.today.banner.draftKept)))).toBeNull();

    await setStatus(qiyam.name, ar.today.tristate.notDone);
    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockSaveLog).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(`${ar.errors.UNKNOWN} ${ar.today.banner.draftKept}`),
    ).toBeTruthy();
  });
});
