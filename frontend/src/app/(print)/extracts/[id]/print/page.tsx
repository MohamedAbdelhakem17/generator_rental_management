'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';

import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { ExtractRow } from '../../../../(app)/extracts/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ExtractPrintPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();

  const { data: extract, isLoading, isError, refetch } = useQuery({
    queryKey: ['extracts', params.id],
    queryFn: ({ signal }) =>
      apiClient.get<ExtractRow>(`/api/extracts/${params.id}`, undefined, signal),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (isError || !extract) {
    return <ErrorState title={t('extracts.loadFailedTitle')} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          {t('export.printButtonLabel')}
        </Button>
      </div>

      <header className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('extracts.printTitle')}</h1>
          <p className="tabular-data text-sm text-muted-foreground">{extract.number}</p>
        </div>
        <div className="text-end text-sm text-muted-foreground">
          <p>{formatDate(extract.createdAt)}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('extracts.fieldCustomer')}</p>
          <p className="font-medium text-foreground">
            {extract.customerNameSnapshot || extract.customer.companyName}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('extracts.fieldProject')}</p>
          <p className="font-medium text-foreground">{extract.project.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('extracts.fieldPeriod')}</p>
          <p className="text-foreground">
            {formatDate(extract.period.start)} – {formatDate(extract.period.end)}
          </p>
        </div>
      </section>

      <table className="w-full text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="py-2 text-start font-medium">{t('extracts.fieldLineItems')}</th>
            <th className="py-2 text-end font-medium">{t('reports.colAmount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {extract.lineItems.map((item) => (
            <tr key={item.id}>
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-end tabular-data">{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ms-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('extracts.fieldDiscounts')}</span>
          <span className="tabular-data">{extract.discounts}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('extracts.netBeforeVat')}</span>
          <span className="tabular-data">{extract.totalBeforeVat ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('extracts.vat')}</span>
          <span className="tabular-data">{extract.vat ?? '—'}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
          <span>{t('extracts.finalTotal')}</span>
          <span className="tabular-data">{extract.finalTotal ?? '—'}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{t('extracts.collected')}</span>
          <span className="tabular-data">{extract.collectedAmount}</span>
        </div>
      </section>
    </div>
  );
}
