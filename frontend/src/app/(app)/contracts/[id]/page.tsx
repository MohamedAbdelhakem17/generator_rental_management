'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useSession } from '@/lib/session/session-provider';
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
import type { ContractDetail, ContractStatus } from '../types';

const STATUS_TONES: Record<ContractStatus, StatusTone> = {
  Draft: 'neutral',
  Active: 'success',
  Expired: 'warning',
  Cancelled: 'danger',
};

function StatusBadge({ status }: { status: ContractStatus }) {
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span
      data-testid="contract-header-status"
      className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {status}
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
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('contracts:write') ?? false;

  const [isActivating, setIsActivating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [itemErrors, setItemErrors] = useState<Map<number, string[]>>(new Map());

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
      toast.success(`${contract.number} activated`);
      await invalidate();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setItemErrors(parseItemErrors(error.fieldErrors));
        toast.error(error.message);
      } else {
        toast.error(error instanceof ApiError ? error.message : "Couldn't activate this contract.");
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
    return <ErrorState title="Couldn't load this contract" onRetry={refetch} />;
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
              Back to contracts
            </Button>
            <StatusBadge status={contract.status} />
            {canWrite && contract.status === 'Draft' ? (
              <Button variant="default" size="sm" onClick={() => setIsActivating(true)}>
                <Play className="size-4" aria-hidden />
                Activate
              </Button>
            ) : null}
            {canWrite && (contract.status === 'Draft' || contract.status === 'Active') ? (
              <Button variant="destructive" size="sm" onClick={() => setIsCancelling(true)}>
                <XCircle className="size-4" aria-hidden />
                Cancel
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="extracts">Extracts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-foreground">Terms</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field
                  label="Customer"
                  value={
                    <Link href={`/customers/${contract.customer.id}`} className="text-primary hover:underline">
                      {contract.customer.companyName}
                    </Link>
                  }
                />
                <Field
                  label="Project"
                  value={
                    <Link href={`/projects/${contract.project.id}`} className="text-primary hover:underline">
                      {contract.project.name}
                    </Link>
                  }
                />
                <Field label="Start date" value={formatDate(contract.startDate)} />
                <Field label="End date" value={formatDate(contract.endDate)} />
                <Field label="Rental method" value={contract.rentalMethod[0]!.toUpperCase() + contract.rentalMethod.slice(1)} />
                {contract.status === 'Cancelled' ? <Field label="Cancel reason" value={contract.cancelReason} /> : null}
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-foreground">Insurance</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="Provider" value={contract.insurance.provider || '—'} />
                <Field label="Policy number" value={contract.insurance.policyNumber || '—'} />
                <Field label="Amount" value={contract.insurance.amount} mono />
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="items">
          {contract.items.length === 0 ? (
            <EmptyState title="No items yet" description="A Draft contract can be edited to add generators before activating." />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {contract.items.map((item, index) => (
                <li key={item.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/generators/${item.generatorId}`} className="font-medium text-primary hover:underline">
                      {item.generatorCode}
                    </Link>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{item.billingMethod[0]!.toUpperCase() + item.billingMethod.slice(1)}</span>
                      <span className="tabular-data">{item.unitPrice}</span>
                    </div>
                  </div>
                  {itemErrors.get(index) ? (
                    <p className="rounded-md bg-status-stopped-bg px-2 py-1 text-xs text-status-stopped-fg">
                      {itemErrors.get(index)!.join(' · ')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="extracts">
          <EmptyState title="No extracts yet" description="Billing extracts generated from this contract land here once extract management ships." />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={isActivating}
        onOpenChange={setIsActivating}
        title={`Activate ${contract.number}?`}
        description="Runs the conflict check across every item first — activation is blocked if any generator overlaps another Active contract."
        confirmLabel="Activate"
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
