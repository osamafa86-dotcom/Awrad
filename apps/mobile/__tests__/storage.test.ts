import { LargeSecureStore } from '../src/lib/storage';

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION = JSON.stringify({ access_token: 'a'.repeat(4000), user: { email: 'طالب@example.com' } });

describe('LargeSecureStore', () => {
  beforeEach(async () => {
    mockSecure.clear();
    await AsyncStorage.clear();
  });

  it('round-trips a large unicode value', async () => {
    const store = new LargeSecureStore();
    await store.setItem('sb-token', SESSION);
    await expect(store.getItem('sb-token')).resolves.toBe(SESSION);
  });

  it('never stores the value in plaintext and keeps only the key in SecureStore', async () => {
    const store = new LargeSecureStore();
    await store.setItem('sb-token', SESSION);
    const cipher = await AsyncStorage.getItem('sb-token');
    expect(cipher).not.toBeNull();
    expect(cipher).not.toContain('access_token');
    expect(mockSecure.get('sb-token')).toMatch(/^[0-9a-f]{64}$/); // 256-bit key as hex
  });

  it('uses a fresh key for every write', async () => {
    const store = new LargeSecureStore();
    await store.setItem('sb-token', SESSION);
    const first = mockSecure.get('sb-token');
    await store.setItem('sb-token', SESSION);
    expect(mockSecure.get('sb-token')).not.toBe(first);
  });

  it('returns null for an unknown key and for a half-written entry', async () => {
    const store = new LargeSecureStore();
    await expect(store.getItem('missing')).resolves.toBeNull();
    await AsyncStorage.setItem('orphan', 'deadbeef');
    await expect(store.getItem('orphan')).resolves.toBeNull();
  });

  it('removeItem clears both the key and the ciphertext', async () => {
    const store = new LargeSecureStore();
    await store.setItem('sb-token', SESSION);
    await store.removeItem('sb-token');
    expect(mockSecure.has('sb-token')).toBe(false);
    await expect(AsyncStorage.getItem('sb-token')).resolves.toBeNull();
    await expect(store.getItem('sb-token')).resolves.toBeNull();
  });
});
