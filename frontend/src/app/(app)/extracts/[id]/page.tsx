'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Send, XCircle } from 'lucide-react';
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
import { CancelDialog } from '../cancel-dialog';
import { ExtractFormDialog } from '../extract-form-dialog';
import type { ExtractRow, ExtractStatus } from '../types';

const STATUS_TONES: Record<ExtractStatus, StatusTone> = {
  Draft: 'neutral',
  'Under Review': 'info',
  Approved: 'success',
  'Partially Collected': 'warning',
  Collected: 'success',
  Cancelled: 'danger',
};

function StatusBadge({ status }: { status: ExtractStatus }) {
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span
      data-testid="extract-header-status"
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

export default function ExtractDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('extracts:create') ?? false;
  const canApprove = user?.permissions.includes('extracts:approve') ?? false;
  const canCancel = user?.permissions.includes('extracts:cancel') ?? false;

  const [isEditing, setIsEditing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: extract, isLoading, isError, refetch } = useQuery({
    queryKey: ['extracts', params.id],
    queryFn: ({ signal }) => apiClient.get<ExtractRow>(`/api/extracts/${params.id}`, undefined, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['extracts'] });
  }

  async function submitForReview() {
    if (!extract) return;
    try {
      await apiClient.post(`/api/extracts/${extract.id}/submit-review`);
      toast.success(`${extract.number} submitted for review`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't submit this extract for review.");
    }
  }

  async function confirmApprove() {
    if (!extract) return;
    try {
      await apiClient.post(`/api/extracts/${extract.id}/approve`);
      toast.success(`${extract.number} approved`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't approve this extract.");
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

  if (isError || !extract) {
    return <ErrorState title="Couldn't load this extract" onRetry={refetch} />;
  }

  const isLocked = extract.status !== 'Draft' && extract.status !== 'Under Review';
  const canCancelNow = canCancel && extract.status !== 'Cancelled' && extract.status !== 'Collected';

  return (
    <>
      <PageHeader
        title={extract.number}
        description={`${extract.customer.companyName} · ${extract.project.name}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/extracts')}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to extracts
            </Button>
            <StatusBadge status={extract.status} />
            {canWrite && !isLocked ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </Button>
            ) : null}
            {canWrite && extract.status === 'Draft' ? (
              <Button size="sm" onClick={() => void submitForReview()}>
                <Send className="size-4" aria-hidden />
                Submit for review
              </Button>
            ) : null}
            {canApprove && extract.status === 'Under Review' ? (
              <Button size="sm" onClick={() => setIsApproving(true)}>
                <CheckCircle2 className="size-4" aria-hidden />
                Approve
              </Button>
            ) : null}
            {canCancelNow ? (
              <Button variant="destructive" size="sm" onClick={() => setIsCancelling(true)}>
                <XCircle className="size-4" aria-hidden />
                Cancel
              </Button>
            ) : null}
          </div>
        }
      />

      {isLocked && extract.status !== 'Cancelled' ? (
        <p className="rounded-md border border-status-rented-border bg-status-rented-bg px-3 py-2 text-sm text-status-rented-fg">
          Approved — locked. Financial fields can no longer be edited directly; cancel and reissue a new Draft instead.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Overview</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field
              label="Customer"
              value={
                <Link href={`/customers/${extract.customer.id}`} className="text-primary hover:underline">
                  {extract.customerNameSnapshot || extract.customer.companyName}
                </Link>
              }
            />
            <Field
              label="Project"
              value={
                <Link href={`/projects/${extract.project.id}`} className="text-primary hover:underline">
                  {extract.project.name}
                </Link>
              }
            />
            <Field label="Period" value={`${formatDate(extract.period.start)} – ${formatDate(extract.period.end)}`} />
            <Field label="Contracts" value={`${extract.contractIds.length}`} />
            {extract.status === 'Cancelled' ? <Field label="Cancel reason" value={extract.cancelReason} /> : null}
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Totals</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Discounts" value={extract.discounts} mono />
            <Field
              label="VAT rate"
              value={extract.vatRateSnapshot !== null ? `${(extract.vatRateSnapshot * 100).toFixed(0)}% (locked)` : 'Live estimate'}
            />
            <Field label="Net before VAT" value={extract.totalBeforeVat ?? '—'} mono />
            <Field label="VAT" value={extract.vat ?? '—'} mono />
            <Field label="Final total" value={extract.finalTotal ?? '—'} mono />
            <Field label="Collected" value={extract.collectedAmount} mono />
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <h2 className="px-4 pt-4 text-sm font-medium text-foreground">Line items</h2>
        {extract.lineItems.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No line items yet" description="Edit this Draft to add rent, transport, or services line items." />
          </div>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {extract.lineItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium capitalize">{item.type}</span> — {item.description}
                </div>
                <span className="tabular-data">{item.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && !isLocked ? <ExtractFormDialog open={isEditing} onOpenChange={setIsEditing} extract={extract} /> : null}

      <ConfirmDialog
        open={isApproving}
        onOpenChange={setIsApproving}
        title={`Approve ${extract.number}?`}
        description="Snapshots the current VAT rate and locks all financial fields — cancel and reissue a new Draft to make further changes."
        confirmLabel="Approve"
        confirmVariant="default"
        onConfirm={confirmApprove}
      />

      <CancelDialog
        open={isCancelling}
        onOpenChange={setIsCancelling}
        extractNumber={extract.number}
        onCancelled={async (reason) => {
          await apiClient.post(`/api/extracts/${extract.id}/cancel`, { reason });
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
