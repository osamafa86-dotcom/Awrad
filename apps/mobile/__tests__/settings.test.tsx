import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import SettingsScreen from '../app/(tabs)/settings';
import { resetSettingsCache } from '../src/hooks/useSettings';
import { registerForPush } from '../src/lib/notifications';
import { ar } from '../src/messages/ar';
import { fakeProfile, resetFakeDb, USER_ID } from './helpers/today-fixture';

// --- mutable test state, read by the mocks below -------------------------------------------------
const mockDb = {
  profile: { ...fakeProfile, reminder_time: null as string | null, weekly_reminder: true, timezone: null as string | null },
  pushTokens: [] as Array<Record<string, unknown>>,
  deletionOpen: false,
  failProfileUpdate: false,
  failPushRead: false,
  profileUpdates: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<{ row: Record<string, unknown>; options: unknown }>,
  deletes: [] as Array<Record<string, unknown>>,
};
const mockSignOut = jest.fn();
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
const mockRequestDeletion = jest.fn();
const mockOpenURL = jest.fn();
const mockOpenSettings = jest.fn();
const mockGetPerms = jest.fn();
const mockRequestPerms = jest.fn();
const mockGetToken = jest.fn();

jest.mock('../src/lib/supabase', () => {
  const f = jest.requireActual('./helpers/today-fixture');
  const mk = (table: string) => {
    if (table === 'profiles') {
      return {
        update: (p: Record<string, unknown>) => {
          mockDb.profileUpdates.push(p);
          return {
            eq: async () => ({ data: null, error: mockDb.failProfileUpdate ? { message: 'boom' } : null }),
          };
        },
      };
    }
    if (table === 'push_tokens') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: async () => {
          if (mockDb.failPushRead) throw new Error('offline');
          return { data: mockDb.pushTokens, error: null };
        },
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          mockDb.upserts.push({ row, options });
          return { error: null };
        },
        delete: () => ({
          eq: async (column: string, value: unknown) => {
            mockDb.deletes.push({ [column]: value });
            return { error: null };
          },
        }),
      };
      return chain;
    }
    if (table === 'deletion_requests') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        limit: async () => ({ data: mockDb.deletionOpen ? [{ id: 'd-1' }] : [], error: null }),
      };
      return chain;
    }
    return f.fakeSupabase.from(table);
  };
  return {
    supabase: {
      from: mk,
      auth: { getSession: async () => ({ data: { session: { user: { id: f.USER_ID } } } }) },
    },
  };
});
jest.mock('../src/hooks/SessionProvider', () => ({
  useAppSession: () => ({
    session: { user: { id: 'u-1' } },
    profile: mockDb.profile,
    loading: false,
    error: null,
    signOut: mockSignOut,
    refreshProfile: mockRefreshProfile,
  }),
}));
jest.mock('@awrad/supabase-client', () => ({
  requestAccountDeletion: (...a: unknown[]) => mockRequestDeletion(...a),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3', extra: { eas: { projectId: 'proj-1' } } } },
}));
jest.mock('expo-linking', () => ({
  openURL: (...a: unknown[]) => mockOpenURL(...a),
  openSettings: (...a: unknown[]) => mockOpenSettings(...a),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPerms(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPerms(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: { onChange: (e: unknown, d?: Date) => void }) => (
      <P testID="time-picker" onPress={() => props.onChange({ type: 'set' }, new Date(2026, 0, 1, 20, 30))}>
        <T>picker</T>
      </P>
    ),
  };
});

const sw = (name: string) => screen.getByRole('switch', { name });
const toggle = async (name: string, value: boolean) => {
  await fireEvent(sw(name), 'valueChange', value);
  await act(async () => {}); // let the awaited update / refresh settle
};

async function renderSettings() {
  const utils = await render(<SettingsScreen />);
  await screen.findByText(ar.settings.reminders);
  // let the initial push-token / deletion-request reads settle
  await act(async () => {});
  return utils;
}

const savedUrl = process.env.EXPO_PUBLIC_ADMIN_URL;

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeDb();
  resetSettingsCache();
  mockDb.profile = { ...fakeProfile, reminder_time: null, weekly_reminder: true, timezone: null };
  mockDb.pushTokens = [];
  mockDb.deletionOpen = false;
  mockDb.failProfileUpdate = false;
  mockDb.failPushRead = false;
  mockDb.profileUpdates = [];
  mockDb.upserts = [];
  mockDb.deletes = [];
  process.env.EXPO_PUBLIC_ADMIN_URL = 'http://127.0.0.1:3000';
  mockGetPerms.mockResolvedValue({ status: 'undetermined' });
  mockRequestPerms.mockResolvedValue({ status: 'granted' });
  mockGetToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  mockRequestDeletion.mockResolvedValue('d-1');
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.EXPO_PUBLIC_ADMIN_URL;
  else process.env.EXPO_PUBLIC_ADMIN_URL = savedUrl;
});

