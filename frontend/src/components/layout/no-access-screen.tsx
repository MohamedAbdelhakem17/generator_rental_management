import { ShieldOff } from 'lucide-react';

import { useLocale } from '@/lib/i18n/locale-provider';
import { EmptyState } from '@/components/shared/empty-state';

/** Section 20 edge case: a role with zero accessible modules gets an explicit screen, not an empty sidebar. */
export function NoAccessScreen() {
  const { t } = useLocale();
  return (
    <div className="flex h-dvh items-center justify-center p-8">
      <EmptyState icon={ShieldOff} title={t('shell.noAccessTitle')} description={t('shell.noAccessBody')} />
    </div>
  );
}
