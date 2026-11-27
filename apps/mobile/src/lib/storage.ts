import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** The storage contract supabase-js expects (all methods may be async). */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const KEY_BYTES = 32; // AES-256

/**
 * Supabase's documented "LargeSecureStore": SecureStore (Keychain/Keystore) only holds small
 * values, so each item is encrypted with a fresh random AES-256 key; the key lives in SecureStore
 * and the ciphertext in AsyncStorage.
 */
export class LargeSecureStore implements AuthStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      const [encrypted, encryptionKey] = await Promise.all([
        AsyncStorage.getItem(key),
        SecureStore.getItemAsync(key),
      ]);
      if (!encrypted || !encryptionKey) return null;
      return this.decrypt(encryptionKey, encrypted);
    } catch {
      // An unreadable or corrupt entry is the same as no session: the user signs in again.
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = getRandomBytes(KEY_BYTES);
    // A new key for every write, so the fixed CTR counter is never reused under one key.
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(encrypted));
  }

  async removeItem(key: string): Promise<void> {
    await Promise.all([AsyncStorage.removeItem(key), SecureStore.deleteItemAsync(key)]);
  }

  private decrypt(keyHex: string, encryptedHex: string): string {
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(encryptedHex)));
  }
}
