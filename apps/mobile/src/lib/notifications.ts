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

/** Where this device remembers its own Expo push token, to find its row again (sign-out, the settings switch). */
export const DEVICE_TOKEN_KEY = 'awrad.pushToken';
/** Per user: the app already asked for notifications once after sign-in on this device (mobile I2). */
const ASKED_KEY = (userId: string) => `awrad.pushAsked:${userId}`;

/** The EAS project id, or null while it is unset (a build that cannot get a push token). */
function projectId(): string | null {
  const id = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return id && id !== PROJECT_ID_PLACEHOLDER ? id : null;
}

/**
 * Ask for permission, get this device's Expo push token and store it for the user (F-51).
 * `denied` only when the user refused; `unavailable` on web or while the EAS project id is unset — checked before the
 * prompt, so a misconfigured build never asks and then says «unavailable». The token is remembered on the device.
 */
export async function registerForPushDetailed(): Promise<PushResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const project = projectId();
  if (!project) return { status: 'unavailable' };
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

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: project });
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token).catch(() => undefined);

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

/**
 * This device's Expo push token without ever prompting: the remembered one, else — when permission is already
 * granted (a token registered by an older build) — asked from Expo and remembered. Null when there is none.
 */
export async function deviceToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const cached = await AsyncStorage.getItem(DEVICE_TOKEN_KEY).catch(() => null);
  if (cached) return cached;
  const project = projectId();
  if (!project) return null;
  try {
    const Notifications = native();
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: project });
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token).catch(() => undefined);
    return token;
  } catch {
    return null;
  }
}

/**
 * Stop this device receiving this user's reminders: delete the user's row for this device's own token (RLS allows it
 * while the session exists). Other devices of the user keep theirs. Used by the settings switch and by sign-out.
 */
export async function unregisterThisDevice(userId?: string | null): Promise<void> {
  const uid = userId ?? (await currentUserId());
  const token = await deviceToken();
  if (!uid || !token) return;
  const { error } = await supabase.from('push_tokens').delete().eq('user_id', uid).eq('token', token);
  if (error) throw error;
}

/** Whether reminders can reach this device for this user (mobile I1/I2: the switch and the hints read it). */
export type DevicePushStatus = 'registered' | 'not-registered' | 'denied' | 'unavailable';

export async function devicePushStatus(userId: string): Promise<DevicePushStatus> {
  if (Platform.OS === 'web' || !projectId()) return 'unavailable';
  try {
    const { status } = await native().getPermissionsAsync();
    if (status === 'denied') return 'denied';
    const token = await deviceToken();
    if (!token) return 'not-registered';
    const { data, error } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .limit(1);
    return !error && (data?.length ?? 0) > 0 ? 'registered' : 'not-registered';
  } catch {
    return 'not-registered';
  }
}

/**
 * After sign-in (mobile I2): a student whose reminders are on gets this device registered. Asks for permission once
 * per user on this device (in context, right after signing in); when permission is already granted it registers again
 * without a prompt, so a purged or missing row comes back. Never prompts a second time after «not now».
 */
export async function ensurePushOnSignIn(
  userId: string,
  wantsReminders: boolean,
): Promise<'granted' | 'denied' | 'skipped'> {
  if (!wantsReminders || Platform.OS === 'web' || !projectId()) return 'skipped';
  const { status } = await native().getPermissionsAsync();
  if (status === 'denied') return 'denied';
  if (status !== 'granted') {
    if ((await AsyncStorage.getItem(ASKED_KEY(userId)).catch(() => null)) !== null) return 'skipped';
    await AsyncStorage.setItem(ASKED_KEY(userId), new Date().toISOString()).catch(() => undefined);
  }
  const result = await registerForPushDetailed();
  return result.status === 'granted' ? 'granted' : result.status === 'denied' ? 'denied' : 'skipped';
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
