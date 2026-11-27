import type { RpcErrorCode, SaveLogInput } from '@awrad/domain';
import { parseRpcError, saveLog } from '@awrad/supabase-client';
import { useCallback, useState } from 'react';

import { supabase } from '../lib/supabase';

export type SaveError = RpcErrorCode | 'UNKNOWN';

export interface UseSaveLog {
  /** Resolves true on success; on failure sets `error` and resolves false. */
  save(input: SaveLogInput): Promise<boolean>;
  saving: boolean;
  error: SaveError | null;
}

/** Writes through `save_log()` only (AGENTS.md §3), mapping failures to our RPC error codes. */
export function useSaveLog(): UseSaveLog {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);

  const save = useCallback(async (input: SaveLogInput) => {
    setSaving(true);
    setError(null);
    try {
      await saveLog(supabase, input);
      return true;
    } catch (e) {
      setError(parseRpcError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error };
}