describe('settings — reminders', () => {
  test('daily reminder on sends the default time, off sends null', async () => {
    await renderSettings();
    await toggle(ar.settings.dailyReminder, true);
    expect(mockDb.profileUpdates).toEqual([{ reminder_time: '21:00' }]);
    expect(screen.getByText('21:00')).toBeTruthy();
    await toggle(ar.settings.dailyReminder, false);
    expect(mockDb.profileUpdates[1]).toEqual({ reminder_time: null });
    expect(mockRefreshProfile).toHaveBeenCalled();
  });

  test('changing the time sends HH:MM from the picker', async () => {
    mockDb.profile.reminder_time = '21:00:00';
    await renderSettings();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(ar.settings.reminderTime) }));
    await fireEvent.press(screen.getByTestId('time-picker'));
    expect(mockDb.profileUpdates).toEqual([]); // iOS: nothing written while scrolling
    await fireEvent.press(screen.getByRole('button', { name: ar.settings.done }));
    expect(mockDb.profileUpdates).toEqual([{ reminder_time: '20:30' }]);
    expect(screen.queryByTestId('time-picker')).toBeNull();
  });

  test('Android: the dialog result is written once and closes the picker', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockDb.profile.reminder_time = '21:00:00';
    await renderSettings();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(ar.settings.reminderTime) }));
    await fireEvent.press(screen.getByTestId('time-picker'));
    expect(mockDb.profileUpdates).toEqual([{ reminder_time: '20:30' }]);
    expect(screen.queryByTestId('time-picker')).toBeNull();
    jest.restoreAllMocks();
  });

  test('weekly toggle sends weekly_reminder', async () => {
    await renderSettings();
    await toggle(ar.settings.weeklyReminder, false);
    expect(mockDb.profileUpdates).toEqual([{ weekly_reminder: false }]);
  });

  test('a failed update rolls back and shows an error', async () => {
    mockDb.failProfileUpdate = true;
    await renderSettings();
    await toggle(ar.settings.weeklyReminder, false);
    expect(await screen.findByText(ar.settings.saveFailed)).toBeTruthy();
    expect(sw(ar.settings.weeklyReminder).props.value).toBe(true);
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });
});

