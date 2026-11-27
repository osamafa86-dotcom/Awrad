import type { RpcErrorCode, SaveLogInput } from '@awrad/domain';
import { parseRpcError, saveLog } from '@awrad/supabase-client';
import { useCallback, useState } from 'react';

import { supabase } from '../lib/supabase';

export type SaveError = RpcErrorCode | 'UNKNOWN';

export interface UseSaveLog {
  /** Resolves null on success; on failure sets `error` and resolves the same code. */
  save(input: SaveLogInput): Promise<SaveError | null>;
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
      return null;
    } catch (e) {
      const code = parseRpcError(e);
      setError(code);
      return code;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error };
}
