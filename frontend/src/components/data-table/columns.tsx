import type { ColumnDef } from '@tanstack/react-table';
import type { Table, Row } from '@tanstack/react-table';

import { useLocale } from '@/lib/i18n/locale-provider';
import { Checkbox } from '@/components/ui/checkbox';

function SelectAllHeader<T>({ table }: { table: Table<T> }) {
  const { t } = useLocale();
  return (
    <Checkbox
      checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
      aria-label={t('table.selectAllRows')}
    />
  );
}

function SelectRowCell<T>({ row }: { row: Row<T> }) {
  const { t } = useLocale();
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
      aria-label={t('table.selectRow')}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Bulk-select scaffold (TASK-005 Scope): a checkbox column any feature table can opt into. */
export function createSelectionColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: 'select',
    header: ({ table }) => <SelectAllHeader table={table} />,
    cell: ({ row }) => <SelectRowCell row={row} />,
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
