import type { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';

/** Bulk-select scaffold (TASK-005 Scope): a checkbox column any feature table can opt into. */
export function createSelectionColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
        aria-label="Select all rows on this page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 36,
  };
}

/** A trailing row-actions column any feature table can opt into (TASK-005 Scope). */
export function createActionsColumn<T>(render: (row: T) => React.ReactNode): ColumnDef<T, unknown> {
  return {
    id: 'actions',
    header: '',
    cell: ({ row }) => <div className="flex justify-end">{render(row.original)}</div>,
    enableSorting: false,
    enableHiding: false,
    size: 48,
  };
}
