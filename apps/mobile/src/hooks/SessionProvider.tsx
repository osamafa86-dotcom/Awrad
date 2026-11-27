import { createContext, useContext, type ReactNode } from 'react';

import { useSession, type UseSession } from './useSession';

const SessionContext = createContext<UseSession | null>(null);

/** Subscribes to auth once at the root; the route-group guards read it via `useAppSession`. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSession();
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAppSession(): UseSession {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useAppSession must be used inside <SessionProvider>');
  return value;
}
