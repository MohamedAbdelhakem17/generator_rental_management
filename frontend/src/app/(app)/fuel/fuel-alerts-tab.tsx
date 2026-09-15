'use client';

import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
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
      toast.success(`${alert.generator.code} alert acknowledged`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't acknowledge this alert.");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<FuelAlertRow, any>[] = [
    columnHelper.accessor((row) => row.generator.code, { id: 'generator', header: 'Generator' }),
    columnHelper.accessor('severity', {
      header: 'Severity',
      cell: (info) => {
        const severity = info.getValue() as FuelAlertSeverity;
        return <Badge label={severity} tone={SEVERITY_TONES[severity]} />;
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue() as FuelAlertStatus;
        return <Badge label={status} tone={STATUS_TONES[status]} />;
      },
    }),
    columnHelper.accessor('firstOccurrenceAt', { header: 'First occurrence', cell: (info) => formatDateTime(info.getValue()) }),
    columnHelper.accessor('lastOccurrenceAt', { header: 'Last occurrence', cell: (info) => formatDateTime(info.getValue()) }),
    columnHelper.accessor('occurrenceCount', { header: 'Occurrences', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          {canAcknowledge && row.original.status === 'Open' ? (
            <Button variant="outline" size="sm" onClick={() => void acknowledge(row.original)}>
              <ShieldAlert className="size-3.5" aria-hidden />
              Acknowledge
            </Button>
          ) : null}
          {canResolve && row.original.status !== 'Resolved' ? (
            <Button variant="outline" size="sm" onClick={() => setResolveTarget(row.original)}>
              <CheckCircle2 className="size-3.5" aria-hidden />
              Resolve
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
          { value: 'Open', label: 'Open' },
          { value: 'Acknowledged', label: 'Acknowledged' },
          { value: 'Resolved', label: 'Resolved' },
        ]}
        placeholder="Status"
        allLabel="All statuses"
      />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        showColumnVisibility={false}
        emptyTitle="No fuel alerts"
        emptyDescription="Abnormal consumption readings will show up here."
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
