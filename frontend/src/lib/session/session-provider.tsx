'use client';

/**
 * Real session provider (TASK-006), replacing the TASK-004 dev placeholder. Keeps the
 * same `useSession()` shape (`role`, `userName`) the Sidebar/Header/AppShell already
 * consume, so nothing else in the shell needed to change — plus the real session data
 * (`user`, `status`, `logout`) those TASK-006 screens need.
 */

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient, setUnauthorizedHandler } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { roleNameToKey, type Role } from '@/lib/permissions/roles';
import type { PermissionKey } from '@/lib/permissions/permission-keys';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roleName: string;
  role: Role;
  permissions: PermissionKey[];
}

interface RawMeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: PermissionKey[];
}

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  role: Role;
  userName: string;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const SESSION_QUERY_KEY = ['auth', 'me'];

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { t } = useLocale();

  const { data, isLoading } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: ({ signal }) => apiClient.get<RawMeResponse>('/api/auth/me', undefined, signal),
    retry: false,
    staleTime: 60_000,
  });

  // Section 19: a 401 anywhere shows this toast — but only when there was a previously
  // known session; an anonymous visitor's initial /api/auth/me 401 isn't an "expiry".
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (typeof window === 'undefined' || window.location.pathname === '/login') return;
      if (queryClient.getQueryData(SESSION_QUERY_KEY)) {
        toast.error(t('login.sessionExpired'));
      }
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      window.location.href = '/login';
    });
  }, [queryClient, t]);

  const logout = useCallback(async () => {
    await apiClient.post('/api/auth/logout').catch(() => undefined);
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    window.location.href = '/login';
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(() => {
    const user: SessionUser | null = data
      ? { ...data, roleName: data.role, role: roleNameToKey(data.role) }
      : null;

    return {
      status: isLoading ? 'loading' : user ? 'authenticated' : 'unauthenticated',
      user,
      role: user?.role ?? 'viewer',
      userName: user?.name ?? '',
      logout,
    };
  }, [data, isLoading, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
