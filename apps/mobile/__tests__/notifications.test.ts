import { createElement } from 'react';
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Platform, Text } from 'react-native';

const mockSetHandler = jest.fn();
const mockAddListener = jest.fn();
const mockCalls: string[] = [];
let mockInserted: unknown;

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ status: 'granted' }),
  requestPermissionsAsync: async () => ({ status: 'granted' }),
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
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } },
}));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) },
    from: () => ({ upsert: async () => ({ error: null }) }),
  },
}));

import { registerForPush, resetNotificationHandlerForTests, setupNotificationResponseHandler } from '../src/lib/notifications';

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  resetNotificationHandlerForTests();
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
    expect(mockCalls).toEqual(['channel:reminders', 'token']);
    expect(mockInserted).toEqual({ projectId: 'proj-1' });
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
