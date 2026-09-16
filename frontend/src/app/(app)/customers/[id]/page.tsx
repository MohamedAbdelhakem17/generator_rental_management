'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderKanban, Pencil, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError, type PaginatedResponse } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProjectRow } from '../../projects/types';
import { CustomerFormDialog } from '../customer-form-dialog';
import type { CustomerRow } from '../types';
import { StatementTab } from './statement-tab';

function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[active ? 'success' : 'neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {active ? t('customers.active') : t('customers.inactive')}
    </span>
  );
}

export default function CustomerProfilePage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('customers:write') ?? false;

  const PLACEHOLDER_TABS = [
    { value: 'contracts', label: t('customers.tabContracts'), description: t('customers.tabContractsDescription') },
    { value: 'extracts', label: t('customers.tabExtracts'), description: t('customers.tabExtractsDescription') },
    { value: 'receipts', label: t('customers.tabReceipts'), description: t('customers.tabReceiptsDescription') },
  ] as const;

  const [isEditing, setIsEditing] = useState(false);

  const { data: customer, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', params.id],
    queryFn: ({ signal }) => apiClient.get<CustomerRow>(`/api/customers/${params.id}`, undefined, signal),
  });

  const { data: projects, isLoading: isProjectsLoading } = useQuery({
    queryKey: ['projects', { customerId: params.id }],
    queryFn: ({ signal }): Promise<PaginatedResponse<ProjectRow>> =>
      apiClient.getPaginated<ProjectRow>('/api/projects', { customerId: params.id, limit: 50, sort: 'name' }, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  async function toggleActive() {
    if (!customer) return;
    try {
      await apiClient.patch(`/api/customers/${customer.id}`, { active: !customer.active });
      toast.success(
        customer.active
          ? t('customers.deactivatedToast', { name: customer.companyName })
          : t('customers.activatedToast', { name: customer.companyName }),
      );
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !customer) {
    return <ErrorState title={t('customers.loadFailedTitle')} onRetry={refetch} />;
  }

  return (
    <>
      <PageHeader
        title={customer.companyName}
        description={t('customers.codeLabel', { code: customer.code })}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/customers')}>
              <ArrowLeft className="size-4" aria-hidden />
              {t('customers.backToCustomers')}
            </Button>
            <span data-testid="customer-header-status">
              <ActiveBadge active={customer.active} />
            </span>
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="size-4" aria-hidden />
                  {t('customers.edit')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void toggleActive()}>
                  {customer.active ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />}
                  {customer.active ? t('customers.deactivate') : t('customers.activate')}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">{t('customers.tabOverview')}</TabsTrigger>
          <TabsTrigger value="projects">{t('customers.tabProjects')}</TabsTrigger>
          <TabsTrigger value="statement">{t('customers.tabStatement')}</TabsTrigger>
          {PLACEHOLDER_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-foreground">{t('customers.detailsHeading')}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field label={t('customers.fieldContactPerson')} value={customer.contactPerson || '—'} />
              <Field label={t('customers.fieldPhone')} value={customer.phone || '—'} />
              <Field label={t('customers.fieldTaxNumber')} value={customer.taxNumber || '—'} mono />
              <Field label={t('customers.fieldAddress')} value={customer.address || '—'} />
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="projects">
          {isProjectsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !projects || projects.items.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title={t('customers.noProjectsTitle')}
              description={t('customers.noProjectsDescription')}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {projects.items.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="flex flex-col">
                    <Link href={`/projects/${project.id}`} className="font-medium text-primary hover:underline">
                      {project.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{project.code}</span>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="statement">
          <StatementTab customerId={customer.id} />
        </TabsContent>

        {PLACEHOLDER_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <EmptyState title={t('customers.noTabDataYet', { tab: tab.label })} description={tab.description} />
          </TabsContent>
        ))}
      </Tabs>

      <CustomerFormDialog open={isEditing} onOpenChange={setIsEditing} customer={customer} />
    </>
  );
}

function ProjectStatusBadge({ status }: { status: ProjectRow['status'] }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[status === 'Active' ? 'success' : 'neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {status === 'Active' ? t('customers.active') : t('customers.projectStatusClosed')}
    </span>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'tabular-data text-foreground' : 'text-foreground'}>{value}</dd>
    </div>
  );
}
