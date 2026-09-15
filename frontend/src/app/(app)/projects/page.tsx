'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import { StatusFilter } from '@/components/data-table/filters/status-filter';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomerCombobox } from './customer-combobox';
import { ProjectFormDialog } from './project-form-dialog';
import type { ProjectRow } from './types';

const columnHelper = createColumnHelper<ProjectRow>();

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active', tone: 'success' as const },
  { value: 'Closed', label: 'Closed', tone: 'neutral' as const },
];

function StatusBadge({ status }: { status: ProjectRow['status'] }) {
  const tone = STATUS_TONE_CLASSES[status === 'Active' ? 'success' : 'neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {status}
    </span>
  );
}

export default function ProjectsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <ProjectsPageContent />
    </Suspense>
  );
}

function ProjectsPageContent() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('projects:write') ?? false;

  const [formProject, setFormProject] = useState<ProjectRow | 'new' | null>(null);
  const [closeTarget, setCloseTarget] = useState<ProjectRow | null>(null);

  const table = useDataTableQuery<ProjectRow>({
    queryKey: 'projects',
    queryFn: (params, signal) =>
      apiClient.getPaginated<ProjectRow>(
        '/api/projects',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: 'name',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['projects'] });
  }

  async function confirmClose() {
    if (!closeTarget) return;
    try {
      await apiClient.delete(`/api/projects/${closeTarget.id}`);
      toast.success(`Closed ${closeTarget.name}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't close this project.");
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ProjectRow, any>[] = [
    columnHelper.accessor('code', {
      header: 'Code',
      cell: (info) => (
        <Link href={`/projects/${info.row.original.id}`} className="font-medium text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor('name', { header: 'Name' }),
    columnHelper.accessor((row) => row.customer.companyName, {
      id: 'customer',
      header: 'Customer',
      enableSorting: false,
      cell: (info) => (
        <Link href={`/customers/${info.row.original.customer.id}`} className="text-foreground hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor('siteManager', { header: 'Site manager', enableSorting: false, cell: (info) => info.getValue() || '—' }),
    columnHelper.accessor('status', { header: 'Status', cell: (info) => <StatusBadge status={info.getValue()} /> }),
    // Generator count is deferred to the Contract module (TASK-012) — assigned generators are
    // a live derivation from Contract Items, never a stored count.
    createActionsColumn<ProjectRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.name}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite ? (
            <DropdownMenuItem onClick={() => setFormProject(row)}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </DropdownMenuItem>
          ) : null}
          {canWrite && row.status === 'Active' ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCloseTarget(row)}>
              <Lock className="size-4" aria-hidden />
              Close
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        description="A customer's job sites — contracts and generators organize under these."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setFormProject('new')}>
              <Plus className="size-4" aria-hidden />
              New project
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerCombobox
          value={table.filters.customerId ?? ''}
          onSelect={(customer) => table.setFilter('customerId', customer.id)}
          placeholder="All customers"
        />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={STATUS_OPTIONS}
          placeholder="Status"
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
        emptyTitle="No projects yet"
        emptyDescription={canWrite ? 'Add the first project to start organizing contracts and generators.' : 'Projects will appear here once they are added.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? (
        <>
          <ProjectFormDialog
            open={formProject !== null}
            onOpenChange={(open) => !open && setFormProject(null)}
            project={formProject === 'new' || formProject === null ? undefined : formProject}
          />

          <ConfirmDialog
            open={closeTarget !== null}
            onOpenChange={(open) => !open && setCloseTarget(null)}
            title={closeTarget ? `Close ${closeTarget.name}?` : ''}
            description="It's blocked while an active contract references it, and stays visible in historical reports."
            confirmLabel="Close project"
            onConfirm={confirmClose}
          />
        </>
      ) : null}
    </>
  );
}
