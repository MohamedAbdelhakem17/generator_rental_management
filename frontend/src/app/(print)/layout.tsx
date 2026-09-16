'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/lib/session/session-provider';

/** Dedicated print-styled pages (Section 6/13 of TASK-029) skip the AppShell chrome entirely —
 * a browser print/save-as-PDF of a page with a sidebar and header would be unusable. Still
 * requires auth, same guard as the main (app) layout, just without the shell around it. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
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

  return <div className="mx-auto max-w-3xl bg-background px-6 py-8 text-foreground print:p-0">{children}</div>;
}
