'use client';

/**
 * PLACEHOLDER for TASK-006 (Authentication & RBAC).
 *
 * There is no real session yet — this only exists so the AppShell has a `role` to
 * filter the Sidebar against, per TASK-004's acceptance criteria. TASK-006 should
 * replace this file with a provider backed by the authenticated session and delete
 * the role switcher in the demo page; nothing else in the shell should need to change,
 * since components only consume `useSession()`.
 */

import { createContext, useContext, useMemo, useState } from 'react';
import type { Role } from '@/lib/permissions/roles';

interface DevSessionContextValue {
  role: Role;
  setRole: (role: Role) => void;
  userName: string;
}

const DevSessionContext = createContext<DevSessionContextValue | null>(null);

export function DevSessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('admin');
  const value = useMemo(() => ({ role, setRole, userName: 'Dev User' }), [role]);
  return <DevSessionContext.Provider value={value}>{children}</DevSessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(DevSessionContext);
  if (!ctx) throw new Error('useSession must be used within a DevSessionProvider');
  return ctx;
}
