'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/lib/session/session-provider';
import { AppShell } from '@/components/layout/app-shell';

/** Section 13: route guard redirecting unauthenticated users to /login. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return <div className="h-dvh" aria-hidden />;
  }

  return <AppShell>{children}</AppShell>;
}
