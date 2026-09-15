'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Gauge, Play, Power } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useSession } from '@/lib/session/session-provider';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneratorFormDialog } from '../generator-form-dialog';
import { StatusHistoryList } from '../status-history-list';
import { StopGeneratorDialog } from '../stop-generator-dialog';
import { toBadgeStatus, type GeneratorRow, type StatusHistoryEntry } from '../types';

const PLACEHOLDER_TABS = [
  { value: 'operations', label: 'Operations', description: 'Operation log entries and running hours land here once daily operations tracking ships.' },
  { value: 'fuel', label: 'Fuel', description: 'Fuel fill-ups and consumption trends land here once fuel management ships.' },
  { value: 'maintenance', label: 'Maintenance', description: 'Service history and the next due date land here once maintenance tracking ships.' },
  { value: 'contracts', label: 'Contracts', description: 'Rental contracts this unit has been assigned to land here once contract management ships.' },
  { value: 'profitability', label: 'Profitability', description: 'Revenue and cost per hour for this unit land here once the profitability engine ships.' },
] as const;

export default function GeneratorProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('generators:write') ?? false;

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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['generators'] });
  }

  async function confirmResume() {
    if (!generator) return;
    try {
      await apiClient.post(`/api/generators/${generator.id}/resume`);
      toast.success(`${generator.code} resumed`);
      invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't resume this generator.");
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
    return <ErrorState title="Couldn't load this generator" onRetry={refetch} />;
  }

  return (
    <>
      <PageHeader
        title={generator.code}
        description={`${generator.specifications.brand} ${generator.specifications.model} · ${generator.specifications.kva} kVA`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/generators')}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to fleet
            </Button>
            <span data-testid="generator-header-status">
              <StatusBadge status={toBadgeStatus(generator.status)} />
            </span>
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
                {generator.manualStatus === 'Stopped' ? (
                  <Button variant="outline" size="sm" onClick={() => setIsResuming(true)}>
                    <Play className="size-4" aria-hidden />
                    Resume
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setIsStopping(true)}>
                    <Power className="size-4" aria-hidden />
                    Stop
                  </Button>
                )}
              </>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
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
                Current meter
              </div>
              <p className="tabular-data text-3xl font-semibold text-foreground">
                {generator.currentMeter.toLocaleString()}
                <span className="ms-1 text-base font-normal text-muted-foreground">h</span>
              </p>
              {generator.commercialStatus === 'Assigned' ? (
                <p className="text-xs text-muted-foreground">Commercially assigned to an active contract</p>
              ) : (
                <p className="text-xs text-muted-foreground">Not commercially assigned</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface p-4 md:col-span-2">
              <h2 className="text-sm font-medium text-foreground">Specifications</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="Brand" value={generator.specifications.brand} />
                <Field label="Model" value={generator.specifications.model} />
                <Field label="kVA" value={generator.specifications.kva} />
                <Field label="Serial number" value={generator.specifications.serialNumber} mono />
                <Field label="Location" value={generator.location || '—'} />
                <Field label="Normal fuel use" value={`${generator.normalFuelConsumption} L/h`} />
                <Field label="Maintenance cycle" value={`${generator.maintenanceCycleHours} h`} />
              </dl>
            </div>
          </div>

          <div className="mt-4">
            <StatusHistoryList entries={statusHistory ?? []} isLoading={isStatusHistoryLoading} />
          </div>
        </TabsContent>

        {PLACEHOLDER_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <EmptyState title={`No ${tab.label.toLowerCase()} data yet`} description={tab.description} />
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
        title={`Resume ${generator.code}?`}
        description="Its status goes back to being derived from contracts and maintenance."
        confirmLabel="Resume"
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