describe('settings — push notifications', () => {
  test('turning on registers and upserts the token', async () => {
    await renderSettings();
    await toggle(ar.settings.notifications, true);
    expect(mockRequestPerms).toHaveBeenCalled();
    expect(mockDb.upserts).toEqual([
      {
        row: { user_id: USER_ID, token: 'ExponentPushToken[abc]', platform: Platform.OS },
        options: { onConflict: 'user_id,token' },
      },
    ]);
    expect(sw(ar.settings.notifications).props.value).toBe(true);
  });

  test('permission denied shows the message and opens device settings', async () => {
    mockRequestPerms.mockResolvedValue({ status: 'denied' });
    await renderSettings();
    await toggle(ar.settings.notifications, true);
    expect(await screen.findByText(ar.settings.pushDenied)).toBeTruthy();
    expect(mockDb.upserts).toEqual([]);
    expect(sw(ar.settings.notifications).props.value).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: ar.settings.openSettings }));
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  test('starts on when a token row exists; turning off deletes the user rows', async () => {
    mockDb.pushTokens = [{ id: 't-1' }];
    await renderSettings();
    expect(sw(ar.settings.notifications).props.value).toBe(true);
    await toggle(ar.settings.notifications, false);
    expect(mockDb.deletes).toEqual([{ user_id: USER_ID }]);
    expect(sw(ar.settings.notifications).props.value).toBe(false);
  });

  test('web: install banner instead of the toggle, registerForPush is null and silent', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    try {
      await renderSettings();
      expect(screen.getByText(ar.settings.webInstallBanner)).toBeTruthy();
      expect(screen.queryByRole('switch', { name: ar.settings.notifications })).toBeNull();
      await expect(registerForPush()).resolves.toBeNull();
      expect(mockGetPerms).not.toHaveBeenCalled();
      expect(mockRequestPerms).not.toHaveBeenCalled();
      expect(mockGetToken).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('settings — independent initial reads', () => {
  test('a failing push_tokens read leaves the toggle off but the deletion row still reflects its request', async () => {
    mockDb.failPushRead = true;
    mockDb.deletionOpen = true;
    await renderSettings();
    expect(sw(ar.settings.notifications).props.value).toBe(false);
    expect(sw(ar.settings.notifications).props.disabled).toBeFalsy();
    expect(screen.getByRole('button', { name: new RegExp(ar.settings.deletionPending) })).toBeTruthy();
  });
});

describe('settings — timezone', () => {
  test('shows the effective zone and «افتراضي المجموعة» when null', async () => {
    await renderSettings();
    expect(screen.getByText(ar.settings.groupDefault)).toBeTruthy();
  });

  test('choosing a zone sends it; choosing the group default sends null', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(ar.settings.timezone) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Asia/Amman' }));
    expect(mockDb.profileUpdates).toEqual([{ timezone: 'Asia/Amman' }]);
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(ar.settings.timezone) }));
    await fireEvent.press(screen.getByRole('button', { name: ar.settings.groupDefault }));
    expect(mockDb.profileUpdates[1]).toEqual({ timezone: null });
  });
});

describe('settings — about', () => {
  test('shows the version and opens the privacy page', async () => {
    await renderSettings();
    expect(screen.getByText('1.2.3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(ar.settings.privacy) }));
    expect(mockOpenURL).toHaveBeenCalledWith('http://127.0.0.1:3000/privacy');
    expect(screen.getByText(ar.settings.supportValue)).toBeTruthy();
  });

  test('privacy row is hidden when the admin URL is unset', async () => {
    delete process.env.EXPO_PUBLIC_ADMIN_URL;
    await renderSettings();
    expect(screen.queryByText(ar.settings.privacy)).toBeNull();
  });
});

describe('settings — account deletion', () => {
  test('the destructive button needs the acknowledgement, then requests deletion', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByRole('button', { name: ar.settings.requestDeletion }));
    expect(screen.getByText(ar.settings.deleteBody)).toBeTruthy();
    const confirm = () => screen.getByRole('button', { name: ar.settings.deleteConfirm });
    expect(confirm().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(confirm());
    expect(mockRequestDeletion).not.toHaveBeenCalled();

    await toggle(ar.settings.deleteAck, true);
    expect(confirm().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(confirm());
    expect(mockRequestDeletion).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(ar.settings.deleteDone)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: ar.settings.close }));
    const row = screen.getByRole('button', { name: new RegExp(ar.settings.deletionPending) });
    expect(row.props.accessibilityState.disabled).toBe(true);
  });

  test('a failed request shows an error and stays open', async () => {
    mockRequestDeletion.mockRejectedValue(new Error('x'));
    await renderSettings();
    await fireEvent.press(screen.getByRole('button', { name: ar.settings.requestDeletion }));
    await toggle(ar.settings.deleteAck, true);
    await fireEvent.press(screen.getByRole('button', { name: ar.settings.deleteConfirm }));
    expect(await screen.findByText(ar.settings.deleteFailed)).toBeTruthy();
  });

  test('an existing open request disables the row', async () => {
    mockDb.deletionOpen = true;
    await renderSettings();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: new RegExp(ar.settings.deletionPending) }).props.accessibilityState.disabled,
      ).toBe(true),
    );
    expect(screen.queryByText(ar.settings.requestDeletion)).toBeNull();
  });
});

test('sign-out calls signOut', async () => {
  await renderSettings();
  await fireEvent.press(screen.getByRole('button', { name: ar.settings.signOut }));
  expect(mockSignOut).toHaveBeenCalled();
});
