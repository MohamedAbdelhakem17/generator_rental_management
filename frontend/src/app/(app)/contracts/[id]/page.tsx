'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useSession } from '@/lib/session/session-provider';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CancelContractDialog } from '../cancel-contract-dialog';
import { SharedAssignmentDialog } from '../shared-assignment-dialog';
import type { ContractDetail, ContractStatus } from '../types';

const STATUS_TONES: Record<ContractStatus, StatusTone> = {
  Draft: 'neutral',
  Active: 'success',
  Expired: 'warning',
  Cancelled: 'danger',
};

const STATUS_LABEL_KEYS: Record<ContractStatus, TranslationKey> = {
  Draft: 'contracts.statusDraft',
  Active: 'contracts.statusActive',
  Expired: 'contracts.statusExpired',
  Cancelled: 'contracts.statusCancelled',
};

const METHOD_LABEL_KEYS: Record<ContractDetail['rentalMethod'], TranslationKey> = {
  monthly: 'contracts.methodMonthly',
  daily: 'contracts.methodDaily',
  weekly: 'contracts.methodWeekly',
  hourly: 'contracts.methodHourly',
};

function StatusBadge({ status }: { status: ContractStatus }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span
      data-testid="contract-header-status"
      className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Parses the `items[N].generatorId` field path the activation conflict error uses (Section 12). */
function parseItemErrors(fieldErrors: { field?: string; message: string }[]): Map<number, string[]> {
  const byIndex = new Map<number, string[]>();
  for (const fieldError of fieldErrors) {
    const match = fieldError.field?.match(/^items\[(\d+)\]/);
    if (!match) continue;
    const index = Number(match[1]);
    const existing = byIndex.get(index) ?? [];
    existing.push(fieldError.message);
    byIndex.set(index, existing);
  }
  return byIndex;
}

export default function ContractDetailPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('contracts:write') ?? false;
  const canOverride = user?.permissions.includes('contracts:sharedAssignmentOverride') ?? false;

  const [isActivating, setIsActivating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [itemErrors, setItemErrors] = useState<Map<number, string[]>>(new Map());
  const [overrideTarget, setOverrideTarget] = useState<{ itemId: string; generatorCode: string } | null>(null);

  const { data: contract, isLoading, isError, refetch } = useQuery({
    queryKey: ['contracts', params.id],
    queryFn: ({ signal }) => apiClient.get<ContractDetail>(`/api/contracts/${params.id}`, undefined, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['contracts'] });
  }

  async function confirmActivate() {
    if (!contract) return;
    setItemErrors(new Map());
    try {
      await apiClient.post(`/api/contracts/${contract.id}/activate`);
      toast.success(t('contracts.activatedToast', { number: contract.number }));
      await invalidate();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setItemErrors(parseItemErrors(error.fieldErrors));
        toast.error(error.message);
      } else {
        toast.error(error instanceof ApiError ? error.message : t('contracts.activateFailedToast'));
      }
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

  if (isError || !contract) {
    return <ErrorState title={t('contracts.loadFailedTitle')} onRetry={refetch} />;
  }

  return (
    <>
      <PageHeader
        title={contract.number}
        description={`${contract.customer.companyName} · ${contract.project.name}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/contracts')}>
              <ArrowLeft className="size-4" aria-hidden />
              {t('contracts.backToContracts')}
            </Button>
            <StatusBadge status={contract.status} />
            {canWrite && contract.status === 'Draft' ? (
              <Button variant="default" size="sm" onClick={() => setIsActivating(true)}>
                <Play className="size-4" aria-hidden />
                {t('contracts.activate')}
              </Button>
            ) : null}
            {canWrite && (contract.status === 'Draft' || contract.status === 'Active') ? (
              <Button variant="destructive" size="sm" onClick={() => setIsCancelling(true)}>
                <XCircle className="size-4" aria-hidden />
                {t('contracts.cancel')}
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">{t('contracts.tabOverview')}</TabsTrigger>
          <TabsTrigger value="items">{t('contracts.tabItems')}</TabsTrigger>
          <TabsTrigger value="extracts">{t('contracts.tabExtracts')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-foreground">{t('contracts.termsHeading')}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field
                  label={t('contracts.fieldCustomer')}
                  value={
                    <Link href={`/customers/${contract.customer.id}`} className="text-primary hover:underline">
                      {contract.customer.companyName}
                    </Link>
                  }
                />
                <Field
                  label={t('contracts.fieldProject')}
                  value={
                    <Link href={`/projects/${contract.project.id}`} className="text-primary hover:underline">
                      {contract.project.name}
                    </Link>
                  }
                />
                <Field label={t('contracts.fieldStartDate')} value={formatDate(contract.startDate)} />
                <Field label={t('contracts.fieldEndDate')} value={formatDate(contract.endDate)} />
                <Field label={t('contracts.fieldRentalMethod')} value={t(METHOD_LABEL_KEYS[contract.rentalMethod])} />
                {contract.status === 'Cancelled' ? <Field label={t('contracts.fieldCancelReason')} value={contract.cancelReason} /> : null}
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-foreground">{t('contracts.insuranceHeading')}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label={t('contracts.fieldProvider')} value={contract.insurance.provider || '—'} />
                <Field label={t('contracts.fieldPolicyNumber')} value={contract.insurance.policyNumber || '—'} />
                <Field label={t('contracts.fieldAmount')} value={contract.insurance.amount} mono />
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="items">
          {contract.items.length === 0 ? (
            <EmptyState title={t('contracts.noItemsTitle')} description={t('contracts.noItemsDescription')} />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {contract.items.map((item, index) => (
                <li key={item.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/generators/${item.generatorId}`} className="font-medium text-primary hover:underline">
                      {item.generatorCode}
                    </Link>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{t(METHOD_LABEL_KEYS[item.billingMethod])}</span>
                      <span className="tabular-data">{item.unitPrice}</span>
                    </div>
                  </div>
                  {item.isSharedAssignmentException ? (
                    <p className="flex items-center gap-1.5 rounded-md bg-status-rented-bg px-2 py-1 text-xs text-status-rented-fg">
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                      {t('contracts.sharedAssignmentApproved', { justification: item.sharedAssignmentJustification })}
                    </p>
                  ) : null}
                  {itemErrors.get(index) ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-status-stopped-bg px-2 py-1 text-xs text-status-stopped-fg">
                      <span>{itemErrors.get(index)!.join(' · ')}</span>
                      {canOverride && contract.status === 'Draft' ? (
                        <button
                          type="button"
                          className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
                          onClick={() => setOverrideTarget({ itemId: item.id, generatorCode: item.generatorCode })}
                        >
                          {t('contracts.applyOverride')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="extracts">
          <EmptyState
            title={t('contracts.viewExtractsTitle')}
            description={t('contracts.viewExtractsDescription')}
            action={
              <Link href={`/extracts?customerId=${contract.customer.id}`} className="text-sm font-medium text-primary hover:underline">
                {t('contracts.goToExtracts')}
              </Link>
            }
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={isActivating}
        onOpenChange={setIsActivating}
        title={t('contracts.activateConfirmTitle', { number: contract.number })}
        description={t('contracts.activateConfirmDescription')}
        confirmLabel={t('contracts.activate')}
        confirmVariant="default"
        onConfirm={confirmActivate}
      />

      <CancelContractDialog
        open={isCancelling}
        onOpenChange={setIsCancelling}
        contractNumber={contract.number}
        onCancelled={async (reason) => {
          await apiClient.post(`/api/contracts/${contract.id}/cancel`, { reason });
          await invalidate();
        }}
      />

      <SharedAssignmentDialog
        open={overrideTarget !== null}
        onOpenChange={(open) => !open && setOverrideTarget(null)}
        generatorCode={overrideTarget?.generatorCode ?? ''}
        onApproved={async (justification) => {
          if (!overrideTarget) return;
          await apiClient.post(`/api/contracts/${contract.id}/items/${overrideTarget.itemId}/shared-assignment`, {
            justification,
          });
          await invalidate();
        }}
      />
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'tabular-data text-foreground' : 'text-foreground'}>{value}</dd>
    </div>
  );
}
