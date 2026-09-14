'use client';

import {
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { useMinimumDuration } from '@/lib/hooks/use-minimum-duration';
import { sortDirectionFor } from '@/lib/data-table/sort-cycle';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ColumnVisibilityMenu } from './column-visibility-menu';

export interface DataTableProps<T> {
  // `any` (not `unknown`) is intentional: TanStack Table's ColumnDef is contravariant in
  // its value type, so a heterogeneous columns array (string/number/enum columns mixed
  // together, as every real feature table has) cannot type-check against `unknown` here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId?: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Current URL sort (e.g. "-createdAt") and the setter from useDataTableQuery. */
  sort?: string;
  onToggleSort?: (columnId: string) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** True when a search/filter is active, so a zero-result state reads as "no matches" not "no data yet". */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  skeletonRows?: number;
  /** Renders the built-in ColumnVisibilityMenu above the table when hideable columns exist. */
  showColumnVisibility?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading = false,
  isError = false,
  onRetry,
  sort,
  onToggleSort,
  rowSelection,
  onRowSelectionChange,
  columnVisibility,
  onColumnVisibilityChange,
  hasActiveFilters = false,
  onClearFilters,
  emptyTitle,
  emptyDescription,
  emptyAction,
  skeletonRows = 8,
  showColumnVisibility = true,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    manualPagination: true,
    manualSorting: true,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange,
    onColumnVisibilityChange,
    enableRowSelection: Boolean(onRowSelectionChange),
  });

  const showSkeleton = useMinimumDuration(isLoading, 300);
  const columnCount = table.getVisibleLeafColumns().length;

  const hasHideableColumns = table.getAllLeafColumns().some((column) => column.getCanHide());

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border">
      {showColumnVisibility && hasHideableColumns ? (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <ColumnVisibilityMenu table={table} />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.columnDef.enableSorting !== false && Boolean(onToggleSort) && header.id !== 'select' && header.id !== 'actions';
                  const direction = canSort ? sortDirectionFor(sort, header.column.id) : null;

                  return (
                    <th key={header.id} className="whitespace-nowrap px-3 py-2.5 text-start font-medium text-muted-foreground">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={() => onToggleSort?.(header.column.id)}
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {direction === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : direction === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {isError ? (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  <ErrorState className="rounded-none border-0" onRetry={onRetry} />
                </td>
              </tr>
            ) : showSkeleton ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: columnCount }).map((_, colIndex) => (
                    <td key={colIndex} className="px-3 py-3">
                      <Skeleton className="h-3.5 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  {hasActiveFilters ? (
                    <EmptyState
                      className="rounded-none border-0"
                      title="No results match your filters"
                      description="Try adjusting or clearing your filters."
                      action={
                        onClearFilters ? (
                          <button type="button" onClick={onClearFilters} className="text-sm font-medium text-primary hover:underline">
                            Clear filters
                          </button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <EmptyState className="rounded-none border-0" title={emptyTitle} description={emptyDescription} action={emptyAction} />
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40" data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const rawValue = cell.getValue();
                    return (
                      <td key={cell.id} className="max-w-64 px-3 py-2.5">
                        <span className="block truncate" title={typeof rawValue === 'string' ? rawValue : undefined}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { useReactTable, getCoreRowModel, flexRender };
export type { ColumnDef, RowSelectionState, VisibilityState, OnChangeFn };
