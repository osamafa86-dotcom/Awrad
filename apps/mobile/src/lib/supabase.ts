import { createBrowserClient } from '@awrad/supabase-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { ar } from '../messages/ar';

/** The storage contract supabase-js expects (all methods may be async). */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Minimal native adapter over the Keychain/Keystore. Task 2.2 replaces it with an encrypted
 * large-value store (SecureStore values are size-limited).
 */
export const nativeStorage: AuthStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/** Web uses supabase-js's default (localStorage); native uses the SecureStore adapter. */
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
