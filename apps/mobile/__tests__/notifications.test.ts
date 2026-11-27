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

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => {
    mockCalls.push('getPermissions');
    return { status: 'undetermined' };
  },
  requestPermissionsAsync: async () => {
    mockCalls.push('requestPermissions');
    return { status: 'granted' };
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
    from: () => ({ upsert: async () => ({ error: null }) }),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  handleColdStartNotification,
  registerForPush,
  registerForPushDetailed,
  resetNotificationHandlerForTests,
  setupNotificationResponseHandler,
} from '../src/lib/notifications';

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  resetNotificationHandlerForTests();
  mockProjectId = 'proj-1';
  mockLastResponse = null;
  void AsyncStorage.clear();
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

  test('web is unavailable', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await expect(registerForPushDetailed()).resolves.toEqual({ status: 'unavailable' });
    jest.restoreAllMocks();
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
