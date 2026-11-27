import { renderRouter, screen, within } from 'expo-router/testing-library';

import TabLayout from '../app/(tabs)/_layout';
import History from '../app/(tabs)/history';
import Settings from '../app/(tabs)/settings';
import Summary from '../app/(tabs)/summary';
import Today from '../app/(tabs)/today';
import Weekly from '../app/(tabs)/weekly';
import { ar } from '../src/messages/ar';

// The tab bar sits behind SessionGate; here the visitor is a signed-in, active, tracked student.
jest.mock('../src/hooks/SessionProvider', () => ({
  useAppSession: () => ({
    session: { user: { id: 'u1' } },
    profile: { id: 'u1', is_active: true, is_tracked: true },
    loading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
}));

// The Today tab reads data; give it an empty, offline-safe backend.
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/today-fixture').fakeSupabase }));
jest.mock('@awrad/supabase-client', () => ({
  fetchActiveHabits: () => Promise.resolve([]),
  // A complete summary (the Summary tab renders it) with no habits, so the only buttons are the tabs'.
  getStudentSummary: () =>
    Promise.resolve({
      daysLogged: 3,
      completionPct: 50,
      attendancePct: null,
      longestStreak: 0,
      currentStreak: 0,
      perHabit: [],
      weekly: null,
    }),
  getCalendar: () => Promise.resolve([]),
  saveLog: jest.fn(),
  parseRpcError: () => 'UNKNOWN',
}));

const routes = {
  '(tabs)/_layout': TabLayout,
  '(tabs)/today': Today,
  '(tabs)/weekly': Weekly,
  '(tabs)/summary': Summary,
  '(tabs)/history': History,
  '(tabs)/settings': Settings,
};

describe('tab bar', () => {
  it('shows the five Arabic tabs in order: today, weekly, summary, history, settings', async () => {
    await renderRouter(routes, { initialUrl: '/history' });

    // The tab bar's buttons are the only buttons on a placeholder screen (the History tab).
    const tabs = await screen.findAllByRole('button');
    const expected = [ar.tabs.today, ar.tabs.weekly, ar.tabs.summary, ar.tabs.history, ar.tabs.settings];
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(expected);
    tabs.forEach((tab, i) => expect(within(tab).getByText(expected[i]!)).toBeTruthy());
  });

  it('opens on the today screen', async () => {
    await renderRouter(routes, { initialUrl: '/today' });
    expect(await screen.findByText(ar.today.empty)).toBeTruthy();
  });
});
