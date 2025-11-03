'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { ReactNode } from 'react';

export const DEV_USER = '00000000-0000-0000-0000-000000000001';

export type UserIdContextValue = {
  userId: string;
  saveUserId: (value: string) => void;
};

const UserIdContext = createContext<UserIdContextValue | undefined>(undefined);

function readStoredUserId() {
  if (typeof window === 'undefined') {
    return DEV_USER;
  }

  const stored = window.localStorage.getItem('userId');
  if (stored && stored.trim()) {
    return stored;
  }

  window.localStorage.setItem('userId', DEV_USER);
  return DEV_USER;
}

export function UserIdProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string>(DEV_USER);

  useEffect(() => {
    setUserId(readStoredUserId());
  }, []);

  const saveUserId = useCallback((value: string) => {
    const fallback = value && value.trim() ? value.trim() : DEV_USER;
    setUserId(fallback);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('userId', fallback);
    }
  }, []);

  const contextValue = useMemo(() => ({ userId, saveUserId }), [userId, saveUserId]);

  return <UserIdContext.Provider value={contextValue}>{children}</UserIdContext.Provider>;
}

export function useUserId(): UserIdContextValue {
  const context = useContext(UserIdContext);

  if (!context) {
    throw new Error('useUserId must be used within a UserIdProvider');
  }

  return context;
}
