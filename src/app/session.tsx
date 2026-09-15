// Поточний користувач вкладки (симуляція входу: sessionStorage у MockDataSource).
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { MeResponse } from '@shared/types';
import { ds, qk } from '@/data';

export function useMeQuery() {
  return useQuery({ queryKey: qk.me, queryFn: () => ds.me(), staleTime: Number.POSITIVE_INFINITY });
}

const SessionContext = createContext<MeResponse | null>(null);
export const SessionProvider = SessionContext.Provider;

/** Сесія всередині RequireUser (користувач гарантовано є). */
export function useSession(): MeResponse {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside RequireUser');
  return value;
}

export function useIsAdmin(): boolean {
  return useSession().user.role === 'admin';
}
