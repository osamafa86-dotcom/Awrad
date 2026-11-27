import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react-native';

import { WeekHeader } from '../src/components/WeekHeader';
import WeeklyScreen from '../app/(tabs)/weekly';
import { useSettings, resetSettingsCache } from '../src/hooks/useSettings';
import { useWeek } from '../src/hooks/useWeek';
import { formatDayMonth } from '../src/lib/format';
import { ar } from '../src/messages/ar';
import {
  fakeDb,
  lessonPrep,
  memorization,
  resetFakeDb,
  fiqh,
  tazkiyah,
  weeklyHabits,
  weeklyTristateHabits,
} from './helpers/today-fixture';

let mockToday = '2026-11-26';

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
jest.mock('@awrad/supabase-client', () => ({
  fetchActiveHabits: (...a: unknown[]) => mockFetchActiveHabits(...a),
  saveLog: (...a: unknown[]) => mockSaveLog(...a),
  getStudentSummary: jest.fn().mockResolvedValue({ currentStreak: 0 }),
  parseRpcError: jest.requireActual('@awrad/supabase-client').parseRpcError,
}));
jest.mock('@awrad/domain', () => ({
  ...jest.requireActual('@awrad/domain'),
  todayIn: () => mockToday,
}));

const TITLE_CURRENT = 'الأسبوع من 22 نوفمبر إلى 28 نوفمبر';
const TITLE_PREVIOUS = 'الأسبوع من 15 نوفمبر إلى 21 نوفمبر';
const REVIEW = 'مراجعة عامة للأسبوع';
const SUPPORT = 'ما تحتاج فيه دعمًا من الشيخ';

async function renderWeekly() {
  const utils = await render(<WeeklyScreen />);
  await screen.findByLabelText(memorization.name);
  return utils;
}
const radio = (habitName: string, label: string) =>
  within(screen.getByLabelText(habitName)).getByRole('radio', { name: label });
const saveButton = () => screen.getByRole('button', { name: ar.weekly.save });
async function setAll(label: string = ar.today.tristate.done) {
  for (const h of weeklyTristateHabits) await fireEvent.press(radio(h.name, label));
}
async function pressSave() {
  await fireEvent.press(saveButton());
  await waitFor(() => expect(mockSaveLog).toHaveBeenCalled());
}
const savedInput = () => mockSaveLog.mock.calls.at(-1)![1] as Record<string, unknown>;

beforeEach(async () => {
  jest.clearAllMocks();
  mockToday = '2026-11-26';
  resetFakeDb();
  resetSettingsCache();
  await AsyncStorage.clear();
  mockFetchActiveHabits.mockResolvedValue([lessonPrep, fiqh, memorization, tazkiyah]);
  mockSaveLog.mockResolvedValue('log-1');
});

describe('weekly screen', () => {
  test('renders the week title on its own row and the Hijri range', async () => {
    await renderWeekly();
    expect(screen.getByText(TITLE_CURRENT)).toBeTruthy();
    expect(screen.getByText('جمادى الآخرة 1448')).toBeTruthy();
    expect(mockFetchActiveHabits).toHaveBeenCalledWith(expect.anything(), '2026-11-22', 'weekly');
  });

  test('save sends the weekly payload with texts', async () => {
    await renderWeekly();
    await fireEvent.press(radio(memorization.name, ar.today.tristate.done));
    await fireEvent.press(radio(fiqh.name, ar.today.tristate.notDone));
    await fireEvent.press(radio(tazkiyah.name, ar.today.tristate.notRequired));
    await fireEvent.press(screen.getByRole('checkbox', { name: lessonPrep.items[0]!.name }));
    await fireEvent.changeText(screen.getByLabelText(REVIEW), '  أسبوع جيد  ');
    await fireEvent.changeText(screen.getByLabelText(SUPPORT), ' أحتاج مراجعة الحفظ ');
    await pressSave();
    expect(savedInput()).toEqual({
      period: 'weekly',
      periodStart: '2026-11-22',
      entries: [
        { habitId: memorization.id, status: 'done' },
        { habitId: fiqh.id, status: 'not_done' },
        { habitId: tazkiyah.id, status: 'not_required' },
        { habitId: lessonPrep.id, status: 'not_done', checkedItemIds: [lessonPrep.items[0]!.id] },
      ],
      reviewText: 'أسبوع جيد',
      supportRequestText: 'أحتاج مراجعة الحفظ',
    });
  });

  test('empty texts are omitted; save is disabled until every tristate is set', async () => {
    await renderWeekly();
    expect(saveButton().props.accessibilityState?.disabled ?? saveButton().props['aria-disabled']).toBeTruthy();
    await setAll();
    await fireEvent.changeText(screen.getByLabelText(REVIEW), '   ');
    await pressSave();
    const input = savedInput();
    expect(input).not.toHaveProperty('reviewText');
    expect(input).not.toHaveProperty('supportRequestText');
    expect(input.entries as unknown[]).toHaveLength(weeklyHabits.length);
    expect(await screen.findByText(ar.weekly.banner.failed(1))).toBeTruthy();
  });

  test('a save error shows the mapped message and keeps the draft', async () => {
    mockSaveLog.mockRejectedValueOnce(new Error('network down'));
    await renderWeekly();
    await setAll();
    await fireEvent.changeText(screen.getByLabelText(REVIEW), 'نص');
    await pressSave();
    expect(await screen.findByText(new RegExp(`^${ar.errors.UNKNOWN}`))).toBeTruthy();
    expect(await AsyncStorage.getItem('draft:weekly:2026-11-22')).not.toBeNull();
  });

  test('draft is keyed per week: navigating never writes one week under the other', async () => {
    mockToday = '2026-11-24';
    await renderWeekly();
    await fireEvent.changeText(screen.getByLabelText(REVIEW), 'نص هذا الأسبوع');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('draft:weekly:2026-11-22')).toContain('نص هذا الأسبوع'),
    );
    await fireEvent.press(screen.getByRole('button', { name: ar.weekly.prevWeek }));
    await screen.findByText(TITLE_PREVIOUS);
    await new Promise((r) => setTimeout(r, 20));
    expect(await AsyncStorage.getItem('draft:weekly:2026-11-15')).toBeNull();
  });

  test('a saved server log wins over a draft and fills the form', async () => {
    fakeDb.logs['2026-11-22'] = {
      id: 'l1',
      user_id: 'u-1',
      period: 'weekly',
      period_start: '2026-11-22',
      note: null,
      review_text: 'مراجعة محفوظة',
      support_request_text: null,
      log_entries: weeklyHabits.map((h, i) => ({
        id: `e${i}`,
        habit_id: h.id,
        status: 'done' as const,
        log_entry_items: h.items.map((it) => ({ entry_id: `e${i}`, habit_item_id: it.id })),
      })),
    };
    await AsyncStorage.setItem('draft:weekly:2026-11-22', JSON.stringify({ reviewText: 'مسوّدة' }));
    await renderWeekly();
    await waitFor(() => expect(screen.getByLabelText(REVIEW).props.value).toBe('مراجعة محفوظة'));
  });
});

