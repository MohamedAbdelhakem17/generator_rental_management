'use client';

import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { ShieldCheck } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { useRolesQuery } from './use-roles';
import { RolePermissionsDialog } from './role-permissions-dialog';
import type { RoleRow } from './types';

const columnHelper = createColumnHelper<RoleRow>();

export function RolesTab() {
  const { data, isLoading, isError, refetch } = useRolesQuery();
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<RoleRow, any>[] = [
    columnHelper.accessor('name', { header: 'Role', cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
    columnHelper.accessor((row) => row.permissions.length, {
      id: 'permissionCount',
      header: 'Permissions',
      cell: (info) => <span className="tabular-data text-muted-foreground">{info.getValue()}</span>,
    }),
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditingRole(row.original)}>
            <ShieldCheck className="size-4" aria-hidden />
            Edit permissions
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        showColumnVisibility={false}
        emptyTitle="No roles yet"
        emptyDescription="Roles are seeded once — run the backend seed script."
      />

      <RolePermissionsDialog
        role={editingRole}
        open={editingRole !== null}
        onOpenChange={(open) => !open && setEditingRole(null)}
      />
    </div>
  );
}
