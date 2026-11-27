import { createElement } from 'react';
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Platform, Text } from 'react-native';

const mockSetHandler = jest.fn();
const mockAddListener = jest.fn();
const mockCalls: string[] = [];
let mockInserted: unknown;
let mockProjectId = 'proj-1';
let mockLastResponse: unknown = null;
let mockPermission = 'undetermined';
let mockRequestAnswer = 'granted';
const mockUpserts: unknown[] = [];

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => {
    mockCalls.push('getPermissions');
    return { status: mockPermission };
  },
  requestPermissionsAsync: async () => {
    mockCalls.push('requestPermissions');
    return { status: mockRequestAnswer };
  },
  getLastNotificationResponseAsync: async () => mockLastResponse,
  getExpoPushTokenAsync: async (o: unknown) => {
    mockCalls.push('token');
    mockInserted = o;
    return { data: 'tok' };
  },
  setNotificationChannelAsync: async (id: string) => {
    mockCalls.push(`channel:${id}`);
  },
  setNotificationHandler: (...a: unknown[]) => mockSetHandler(...a),
  addNotificationResponseReceivedListener: (...a: unknown[]) => mockAddListener(...a),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { expoConfig: { extra: { eas: { projectId: mockProjectId } } } };
  },
}));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) },
    from: () => ({
      upsert: async (row: unknown) => {
        mockUpserts.push(row);
        return { error: null };
      },
    }),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEVICE_TOKEN_KEY,
  ensurePushOnSignIn,
  handleColdStartNotification,
  registerForPush,
  registerForPushDetailed,
  resetNotificationHandlerForTests,
  setupNotificationResponseHandler,
} from '../src/lib/notifications';

beforeEach(async () => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockUpserts.length = 0;
  resetNotificationHandlerForTests();
  mockProjectId = 'proj-1';
  mockLastResponse = null;
  mockPermission = 'undetermined';
  mockRequestAnswer = 'granted';
  await AsyncStorage.clear();
});

describe('setupNotificationResponseHandler', () => {
  test('a tapped notification opens the Today tab', () => {
    const router = { navigate: jest.fn() };
    setupNotificationResponseHandler(router);
    const listener = mockAddListener.mock.calls[0][0] as () => void;
    listener();
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/today');
  });

  test('shows alerts in the foreground without sound', async () => {
    setupNotificationResponseHandler({ navigate: jest.fn() });
    const { handleNotification } = mockSetHandler.mock.calls[0][0];
    await expect(handleNotification()).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
    });
  });

  test('registers once even when called twice', () => {
    setupNotificationResponseHandler({ navigate: jest.fn() });
    setupNotificationResponseHandler({ navigate: jest.fn() });
    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(mockSetHandler).toHaveBeenCalledTimes(1);
  });
});

describe('registerForPush on Android', () => {
  test('creates the channel before asking for the token, with the EAS project id', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await expect(registerForPush()).resolves.toBe('tok');
    expect(mockCalls).toEqual(['channel:reminders', 'getPermissions', 'requestPermissions', 'token']);
    expect(mockInserted).toEqual({ projectId: 'proj-1' });
    jest.restoreAllMocks();
  });
});

describe('registerForPushDetailed', () => {
  test('the unset EAS project id placeholder is unavailable, not denied', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockProjectId = 'REPLACE_WITH_EAS_PROJECT_ID';
    await expect(registerForPushDetailed()).resolves.toEqual({ status: 'unavailable' });
    jest.restoreAllMocks();
  });

  test('the placeholder is checked before the permission prompt, so a misconfigured build never asks', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockProjectId = 'REPLACE_WITH_EAS_PROJECT_ID';
    await registerForPushDetailed();
    expect(mockCalls).not.toContain('requestPermissions');
    jest.restoreAllMocks();
  });

  test("remembers this device's token, so sign-out and the switch can find this device's row", async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await expect(registerForPushDetailed()).resolves.toEqual({ status: 'granted', token: 'tok' });
    expect(await AsyncStorage.getItem(DEVICE_TOKEN_KEY)).toBe('tok');
    jest.restoreAllMocks();
  });

  test('web is unavailable', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await expect(registerForPushDetailed()).resolves.toEqual({ status: 'unavailable' });
    jest.restoreAllMocks();
  });
});

// Final review mobile I2: reminders are ON by default (reminder_time from the invitation, weekly on), but without a
// token for this device nothing arrives. After sign-in the app asks once, in context, and re-registers silently
// whenever permission is already granted.
describe('ensurePushOnSignIn', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));
  afterEach(() => jest.restoreAllMocks());

  test('reminders on and never asked: asks once and registers this device', async () => {
    await expect(ensurePushOnSignIn('u-1', true)).resolves.toBe('granted');
    expect(mockCalls).toEqual(['getPermissions', 'getPermissions', 'requestPermissions', 'token']);
    expect(mockUpserts).toEqual([{ user_id: 'u-1', token: 'tok', platform: 'ios' }]);
  });

  test('asks only once per user on this device, even if the answer was «not now»', async () => {
    mockRequestAnswer = 'undetermined';
    await ensurePushOnSignIn('u-1', true);
    mockCalls.length = 0;
    await expect(ensurePushOnSignIn('u-1', true)).resolves.toBe('skipped');
    expect(mockCalls).not.toContain('requestPermissions');
  });

  test('permission already granted: registers again without a prompt (a purged or new row comes back)', async () => {
    mockPermission = 'granted';
    await expect(ensurePushOnSignIn('u-1', true)).resolves.toBe('granted');
    expect(mockCalls).not.toContain('requestPermissions');
    expect(mockUpserts).toHaveLength(1);
  });

  test('denied: nothing is asked (the settings screen explains it)', async () => {
    mockPermission = 'denied';
    await expect(ensurePushOnSignIn('u-1', true)).resolves.toBe('denied');
    expect(mockCalls).toEqual(['getPermissions']);
  });

  test('both reminders off: nothing at all', async () => {
    await expect(ensurePushOnSignIn('u-1', false)).resolves.toBe('skipped');
    expect(mockCalls).toEqual([]);
  });
});

describe('handleColdStartNotification', () => {
  const response = { notification: { request: { identifier: 'n-1' } } };

  test('navigates to Today once for a launch-by-tap, and not again for the same response', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockLastResponse = response;
    const router = { navigate: jest.fn() };
    await handleColdStartNotification(router);
    await handleColdStartNotification(router); // same process: guarded
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/today');

    resetNotificationHandlerForTests(); // "next launch": the same stale response is ignored
    await handleColdStartNotification(router);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  test('does nothing without a last response', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const router = { navigate: jest.fn() };
    await handleColdStartNotification(router);
    expect(router.navigate).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('deep link', () => {
  test('awrad://today resolves to the Today tab (route groups are not part of the URL)', async () => {
    await renderRouter(
      { '(tabs)/_layout': () => createElement(Slot), '(tabs)/today': () => createElement(Text, null, 'today-tab') },
      { initialUrl: '/today' },
    );
    expect(screen.getByText('today-tab')).toBeTruthy();
  });
});
