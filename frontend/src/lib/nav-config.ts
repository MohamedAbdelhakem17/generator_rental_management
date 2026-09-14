import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Zap,
  Users,
  FolderKanban,
  FileText,
  ClipboardList,
  Fuel,
  Wrench,
  Receipt,
  HandCoins,
  Wallet,
  BarChart3,
  Settings,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import type { ModuleKey } from '@/lib/permissions/roles';
import type { TranslationKey } from '@/lib/i18n/dictionary';

export interface NavItem {
  module: ModuleKey;
  href: string;
  icon: LucideIcon;
  labelKey: TranslationKey;
}

export interface NavGroup {
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ module: 'dashboard', href: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' }],
  },
  {
    items: [
      { module: 'generators', href: '/generators', icon: Zap, labelKey: 'nav.generators' },
      { module: 'customers', href: '/customers', icon: Users, labelKey: 'nav.customers' },
      { module: 'projects', href: '/projects', icon: FolderKanban, labelKey: 'nav.projects' },
      { module: 'contracts', href: '/contracts', icon: FileText, labelKey: 'nav.contracts' },
    ],
  },
  {
    items: [
      { module: 'operations', href: '/operations', icon: ClipboardList, labelKey: 'nav.operations' },
      { module: 'fuel', href: '/fuel', icon: Fuel, labelKey: 'nav.fuel' },
      { module: 'maintenance', href: '/maintenance', icon: Wrench, labelKey: 'nav.maintenance' },
    ],
  },
  {
    items: [
      { module: 'extracts', href: '/extracts', icon: Receipt, labelKey: 'nav.extracts' },
      { module: 'receipts', href: '/receipts', icon: HandCoins, labelKey: 'nav.receipts' },
      { module: 'expenses', href: '/expenses', icon: Wallet, labelKey: 'nav.expenses' },
    ],
  },
  {
    items: [{ module: 'reports', href: '/reports', icon: BarChart3, labelKey: 'nav.reports' }],
  },
  {
    items: [
      { module: 'settings', href: '/settings', icon: Settings, labelKey: 'nav.settings' },
      { module: 'audit', href: '/audit', icon: ShieldCheck, labelKey: 'nav.audit' },
      { module: 'users', href: '/users', icon: UserCog, labelKey: 'nav.users' },
    ],
  },
];
