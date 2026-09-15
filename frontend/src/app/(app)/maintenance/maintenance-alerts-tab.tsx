'use client';

import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { DataTable } from '@/components/data-table/data-table';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { Button } from '@/components/ui/button';
import type { MaintenanceAlertLevel, MaintenanceAlertRow, MaintenanceAlertStatus } from './types';

const columnHelper = createColumnHelper<MaintenanceAlertRow>();

const LEVEL_TONES: Record<MaintenanceAlertLevel, StatusTone> = { Upcoming: 'warning', Overdue: 'danger' };
const STATUS_TONES: Record<MaintenanceAlertStatus, StatusTone> = { Open: 'danger', Acknowledged: 'warning', Resolved: 'success' };

function Badge({ label, tone }: { label: string; tone: StatusTone }) {
  const classes = STATUS_TONE_CLASSES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', classes.bg, classes.fg, classes.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden />
      {label}
    </span>
  );
}

/** Section 14: a simpler table than the Records tab — no URL-synced pagination (avoids
 * colliding query-param keys with the sibling DataTable on the same route). */
export function MaintenanceAlertsTab() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canAcknowledge = user?.permissions.includes('maintenance-alerts:acknowledge') ?? false;

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['maintenance-alerts', { status: statusFilter }],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<MaintenanceAlertRow>('/api/maintenance-alerts', { status: statusFilter, limit: 50, sort: '-createdAt' }, signal),
  });

  async function acknowledge(alert: MaintenanceAlertRow) {
    try {
      await apiClient.post(`/api/maintenance-alerts/${alert.id}/acknowledge`);
      toast.success(`${alert.generator.code} alert acknowledged`);
      await queryClient.invalidateQueries({ queryKey: ['maintenance-alerts'] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't acknowledge this alert.");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<MaintenanceAlertRow, any>[] = [
    columnHelper.accessor((row) => row.generator.code, { id: 'generator', header: 'Generator' }),
    columnHelper.accessor('level', {
      header: 'Level',
      cell: (info) => {
        const level = info.getValue() as MaintenanceAlertLevel;
        return <Badge label={level} tone={LEVEL_TONES[level]} />;
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue() as MaintenanceAlertStatus;
        return <Badge label={status} tone={STATUS_TONES[status]} />;
      },
    }),
    columnHelper.accessor('dueAtMeter', { header: 'Due at meter', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('currentMeterAtCreation', {
      header: 'Meter at alert',
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          {canAcknowledge && row.original.status === 'Open' ? (
            <Button variant="outline" size="sm" onClick={() => void acknowledge(row.original)}>
              <ShieldAlert className="size-3.5" aria-hidden />
              Acknowledge
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
        emptyTitle="No maintenance alerts"
        emptyDescription="Generators approaching or past their next-due meter will show up here."
      />
    </div>
  );
}
