'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Printer, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/page-header';
import { AttachmentsPanel } from '@/components/shared/attachments-panel';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, ApiError } from '@/lib/apiClient';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
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

const STATUS_LABEL_KEYS: Record<ExtractStatus, TranslationKey> = {
  Draft: 'extracts.statusDraft',
  'Under Review': 'extracts.statusUnderReview',
  Approved: 'extracts.statusApproved',
  'Partially Collected': 'extracts.statusPartiallyCollected',
  Collected: 'extracts.statusCollected',
  Cancelled: 'extracts.statusCancelled',
};

function StatusBadge({ status }: { status: ExtractStatus }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span
      data-testid="extract-header-status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        tone.bg,
        tone.fg,
        tone.border,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ExtractDetailPage() {
  const { t } = useLocale();
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

  const {
    data: extract,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['extracts', params.id],
    queryFn: ({ signal }) =>
      apiClient.get<ExtractRow>(`/api/extracts/${params.id}`, undefined, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['extracts'] });
  }

  async function submitForReview() {
    if (!extract) return;
    try {
      await apiClient.post(`/api/extracts/${extract.id}/submit-review`);
      toast.success(t('extracts.submittedToast', { number: extract.number }));
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('extracts.submitFailedToast'));
    }
  }

  async function confirmApprove() {
    if (!extract) return;
    try {
      await apiClient.post(`/api/extracts/${extract.id}/approve`);
      toast.success(t('extracts.approvedToast', { number: extract.number }));
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('extracts.approveFailedToast'));
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
    return <ErrorState title={t('extracts.loadFailedTitle')} onRetry={refetch} />;
  }

  const isLocked = extract.status !== 'Draft' && extract.status !== 'Under Review';
  const canCancelNow =
    canCancel && extract.status !== 'Cancelled' && extract.status !== 'Collected';

  return (
    <>
      <PageHeader
        title={extract.number}
        description={`${extract.customer.companyName} · ${extract.project.name}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/extracts')}>
              <ArrowLeft className="size-4" aria-hidden />
              {t('extracts.backToExtracts')}
            </Button>
            <StatusBadge status={extract.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/extracts/${extract.id}/print`, '_blank', 'noopener,noreferrer')}
            >
              <Printer className="size-4" aria-hidden />
              {t('export.printButtonLabel')}
            </Button>
            {canWrite && !isLocked ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="size-4" aria-hidden />
                {t('extracts.edit')}
              </Button>
            ) : null}
            {canWrite && extract.status === 'Draft' ? (
              <Button size="sm" onClick={() => void submitForReview()}>
                <Send className="size-4" aria-hidden />
                {t('extracts.submitForReview')}
              </Button>
            ) : null}
            {canApprove && extract.status === 'Under Review' ? (
              <Button size="sm" onClick={() => setIsApproving(true)}>
                <CheckCircle2 className="size-4" aria-hidden />
                {t('extracts.approve')}
              </Button>
            ) : null}
            {canCancelNow ? (
              <Button variant="destructive" size="sm" onClick={() => setIsCancelling(true)}>
                <XCircle className="size-4" aria-hidden />
                {t('extracts.cancel')}
              </Button>
            ) : null}
          </div>
        }
      />

      {isLocked && extract.status !== 'Cancelled' ? (
        <p className="rounded-md border border-status-rented-border bg-status-rented-bg px-3 py-2 text-sm text-status-rented-fg">
          {t('extracts.lockedNotice')}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">{t('extracts.overview')}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field
              label={t('extracts.fieldCustomer')}
              value={
                <Link
                  href={`/customers/${extract.customer.id}`}
                  className="text-primary hover:underline"
                >
                  {extract.customerNameSnapshot || extract.customer.companyName}
                </Link>
              }
            />
            <Field
              label={t('extracts.fieldProject')}
              value={
                <Link
                  href={`/projects/${extract.project.id}`}
                  className="text-primary hover:underline"
                >
                  {extract.project.name}
                </Link>
              }
            />
            <Field
              label={t('extracts.fieldPeriod')}
              value={`${formatDate(extract.period.start)} – ${formatDate(extract.period.end)}`}
            />
            <Field label={t('extracts.fieldContracts')} value={`${extract.contractIds.length}`} />
            {extract.status === 'Cancelled' ? (
              <Field label={t('extracts.cancelReason')} value={extract.cancelReason} />
            ) : null}
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">{t('extracts.totals')}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label={t('extracts.fieldDiscounts')} value={extract.discounts} mono />
            <Field
              label={t('extracts.vatRate')}
              value={
                extract.vatRateSnapshot !== null
                  ? t('extracts.lockedRate', { rate: (extract.vatRateSnapshot * 100).toFixed(0) })
                  : t('extracts.liveEstimate')
              }
            />
            <Field label={t('extracts.netBeforeVat')} value={extract.totalBeforeVat ?? '—'} mono />
            <Field label={t('extracts.vat')} value={extract.vat ?? '—'} mono />
            <Field label={t('extracts.finalTotal')} value={extract.finalTotal ?? '—'} mono />
            <Field label={t('extracts.collected')} value={extract.collectedAmount} mono />
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <h2 className="px-4 pt-4 text-sm font-medium text-foreground">
          {t('extracts.fieldLineItems')}
        </h2>
        {extract.lineItems.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={t('extracts.noLineItems')}
              description={t('extracts.noLineItemsDescription')}
            />
          </div>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {extract.lineItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium capitalize">
                    {t(
                      `extracts.type${item.type[0]!.toUpperCase()}${item.type.slice(1)}` as
                        'extracts.typeRent' | 'extracts.typeTransport' | 'extracts.typeServices',
                    )}
                  </span>{' '}
                  — {item.description}
                </div>
                <span className="tabular-data">{item.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-foreground">{t('attachments.title')}</h2>
        <div className="mt-3">
          {/* FR-002: attachments are still allowed on a locked (Approved+) extract. */}
          <AttachmentsPanel entityType="Extract" entityId={extract.id} canWrite={canWrite} />
        </div>
      </div>

      {canWrite && !isLocked ? (
        <ExtractFormDialog open={isEditing} onOpenChange={setIsEditing} extract={extract} />
      ) : null}

      <ConfirmDialog
        open={isApproving}
        onOpenChange={setIsApproving}
        title={t('extracts.approveConfirmTitle', { number: extract.number })}
        description={t('extracts.approveConfirmDescription')}
        confirmLabel={t('extracts.approve')}
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
