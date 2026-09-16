'use client';

import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { DataTable } from '@/components/data-table/data-table';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { Button } from '@/components/ui/button';
import { ResolveAlertDialog } from './resolve-alert-dialog';
import type { FuelAlertRow, FuelAlertSeverity, FuelAlertStatus } from './types';

const columnHelper = createColumnHelper<FuelAlertRow>();

const SEVERITY_TONES: Record<FuelAlertSeverity, StatusTone> = { Warning: 'warning', Critical: 'danger' };
const STATUS_TONES: Record<FuelAlertStatus, StatusTone> = { Open: 'danger', Acknowledged: 'warning', Resolved: 'success' };

function Badge({ label, tone }: { label: string; tone: StatusTone }) {
  const classes = STATUS_TONE_CLASSES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', classes.bg, classes.fg, classes.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden />
      {label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Section 14: a simpler table than the Fill-ups tab — no URL-synced pagination (avoids
 * colliding query-param keys with the sibling DataTable on the same route). */
export function FuelAlertsTab() {
  const { t } = useLocale();
  const SEVERITY_LABELS: Record<FuelAlertSeverity, string> = { Warning: t('fuel.severityWarning'), Critical: t('fuel.severityCritical') };
  const STATUS_LABELS: Record<FuelAlertStatus, string> = {
    Open: t('fuel.statusOpen'),
    Acknowledged: t('fuel.statusAcknowledged'),
    Resolved: t('fuel.statusResolved'),
  };
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canAcknowledge = user?.permissions.includes('fuel-alerts:acknowledge') ?? false;
  const canResolve = user?.permissions.includes('fuel-alerts:resolve') ?? false;

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [resolveTarget, setResolveTarget] = useState<FuelAlertRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['fuel-alerts', { status: statusFilter }],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<FuelAlertRow>('/api/fuel-alerts', { status: statusFilter, limit: 50, sort: '-lastOccurrenceAt' }, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['fuel-alerts'] });
  }

  async function acknowledge(alert: FuelAlertRow) {
    try {
      await apiClient.post(`/api/fuel-alerts/${alert.id}/acknowledge`);
      toast.success(t('fuel.alertAcknowledgedToast', { code: alert.generator.code }));
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('fuel.acknowledgeFailedToast'));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<FuelAlertRow, any>[] = [
    columnHelper.accessor((row) => row.generator.code, { id: 'generator', header: t('fuel.columnGenerator') }),
    columnHelper.accessor('severity', {
      header: t('fuel.columnSeverity'),
      cell: (info) => {
        const severity = info.getValue() as FuelAlertSeverity;
        return <Badge label={SEVERITY_LABELS[severity]} tone={SEVERITY_TONES[severity]} />;
      },
    }),
    columnHelper.accessor('status', {
      header: t('table.status'),
      cell: (info) => {
        const status = info.getValue() as FuelAlertStatus;
        return <Badge label={STATUS_LABELS[status]} tone={STATUS_TONES[status]} />;
      },
    }),
    columnHelper.accessor('firstOccurrenceAt', { header: t('fuel.columnFirstOccurrence'), cell: (info) => formatDateTime(info.getValue()) }),
    columnHelper.accessor('lastOccurrenceAt', { header: t('fuel.columnLastOccurrence'), cell: (info) => formatDateTime(info.getValue()) }),
    columnHelper.accessor('occurrenceCount', { header: t('fuel.columnOccurrences'), cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          {canAcknowledge && row.original.status === 'Open' ? (
            <Button variant="outline" size="sm" onClick={() => void acknowledge(row.original)}>
              <ShieldAlert className="size-3.5" aria-hidden />
              {t('fuel.acknowledgeButton')}
            </Button>
          ) : null}
          {canResolve && row.original.status !== 'Resolved' ? (
            <Button variant="outline" size="sm" onClick={() => setResolveTarget(row.original)}>
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t('fuel.resolveButton')}
            </Button>
          ) : null}
        </div>
      ),
    }),
  ];

  return (
    <div className="flex flex-col gap-3">
      <SelectFilter
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { value: 'Open', label: t('fuel.statusOpen') },
          { value: 'Acknowledged', label: t('fuel.statusAcknowledged') },
          { value: 'Resolved', label: t('fuel.statusResolved') },
        ]}
        placeholder={t('table.status')}
        allLabel={t('fuel.allStatusesLabel')}
      />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        showColumnVisibility={false}
        emptyTitle={t('fuel.alertsEmptyTitle')}
        emptyDescription={t('fuel.alertsEmptyDescription')}
      />

      {canResolve ? (
        <ResolveAlertDialog
          open={resolveTarget !== null}
          onOpenChange={(open) => !open && setResolveTarget(null)}
          generatorCode={resolveTarget?.generator.code ?? ''}
          onResolved={async (resolutionNote) => {
            if (!resolveTarget) return;
            await apiClient.post(`/api/fuel-alerts/${resolveTarget.id}/resolve`, { resolutionNote });
            await invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