describe('last-week banner (F-24)', () => {
  test('shown when previous week has no log and is within grace', async () => {
    mockToday = '2026-11-24';
    await renderWeekly();
    expect(await screen.findByText(ar.weekly.lastWeek.title)).toBeTruthy();
  });
  test('hidden after the grace period', async () => {
    await renderWeekly();
    await waitFor(() => expect(mockFetchActiveHabits).toHaveBeenCalled());
    expect(screen.queryByText(ar.weekly.lastWeek.title)).toBeNull();
  });
  test('hidden when the previous week already has a log', async () => {
    mockToday = '2026-11-24';
    fakeDb.logs['2026-11-15'] = {
      id: 'l0',
      user_id: 'u-1',
      period: 'weekly',
      period_start: '2026-11-15',
      note: null,
      log_entries: [],
    };
    await renderWeekly();
    await waitFor(() => expect(fakeDb.calls.some((c) => c.filters.period_start === '2026-11-15')).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(ar.weekly.lastWeek.title)).toBeNull();
  });
  test('the button navigates to the previous week', async () => {
    mockToday = '2026-11-24';
    await renderWeekly();
    await fireEvent.press(await screen.findByRole('button', { name: ar.weekly.lastWeek.action }));
    expect(await screen.findByText(TITLE_PREVIOUS)).toBeTruthy();
    expect(mockFetchActiveHabits).toHaveBeenLastCalledWith(expect.anything(), '2026-11-15', 'weekly');
  });
});

describe('week navigation', () => {
  test('prev arrow shows the previous week; next returns', async () => {
    mockToday = '2026-11-24';
    await renderWeekly();
    await fireEvent.press(screen.getByRole('button', { name: ar.weekly.prevWeek }));
    expect(await screen.findByText(TITLE_PREVIOUS)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: ar.weekly.nextWeek }));
    expect(await screen.findByText(TITLE_CURRENT)).toBeTruthy();
  });
  test('prev is disabled when the previous week is out of grace', async () => {
    await renderWeekly();
    const prev = screen.getByRole('button', { name: ar.weekly.prevWeek });
    expect(prev.props.accessibilityState?.disabled ?? prev.props['aria-disabled']).toBe(true);
  });
});

describe('useWeek', () => {
  async function week(offset: 0 | -1, today: string) {
    mockToday = today;
    resetSettingsCache();
    const { result } = await renderHook(() => ({ w: useWeek(offset), s: useSettings() }));
    await waitFor(() => expect(result.current.s.loading).toBe(false));
    return result.current.w;
  }
  test('offsets', async () => {
    expect(await week(0, '2026-11-26')).toMatchObject({
      weekStart: '2026-11-22',
      weekEnd: '2026-11-28',
      canEdit: true,
      isCurrent: true,
    });
    expect(await week(-1, '2026-11-26')).toMatchObject({
      weekStart: '2026-11-15',
      weekEnd: '2026-11-21',
      isCurrent: false,
    });
  });
  test('grace boundary: day 3 editable, day 4 not', async () => {
    expect((await week(-1, '2026-11-24')).canEdit).toBe(true); // weekEnd + 3
    expect((await week(-1, '2026-11-25')).canEdit).toBe(false); // weekEnd + 4
    expect((await week(0, '2026-11-22')).canEdit).toBe(true);
  });
});

describe('formatDayMonth', () => {
  test('Arabic month name with Western digits', () => {
    expect(formatDayMonth('2026-11-22')).toBe('22 نوفمبر');
    expect(formatDayMonth('2026-01-05')).toBe('5 يناير');
  });
  test('falls back to the month table when Intl throws', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('no locale');
    });
    try {
      expect(formatDayMonth('2026-11-22')).toBe('22 نوفمبر');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('WeekHeader', () => {
  test('a week spanning two Hijri months shows both', async () => {
    await render(
      <WeekHeader
        weekStart="2026-12-06"
        weekEnd="2026-12-12"
        onPrev={() => undefined}
        onNext={() => undefined}
        canPrev
        canNext={false}
      />,
    );
    expect(screen.getByText('جمادى الآخرة – رجب 1448')).toBeTruthy();
    expect(screen.getByText('الأسبوع من 6 ديسمبر إلى 12 ديسمبر')).toBeTruthy();
  });
});
