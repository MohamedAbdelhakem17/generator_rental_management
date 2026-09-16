'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, Plus, Power, PowerOff, Trash2, UserPen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { createActionsColumn } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { DataTablePagination } from '@/components/data-table/pagination';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import type { UserRow } from './types';
import { UserFormDialog } from './user-form-dialog';

const columnHelper = createColumnHelper<UserRow>();

function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[active ? 'success' : 'neutral'];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        tone.bg,
        tone.fg,
        tone.border,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {active ? t('users.active') : t('users.disabled')}
    </span>
  );
}

function formatLastLogin(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function UsersTab() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [formUser, setFormUser] = useState<UserRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const table = useDataTableQuery<UserRow>({
    queryKey: 'users',
    queryFn: (params, signal) =>
      apiClient.getPaginated<UserRow>(
        '/api/users',
        { page: params.page, limit: params.limit, sort: params.sort, search: params.search },
        signal,
      ),
    defaultSort: 'name',
  });

  async function toggleActive(user: UserRow) {
    try {
      await apiClient.patch(`/api/users/${user.id}`, { active: !user.active });
      toast.success(
        user.active
          ? t('users.deactivatedToast', { name: user.name })
          : t('users.activatedToast', { name: user.name }),
      );
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/users/${deleteTarget.id}`);
      toast.success(t('users.deletedToast', { name: deleteTarget.name }));
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('users.deleteFailedToast'));
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<UserRow, any>[] = [
    columnHelper.accessor('name', {
      header: t('users.columnName'),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('email', { header: t('users.columnEmail'), enableSorting: false }),
    columnHelper.accessor((row) => row.role.name, {
      id: 'role',
      header: t('users.columnRole'),
      enableSorting: false,
    }),
    columnHelper.accessor('active', {
      header: t('table.status'),
      cell: (info) => <ActiveBadge active={info.getValue()} />,
    }),
    columnHelper.accessor('lastLoginAt', {
      header: t('users.columnLastSignIn'),
      cell: (info) => (
        <span className="tabular-data text-muted-foreground">
          {formatLastLogin(info.getValue())}
        </span>
      ),
    }),
    createActionsColumn<UserRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('users.actionsFor', { name: row.name })}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setFormUser(row)}>
            <UserPen className="size-4" aria-hidden />
            {t('users.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void toggleActive(row)}>
            {row.active ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
            {row.active ? t('users.deactivate') : t('users.activate')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('users.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder={t('users.searchPlaceholder')}
          className="w-64"
        />
        <Button size="sm" className="ms-auto" onClick={() => setFormUser('new')}>
          <Plus className="size-4" aria-hidden />
          {t('users.newUser')}
        </Button>
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
        emptyTitle={t('users.emptyTitle')}
        emptyDescription={t('users.emptyDescription')}
      />

      <DataTablePagination
        meta={table.meta}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />

      <UserFormDialog
        open={formUser !== null}
        onOpenChange={(open) => !open && setFormUser(null)}
        user={formUser === 'new' || formUser === null ? undefined : formUser}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? t('users.deleteConfirmTitle', { name: deleteTarget.name }) : ''}
        description={t('users.deleteConfirmDescription')}
        confirmLabel={t('users.delete')}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
