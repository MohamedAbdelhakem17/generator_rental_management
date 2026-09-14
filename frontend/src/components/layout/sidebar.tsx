'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSidebarState } from '@/lib/layout/sidebar-context';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarBrand, SidebarNav } from './sidebar-nav';

export function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebarState();
  const { t } = useLocale();
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-border bg-surface transition-[width] duration-150 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <Separator />
        <SidebarNav collapsed={collapsed} />
        <Separator />
        <div className={cn('flex p-2', collapsed ? 'justify-center' : 'justify-end')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          >
            <CollapseIcon className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </aside>

      {/* Mobile off-canvas sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent>
          <SidebarBrand />
          <Separator />
          <SidebarNav />
        </SheetContent>
      </Sheet>
    </>
  );
}
