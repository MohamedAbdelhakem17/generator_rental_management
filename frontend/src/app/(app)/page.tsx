'use client';

import { PackageX, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import {
  SkeletonCard,
  SkeletonList,
  SkeletonTable,
  SkeletonText,
} from '@/components/shared/loading-skeleton';
import { StatusBadge, type GeneratorStatus } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n/locale-provider';
import { ROLE_LABEL_KEYS } from '@/lib/permissions/roles';
import { useSession } from '@/lib/session/session-provider';

const STATUSES: GeneratorStatus[] = ['available', 'rented', 'under_maintenance', 'stopped'];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function ShellFoundationPage() {
  const { t } = useLocale();
  const { role, userName } = useSession();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description', { name: userName, role: t(ROLE_LABEL_KEYS[role]) })}
      />

      <Section
        title={t('dashboard.generatorStatus')}
        description={t('dashboard.generatorStatusDescription')}
      >
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title={t('dashboard.emptyState')}>
        <EmptyState
          icon={PackageX}
          title={t('dashboard.noGeneratorsTitle')}
          description={t('dashboard.noGeneratorsDescription')}
          action={
            <Button size="sm">
              <Plus className="size-4" aria-hidden />
              {t('dashboard.assignGenerator')}
            </Button>
          }
        />
      </Section>

      <Section title={t('dashboard.errorState')}>
        {deleted ? (
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            {t('dashboard.retried')}
          </p>
        ) : (
          <ErrorState
            title={t('dashboard.loadFailedTitle')}
            description={t('dashboard.loadFailedDescription')}
            onRetry={() => setDeleted(true)}
          />
        )}
      </Section>

      <Section
        title={t('dashboard.confirmDialog')}
        description={t('dashboard.confirmDialogDescription')}
      >
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-4" aria-hidden />
          {t('dashboard.deleteGenerator')}
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('dashboard.deleteGeneratorConfirmTitle')}
          description={t('dashboard.deleteGeneratorConfirmDescription')}
          confirmLabel={t('dashboard.delete')}
          onConfirm={() => new Promise((resolve) => setTimeout(resolve, 600))}
        />
      </Section>

      <Section title={t('dashboard.loadingSkeletons')}>
        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('dashboard.text')}</p>
            <SkeletonText />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('dashboard.card')}</p>
            <SkeletonCard />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('dashboard.list')}</p>
            <SkeletonList />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('dashboard.table')}</p>
            <SkeletonTable rows={3} />
          </div>
        </div>
      </Section>

      <Section
        title={t('dashboard.dataTableFoundation')}
        description={t('dashboard.dataTableFoundationDescription')}
      >
        <Link href="/dev/data-table" className="text-sm font-medium text-primary hover:underline">
          {t('dashboard.openDataTablePreview')}
        </Link>
      </Section>
    </>
  );
}
