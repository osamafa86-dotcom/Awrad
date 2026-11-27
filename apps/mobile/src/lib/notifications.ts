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

/**
 * Ask for permission, get this device's Expo push token and store it for the user (F-51).
 * Returns the token, or null on web / when permission is not granted.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const Notifications = native();

  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return null;

  // The channel must exist before the first token / notification on Android.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: ar.settings.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  const userId = await currentUserId();
  if (!userId) return null;
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'user_id,token' });
  if (error) throw error;
  return token;
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
