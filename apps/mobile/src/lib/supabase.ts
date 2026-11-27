import { createBrowserClient, type TypedClient } from '@awrad/supabase-client';
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

function createClient(): TypedClient {
  // PREVIEW-2: dev-only preview mode serves the in-memory fake with fixture data (no Supabase needed).
  // The literal env read is inlined at build time, so a normal export drops this branch and never
  // resolves the module (Metro also blocks src/preview unless EXPO_PUBLIC_PREVIEW=1).
  if (process.env.EXPO_PUBLIC_PREVIEW === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- why: a static import would put the fake in production bundles
    const preview = require('../preview/fakeSupabase') as typeof import('../preview/fakeSupabase');
    return preview.createPreviewClient();
  }
  const env = readEnv();
  return createBrowserClient(env.url, env.anonKey, storageFor(Platform.OS));
}

export const supabase = createClient();
