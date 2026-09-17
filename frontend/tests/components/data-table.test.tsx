import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/data-table';
import { renderWithProviders } from '../test-utils';

interface Row {
  id: string;
  name: string;
}

const data: Row[] = [
  { id: '6aabb0bff0c2d70e0d0d13e8', name: 'Alpha' },
  { id: '6aabb0bff0c2d70e0d0d13e9', name: 'Beta' },
];

const columns: ColumnDef<Row, unknown>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="select-all"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label={`select-${row.id}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  },
  { accessorKey: 'name', header: 'Name' },
];

describe('DataTable row selection', () => {
  it('does not crash when the consumer does not provide a controlled rowSelection prop', () => {
    // Regression test: state.rowSelection must never be undefined, since TanStack's
    // row.getIsSelected() is called unconditionally for every row on every render,
    // regardless of whether the consumer opted into row selection.
    expect(() =>
      renderWithProviders(<DataTable columns={columns} data={data} getRowId={(row) => row.id} />),
    ).not.toThrow();

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByLabelText(`select-${data[0].id}`)).not.toBeChecked();
  });

  it('renders selection checkboxes without crashing when selection is not controlled (no onRowSelectionChange)', async () => {
    // Row selection is disabled (enableRowSelection: false) without a controlled handler,
    // by design — this only asserts getIsSelected()/the click handler never throw.
    renderWithProviders(<DataTable columns={columns} data={data} getRowId={(row) => row.id} />);

    const checkbox = screen.getByLabelText(`select-${data[0].id}`);
    expect(checkbox).not.toBeChecked();
    await expect(userEvent.click(checkbox)).resolves.not.toThrow();
    expect(checkbox).not.toBeChecked();
  });

  it('supports controlled selection via rowSelection + onRowSelectionChange', async () => {
    function Wrapper() {
      const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
      return (
        <DataTable
          columns={columns}
          data={data}
          getRowId={(row) => row.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      );
    }

    renderWithProviders(<Wrapper />);

    const checkbox = screen.getByLabelText(`select-${data[0].id}`);
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByLabelText(`select-${data[1].id}`)).not.toBeChecked();
  });

  it('never throws reading rowSelection by row id even with no selection columns at all', () => {
    const plainColumns: ColumnDef<Row, unknown>[] = [{ accessorKey: 'name', header: 'Name' }];
    const onRetry = vi.fn();
    expect(() =>
      renderWithProviders(
        <DataTable columns={plainColumns} data={data} getRowId={(row) => row.id} onRetry={onRetry} />,
      ),
    ).not.toThrow();
  });
});
