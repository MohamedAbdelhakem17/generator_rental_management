'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Play, Plus, Power, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { StatusFilter } from '@/components/data-table/filters/status-filter';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GeneratorFormDialog } from './generator-form-dialog';
import { StopGeneratorDialog } from './stop-generator-dialog';
import { toBadgeStatus, type ApiGeneratorStatus, type GeneratorRow } from './types';

const columnHelper = createColumnHelper<GeneratorRow>();

const STATUS_OPTIONS: { value: ApiGeneratorStatus; label: string; tone: 'success' | 'info' | 'warning' | 'danger' }[] = [
  { value: 'Available', label: 'Available', tone: 'success' },
  { value: 'Rented', label: 'Rented', tone: 'info' },
  { value: 'Under Maintenance', label: 'Under Maintenance', tone: 'warning' },
  { value: 'Stopped', label: 'Stopped', tone: 'danger' },
];

export default function GeneratorsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <GeneratorsPageContent />
    </Suspense>
  );
}

function GeneratorsPageContent() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('generators:write') ?? false;
  const canDeactivate = user?.permissions.includes('generators:delete') ?? false;

  const [formGenerator, setFormGenerator] = useState<GeneratorRow | 'new' | null>(null);
  const [stopTarget, setStopTarget] = useState<GeneratorRow | null>(null);
  const [resumeTarget, setResumeTarget] = useState<GeneratorRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<GeneratorRow | null>(null);

  const table = useDataTableQuery<GeneratorRow>({
    queryKey: 'generators',
    queryFn: (params, signal) =>
      apiClient.getPaginated<GeneratorRow>(
        '/api/generators',
        { page: params.page, limit: params.limit, sort: params.sort, search: params.search, ...params.filters },
        signal,
      ),
    defaultSort: 'code',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['generators'] });
  }

  async function confirmResume() {
    if (!resumeTarget) return;
    try {
      await apiClient.post(`/api/generators/${resumeTarget.id}/resume`);
      toast.success(`${resumeTarget.code} resumed`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't resume this generator.");
      throw error;
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    try {
      await apiClient.delete(`/api/generators/${deactivateTarget.id}`);
      toast.success(`Deactivated ${deactivateTarget.code}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't deactivate this generator.");
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<GeneratorRow, any>[] = [
    columnHelper.accessor('code', {
      header: 'Code',
      cell: (info) => (
        <Link href={`/generators/${info.row.original.id}`} className="font-medium text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor((row) => `${row.specifications.brand} ${row.specifications.model}`, {
      id: 'brandModel',
      header: 'Brand / model',
      enableSorting: false,
    }),
    columnHelper.accessor((row) => row.specifications.kva, {
      id: 'kva',
      header: 'kVA',
      enableSorting: false,
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={toBadgeStatus(info.getValue())} />,
    }),
    columnHelper.accessor('location', { header: 'Location', enableSorting: false }),
    columnHelper.accessor('currentMeter', {
      header: 'Meter (h)',
      cell: (info) => <span className="tabular-data">{info.getValue().toLocaleString()}</span>,
    }),
    createActionsColumn<GeneratorRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.code}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite ? (
            <DropdownMenuItem onClick={() => setFormGenerator(row)}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </DropdownMenuItem>
          ) : null}
          {canWrite && row.manualStatus === 'Stopped' ? (
            <DropdownMenuItem onClick={() => setResumeTarget(row)}>
              <Play className="size-4" aria-hidden />
              Resume
            </DropdownMenuItem>
          ) : null}
          {canWrite && row.manualStatus !== 'Stopped' ? (
            <DropdownMenuItem onClick={() => setStopTarget(row)}>
              <Power className="size-4" aria-hidden />
              Stop
            </DropdownMenuItem>
          ) : null}
          {canDeactivate ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeactivateTarget(row)}>
              <ShieldOff className="size-4" aria-hidden />
              Deactivate
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Generators"
        description="The fleet's master records — specs, meter, and status."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setFormGenerator('new')}>
              <Plus className="size-4" aria-hidden />
              New generator
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search code, brand, model, serial…"
          className="w-72"
        />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={STATUS_OPTIONS}
          placeholder="Status"
        />
        <SearchInput value={table.filters.location ?? ''} onChange={(value) => table.setFilter('location', value || undefined)} placeholder="Location…" className="w-48" />
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
        emptyTitle="No generators yet"
        emptyDescription={canWrite ? 'Register the first unit to start tracking the fleet.' : 'The fleet will appear here once units are registered.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? (
        <>
          <GeneratorFormDialog
            open={formGenerator !== null}
            onOpenChange={(open) => !open && setFormGenerator(null)}
            generator={formGenerator === 'new' || formGenerator === null ? undefined : formGenerator}
          />

          <StopGeneratorDialog
            open={stopTarget !== null}
            onOpenChange={(open) => !open && setStopTarget(null)}
            generatorCode={stopTarget?.code ?? ''}
            onStopped={async (reason) => {
              if (!stopTarget) return;
              await apiClient.post(`/api/generators/${stopTarget.id}/stop`, { reason });
              await invalidate();
            }}
          />

          <ConfirmDialog
            open={resumeTarget !== null}
            onOpenChange={(open) => !open && setResumeTarget(null)}
            title={resumeTarget ? `Resume ${resumeTarget.code}?` : ''}
            description="Its status goes back to being derived from contracts and maintenance."
            confirmLabel="Resume"
            confirmVariant="default"
            onConfirm={confirmResume}
          />
        </>
      ) : null}

      {canDeactivate ? (
        <ConfirmDialog
          open={deactivateTarget !== null}
          onOpenChange={(open) => !open && setDeactivateTarget(null)}
          title={deactivateTarget ? `Deactivate ${deactivateTarget.code}?` : ''}
          description="This soft-deletes the record — it's blocked while an active contract or open maintenance references it, and stays visible in historical reports."
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
        />
      ) : null}
    </>
  );
}
