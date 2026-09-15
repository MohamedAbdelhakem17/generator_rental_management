'use client';

import { Suspense, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MoreHorizontal, Pencil, PlayCircle, Plus, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { GeneratorRow } from '../generators/types';
import { CancelDialog } from './cancel-dialog';
import { MaintenanceFormDialog } from './maintenance-form-dialog';
import type { MaintenanceRow, MaintenanceStatus } from './types';

const columnHelper = createColumnHelper<MaintenanceRow>();

const STATUS_TONES: Record<MaintenanceStatus, StatusTone> = {
  Open: 'warning',
  'In Progress': 'info',
  Completed: 'success',
  Cancelled: 'neutral',
};

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MaintenancePage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <MaintenancePageContent />
    </Suspense>
  );
}

function MaintenancePageContent() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('maintenance:write') ?? false;
  const canComplete = user?.permissions.includes('maintenance:complete') ?? false;

  const [isOpening, setIsOpening] = useState(false);
  const [editTarget, setEditTarget] = useState<MaintenanceRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaintenanceRow | null>(null);

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) => apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });

  const table = useDataTableQuery<MaintenanceRow>({
    queryKey: 'maintenance',
    queryFn: (params, signal) =>
      apiClient.getPaginated<MaintenanceRow>(
        '/api/maintenance',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-date',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['maintenance'] });
  }

  async function start(record: MaintenanceRow) {
    try {
      await apiClient.post(`/api/maintenance/${record.id}/start`);
      toast.success(`${record.generator.code} maintenance started`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't start this record.");
    }
  }

  async function complete(record: MaintenanceRow) {
    try {
      const response = await apiClient.post<MaintenanceRow>(`/api/maintenance/${record.id}/complete`);
      toast.success(`${record.generator.code} completed — next due at meter ${response.nextMaintenanceMeter}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't complete this record.");
    }
  }

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<MaintenanceRow, any>[] = [
    columnHelper.accessor((row) => row.generator.code, { id: 'generator', header: 'Generator', enableSorting: false }),
    columnHelper.accessor('type', { header: 'Type', enableSorting: false }),
    columnHelper.accessor('status', { header: 'Status', cell: (info) => <StatusBadge status={info.getValue() as MaintenanceStatus} /> }),
    columnHelper.accessor('date', { header: 'Date', cell: (info) => formatDate(info.getValue()) }),
    columnHelper.accessor('meter', { header: 'Meter', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('totalCost', { header: 'Total cost', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('nextMaintenanceMeter', {
      header: 'Next due',
      enableSorting: false,
      cell: (info) => (info.getValue() === null ? <span className="text-muted-foreground">—</span> : <span className="tabular-data">{info.getValue()}</span>),
    }),
    createActionsColumn<MaintenanceRow>((row) => {
      const isOpenStatus = row.status === 'Open' || row.status === 'In Progress';
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.generator.code} maintenance`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canWrite && isOpenStatus ? (
              <DropdownMenuItem onClick={() => setEditTarget(row)}>
                <Pencil className="size-4" aria-hidden />
                Edit costs
              </DropdownMenuItem>
            ) : null}
            {canWrite && row.status === 'Open' ? (
              <DropdownMenuItem onClick={() => void start(row)}>
                <PlayCircle className="size-4" aria-hidden />
                Start
              </DropdownMenuItem>
            ) : null}
            {canComplete && isOpenStatus ? (
              <DropdownMenuItem onClick={() => void complete(row)}>
                <CheckCircle2 className="size-4" aria-hidden />
                Complete
              </DropdownMenuItem>
            ) : null}
            {canComplete && isOpenStatus ? (
              <DropdownMenuItem onClick={() => setCancelTarget(row)} className="text-destructive focus:text-destructive">
                <XCircle className="size-4" aria-hidden />
                Cancel
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }),
  ];

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Preventive and corrective service history, cost, and next-due tracking per generator."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsOpening(true)}>
              <Plus className="size-4" aria-hidden />
              New maintenance
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          value={table.filters.generatorId}
          onChange={(value) => table.setFilter('generatorId', value)}
          options={(generators?.items ?? []).map((generator) => ({ value: generator.id, label: generator.code }))}
          placeholder="Generator"
          allLabel="All generators"
        />
        <SelectFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={[
            { value: 'Open', label: 'Open' },
            { value: 'In Progress', label: 'In Progress' },
            { value: 'Completed', label: 'Completed' },
            { value: 'Cancelled', label: 'Cancelled' },
          ]}
          placeholder="Status"
          allLabel="All statuses"
        />
        <SelectFilter
          value={table.filters.type}
          onChange={(value) => table.setFilter('type', value)}
          options={[
            { value: 'Preventive', label: 'Preventive' },
            { value: 'Corrective', label: 'Corrective' },
          ]}
          placeholder="Type"
          allLabel="All types"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('dateFrom', next.from);
            table.setFilter('dateTo', next.to);
          }}
          placeholder="Date range"
        />
        {table.hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={table.clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={table.items}
        getRowId={(row) => row.id}
        isLoading={table.isLoading}
        isError={table.isError}
        onRetry={table.refetch}
        sort={table.sort}
        onToggleSort={table.toggleSort}
        hasActiveFilters={table.hasActiveFilters}
        onClearFilters={table.clearFilters}
        showColumnVisibility={false}
        emptyTitle="No maintenance records yet"
        emptyDescription={canWrite ? 'Open the first maintenance record to start tracking service history.' : 'Records will appear here once logged.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? <MaintenanceFormDialog open={isOpening} onOpenChange={setIsOpening} /> : null}

      {canWrite ? (
        <MaintenanceFormDialog
          open={editTarget !== null}
          onOpenChange={(open) => !open && setEditTarget(null)}
          record={editTarget}
        />
      ) : null}

      {canComplete ? (
        <CancelDialog
          open={cancelTarget !== null}
          onOpenChange={(open) => !open && setCancelTarget(null)}
          generatorCode={cancelTarget?.generator.code ?? ''}
          onCancelled={async (reason) => {
            if (!cancelTarget) return;
            await apiClient.post(`/api/maintenance/${cancelTarget.id}/cancel`, { reason });
            await invalidate();
          }}
        />
      ) : null}
    </>
  );
}
