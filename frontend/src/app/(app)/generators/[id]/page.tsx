'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Gauge, Play, Power } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FuelConsumptionChart } from '../../fuel/fuel-consumption-chart';
import type { OperationLogRow } from '../../operations/types';
import { GeneratorFormDialog } from '../generator-form-dialog';
import { ProfitabilityTab } from '../profitability-tab';
import { StatusHistoryList } from '../status-history-list';
import { StopGeneratorDialog } from '../stop-generator-dialog';
import { toBadgeStatus, type GeneratorRow, type StatusHistoryEntry } from '../types';

export default function GeneratorProfilePage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('generators:write') ?? false;
  const canViewProfitability = user?.permissions.includes('profitability:read') ?? false;

  const PLACEHOLDER_TABS = [
    { value: 'maintenance', label: t('generators.tabMaintenance'), description: t('generators.tabMaintenanceDescription') },
    { value: 'contracts', label: t('generators.tabContracts'), description: t('generators.tabContractsDescription') },
  ] as const;

  const [isEditing, setIsEditing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const { data: generator, isLoading, isError, refetch } = useQuery({
    queryKey: ['generators', params.id],
    queryFn: ({ signal }) => apiClient.get<GeneratorRow>(`/api/generators/${params.id}`, undefined, signal),
  });

  const { data: statusHistory, isLoading: isStatusHistoryLoading } = useQuery({
    queryKey: ['generators', params.id, 'status-history'],
    queryFn: ({ signal }) =>
      apiClient.get<StatusHistoryEntry[]>(`/api/generators/${params.id}/status-history`, undefined, signal),
  });

  const { data: operationLogs, isLoading: isOperationLogsLoading } = useQuery({
    queryKey: ['operations', { generatorId: params.id }],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<OperationLogRow>('/api/operations', { generatorId: params.id, limit: 20, sort: '-date' }, signal),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['generators'] });
  }

  async function confirmResume() {
    if (!generator) return;
    try {
      await apiClient.post(`/api/generators/${generator.id}/resume`);
      toast.success(t('generators.resumedToast', { code: generator.code }));
      invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('generators.resumeFailedToast'));
      throw error;
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

  if (isError || !generator) {
    return <ErrorState title={t('generators.loadGeneratorFailedTitle')} onRetry={refetch} />;
  }

  return (
    <>
      <PageHeader
        title={generator.code}
        description={`${generator.specifications.brand} ${generator.specifications.model} · ${generator.specifications.kva} kVA`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/generators')}>
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
              {t('generators.backToFleet')}
            </Button>
            <span data-testid="generator-header-status">
              <StatusBadge status={toBadgeStatus(generator.status)} />
            </span>
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  {t('generators.edit')}
                </Button>
                {generator.manualStatus === 'Stopped' ? (
                  <Button variant="outline" size="sm" onClick={() => setIsResuming(true)}>
                    <Play className="size-4" aria-hidden />
                    {t('generators.resume')}
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setIsStopping(true)}>
                    <Power className="size-4" aria-hidden />
                    {t('generators.stop')}
                  </Button>
                )}
              </>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">{t('generators.tabOverview')}</TabsTrigger>
          <TabsTrigger value="operations">{t('generators.tabOperations')}</TabsTrigger>
          <TabsTrigger value="fuel">{t('generators.tabFuel')}</TabsTrigger>
          {canViewProfitability ? (
            <TabsTrigger value="profitability">{t('generators.tabProfitability')}</TabsTrigger>
          ) : null}
          {PLACEHOLDER_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-surface p-4 md:col-span-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="size-4" aria-hidden />
                {t('generators.currentMeter')}
              </div>
              <p className="tabular-data text-3xl font-semibold text-foreground">
                {generator.currentMeter.toLocaleString()}
                <span className="ms-1 text-base font-normal text-muted-foreground">h</span>
              </p>
              {generator.commercialStatus === 'Assigned' ? (
                <p className="text-xs text-muted-foreground">{t('generators.assignedToContract')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('generators.notAssigned')}</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface p-4 md:col-span-2">
              <h2 className="text-sm font-medium text-foreground">{t('generators.specifications')}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <Field label={t('generators.fieldBrand')} value={generator.specifications.brand} />
                <Field label={t('generators.fieldModel')} value={generator.specifications.model} />
                <Field label={t('generators.fieldKva')} value={generator.specifications.kva} />
                <Field label={t('generators.fieldSerial')} value={generator.specifications.serialNumber} mono />
                <Field label={t('generators.fieldLocation')} value={generator.location || '—'} />
                <Field label={t('generators.fieldFuel')} value={t('generators.fuelUsePerHour', { value: generator.normalFuelConsumption })} />
                <Field label={t('generators.fieldCycle')} value={t('generators.maintenanceCycleHoursValue', { value: generator.maintenanceCycleHours })} />
              </dl>
            </div>
          </div>

          <div className="mt-4">
            <StatusHistoryList entries={statusHistory ?? []} isLoading={isStatusHistoryLoading} />
          </div>
        </TabsContent>

        <TabsContent value="operations">
          {isOperationLogsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !operationLogs || operationLogs.items.length === 0 ? (
            <EmptyState
              icon={Gauge}
              title={t('generators.noOperationLogsTitle')}
              description={t('generators.noOperationLogsDescription')}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {operationLogs.items.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="flex flex-col">
                    <span className="text-foreground">{new Date(log.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span className="text-xs text-muted-foreground">{log.project.name}</span>
                  </div>
                  <span className="tabular-data text-muted-foreground">
                    {log.startMeter} → {log.endMeter}
                  </span>
                  <span className="tabular-data text-foreground">{log.operatingHours}h</span>
                  {log.status === 'Superseded' ? <span className="text-xs text-muted-foreground">{t('generators.superseded')}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="fuel">
          <FuelConsumptionChart generatorId={generator.id} normalFuelConsumption={generator.normalFuelConsumption} />
        </TabsContent>

        {canViewProfitability ? (
          <TabsContent value="profitability">
            <ProfitabilityTab generatorId={generator.id} />
          </TabsContent>
        ) : null}

        {PLACEHOLDER_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <EmptyState title={t('generators.noTabDataYet', { tab: tab.label })} description={tab.description} />
          </TabsContent>
        ))}
      </Tabs>

      <GeneratorFormDialog open={isEditing} onOpenChange={setIsEditing} generator={generator} />

      <StopGeneratorDialog
        open={isStopping}
        onOpenChange={setIsStopping}
        generatorCode={generator.code}
        onStopped={async (reason) => {
          await apiClient.post(`/api/generators/${generator.id}/stop`, { reason });
          invalidate();
        }}
      />

      <ConfirmDialog
        open={isResuming}
        onOpenChange={setIsResuming}
        title={t('generators.resumeConfirmTitle', { code: generator.code })}
        description={t('generators.resumeConfirmDescription')}
        confirmLabel={t('generators.resume')}
        confirmVariant="default"
        onConfirm={confirmResume}
      />
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'tabular-data text-foreground' : 'text-foreground'}>{value}</dd>
    </div>
  );
}
