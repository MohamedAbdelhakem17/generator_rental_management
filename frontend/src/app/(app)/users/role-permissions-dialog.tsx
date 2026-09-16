'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { PERMISSION_GROUPS, PERMISSION_GROUP_LABEL_KEYS, PERMISSION_LABEL_KEYS, type PermissionKey } from '@/lib/permissions/permission-keys';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ROLES_QUERY_KEY } from './use-roles';
import type { RoleRow } from './types';

export interface RolePermissionsDialogProps {
  role: RoleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RolePermissionsDialog({ role, open, onOpenChange }: RolePermissionsDialogProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && role) setSelected(new Set(role.permissions));
  }, [open, role]);

  function toggle(key: PermissionKey, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleGroup(keys: PermissionKey[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!role) return;
    setIsSaving(true);
    try {
      await apiClient.patch(`/api/roles/${role.id}`, { permissions: Array.from(selected) });
      toast.success(t('users.permissionsUpdatedToast', { name: role.name }));
      await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('users.permissionsSaveFailedToast'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{role?.name}</DialogTitle>
          <DialogDescription>{t('users.permissionsDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pe-1">
          {PERMISSION_GROUPS.map((group) => {
            const allChecked = group.keys.every((key) => selected.has(key));
            const someChecked = group.keys.some((key) => selected.has(key));

            return (
              <div key={group.label} className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                    onCheckedChange={(checked) => toggleGroup(group.keys, Boolean(checked))}
                  />
                  {t(PERMISSION_GROUP_LABEL_KEYS[group.label])}
                </label>
                <div className="ms-6 flex flex-col gap-1.5">
                  {group.keys.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={selected.has(key)} onCheckedChange={(checked) => toggle(key, Boolean(checked))} />
                      {t(PERMISSION_LABEL_KEYS[key])}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving || selected.size === 0}>
            {t('common.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
