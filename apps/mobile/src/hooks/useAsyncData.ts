import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncData<T> {
  data: T | null;
  /** True until the data for the current key has arrived (also while the key is null). */
  loading: boolean;
  error: boolean;
  /** Re-run the fetch for the current key (keeps the shown data meanwhile). Resolves when settled. */
  refetch(): Promise<void>;
}

interface State<T> {
  key: string | null;
  data: T | null;
  error: boolean;
  pending: boolean;
}

/**
 * One async read keyed by `key` (null = not ready to fetch yet). A response for an old key, or after
 * unmount, is dropped (`live` guard); data of another key is never shown.
 */
export function useAsyncData<T>(key: string | null, fetcher: () => Promise<T>): AsyncData<T> {
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: false, pending: false });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const request = useRef(0);
  const live = useRef(true);

  const run = useCallback(async (k: string) => {
    const id = ++request.current;
    setState((s) => ({ key: k, data: s.key === k ? s.data : null, error: false, pending: true }));
    try {
      const data = await fetcherRef.current();
      if (live.current && id === request.current) setState({ key: k, data, error: false, pending: false });
    } catch {
      if (live.current && id === request.current) setState({ key: k, data: null, error: true, pending: false });
    }
  }, []);

  useEffect(() => {
    live.current = true;
    if (key !== null) void run(key);
    return () => {
      live.current = false;
      request.current++;
    };
  }, [key, run]);

  const refetch = useCallback(async () => {
    if (key !== null) await run(key);
  }, [key, run]);

  const matches = key !== null && state.key === key;
  return {
    data: matches ? state.data : null,
    loading: !matches || state.pending,
    error: matches && !state.pending && state.error,
    refetch,
  };
}
