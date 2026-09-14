'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarStateProvider } from '@/lib/layout/sidebar-context';
import { useVisibleNavGroups } from './sidebar-nav';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { NoAccessScreen } from './no-access-screen';
import { ShellErrorBoundary } from './shell-error-boundary';

function AppShellContent({ children }: { children: React.ReactNode }) {
  const visibleGroups = useVisibleNavGroups();

  if (visibleGroups.length === 0) return <NoAccessScreen />;

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <ShellErrorBoundary>{children}</ShellErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarStateProvider>
      <TooltipProvider delayDuration={200}>
        <AppShellContent>{children}</AppShellContent>
      </TooltipProvider>
    </SidebarStateProvider>
  );
}
