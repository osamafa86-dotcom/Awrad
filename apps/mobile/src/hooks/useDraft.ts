import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export interface UseDraft<T> {
  draft: T | null;
  /** False until the stored draft (if any) has been read for the current key. */
  loaded: boolean;
  setDraft(value: T): void;
  clearDraft(): Promise<void>;
}

/** An in-progress value kept on this device (AsyncStorage) until a successful save. `null` key = off. */
export function useDraft<T>(key: string | null): UseDraft<T> {
  const [state, setState] = useState<{ key: string; draft: T | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    const read = async (): Promise<T | null> => {
      try {
        const raw = await AsyncStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null; // a corrupt or unreadable draft is simply ignored
      }
    };
    void read().then((draft) => live && setState({ key, draft }));
    return () => {
      live = false;
    };
  }, [key]);

  const setDraft = useCallback(
    (value: T) => {
      if (!key) return;
      setState({ key, draft: value });
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
    },
    [key],
  );

  const clearDraft = useCallback(async () => {
    if (!key) return;
    setState({ key, draft: null });
    await AsyncStorage.removeItem(key).catch(() => undefined);
  }, [key]);

  const current = state && state.key === key ? state : null;
  return {
    draft: current?.draft ?? null,
    loaded: key === null || current !== null,
    setDraft,
    clearDraft,
  };
}
