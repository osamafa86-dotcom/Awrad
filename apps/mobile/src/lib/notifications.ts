import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { ar } from '../messages/ar';
import { supabase } from './supabase';

type Notifications = typeof import('expo-notifications');

/** Where a tapped reminder lands (spec §12). Route groups are not part of the URL, so `awrad://today` is the same screen. */
export const TODAY_HREF = '/(tabs)/today';
const CHANNEL_ID = 'reminders';

/** Native only; loaded lazily so the web bundle never evaluates the module. */
function native(): Notifications {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- why: web must not touch expo-notifications
  return require('expo-notifications') as Notifications;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export type PushResult =
  | { status: 'granted'; token: string }
  | { status: 'denied' | 'unavailable' | 'no-user' };

const PROJECT_ID_PLACEHOLDER = 'REPLACE_WITH_EAS_PROJECT_ID';

/**
 * Ask for permission, get this device's Expo push token and store it for the user (F-51).
 * `denied` only when the user refused; `unavailable` on web or while the EAS project id is unset.
 */
export async function registerForPushDetailed(): Promise<PushResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const Notifications = native();

  // On Android 13+ the permission prompt needs an existing channel, so create it first.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: ar.settings.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return { status: 'denied' };

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId || projectId === PROJECT_ID_PLACEHOLDER) return { status: 'unavailable' };
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  const userId = await currentUserId();
  if (!userId) return { status: 'no-user' };
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'user_id,token' });
  if (error) throw error;
  return { status: 'granted', token };
}

/** The token, or null when none was registered (web, denied, unavailable, signed out). */
export async function registerForPush(): Promise<string | null> {
  const result = await registerForPushDetailed();
  return result.status === 'granted' ? result.token : null;
}

/** Forget every token of this user (the token itself is not revoked). */
export async function unregisterPush(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId);
  if (error) throw error;
}

let handlerInstalled = false;

/** Test hook: allow `setupNotificationResponseHandler` to run again. */
export function resetNotificationHandlerForTests(): void {
  handlerInstalled = false;
  coldStartChecked = false;
}

/** Foreground alerts + "tap opens Today". Call once from the root layout; repeat calls are ignored. */
export function setupNotificationResponseHandler(router: { navigate(href: string): void }): void {
  if (Platform.OS === 'web' || handlerInstalled) return;
  handlerInstalled = true;
  const Notifications = native();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  Notifications.addNotificationResponseReceivedListener(() => router.navigate(TODAY_HREF));
}

const HANDLED_KEY = 'awrad.lastHandledNotification';
let coldStartChecked = false;

/**
 * App opened by tapping a notification while it was closed: go to Today once. The last response
 * persists across launches, so its identifier is remembered and a repeat is ignored.
 */
export async function handleColdStartNotification(router: { navigate(href: string): void }): Promise<void> {
  if (Platform.OS === 'web' || coldStartChecked) return;
  coldStartChecked = true;
  try {
    const response = await native().getLastNotificationResponseAsync();
    if (!response) return;
    const id = response.notification.request.identifier;
    if ((await AsyncStorage.getItem(HANDLED_KEY)) === id) return;
    await AsyncStorage.setItem(HANDLED_KEY, id);
    router.navigate(TODAY_HREF);
  } catch {
    // best effort: opening on the default tab is fine
  }
}
