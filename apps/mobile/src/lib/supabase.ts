import { createBrowserClient } from '@awrad/supabase-client';
import { Platform } from 'react-native';

import { ar } from '../messages/ar';
import { LargeSecureStore, type AuthStorage } from './storage';

export type { AuthStorage };

/** Encrypted native session storage (see storage.ts). */
export const nativeStorage: AuthStorage = new LargeSecureStore();

/** Web uses supabase-js's default (localStorage); native uses the encrypted LargeSecureStore. */
export function storageFor(os: typeof Platform.OS): AuthStorage | undefined {
  return os === 'web' ? undefined : nativeStorage;
}

function readEnv(): { url: string; anonKey: string } {
  // Must be read as literal `process.env.EXPO_PUBLIC_*` so Expo can inline them at build time.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error(ar.errors.missingEnv);
  return { url, anonKey };
}

const env = readEnv();

export const supabase = createBrowserClient(env.url, env.anonKey, storageFor(Platform.OS));
