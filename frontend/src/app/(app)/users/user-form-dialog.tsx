'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { useQuery } from '@tanstack/react-query';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { GeneratorRow } from '../generators/types';
import type { UserRow } from './types';
import { useRolesQuery } from './use-roles';

const TECHNICIAN_ROLE_NAME = 'Technician';

type FormValues = {
  name: string;
  email: string;
  password?: string;
  role: string;
  active: boolean;
  assignedGenerators: string[];
};

export interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new user; pass an existing row to edit it. */
  user?: UserRow;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const { t } = useLocale();
  const isEdit = Boolean(user);
  const queryClient = useQueryClient();
  const { data: roles } = useRolesQuery();
  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });

  const formSchema = useMemo(() => {
    const baseSchema = z.object({
      name: z.string().trim().min(2, t('users.nameMinLength')),
      email: z.string().trim().min(1, t('users.emailRequired')).email(t('users.emailInvalid')),
      password: z.string().optional(),
      role: z.string().min(1, t('users.roleRequired')),
      active: z.boolean(),
      assignedGenerators: z.array(z.string()),
    });
    return baseSchema.superRefine((data, ctx) => {
      if (!isEdit && (!data.password || data.password.length < 8)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: t('users.passwordMinLength'),
        });
      }
    });
  }, [isEdit, t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: '',
      active: true,
      assignedGenerators: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      user
        ? {
            name: user.name,
            email: user.email,
            password: '',
            role: user.role.id,
            active: user.active,
            assignedGenerators: user.assignedGenerators.map((generator) => generator.id),
          }
        : { name: '', email: '', password: '', role: '', active: true, assignedGenerators: [] },
    );
  }, [open, user, form]);

  const selectedRoleName = roles?.items.find((role) => role.id === form.watch('role'))?.name;
  const isTechnician = selectedRoleName === TECHNICIAN_ROLE_NAME;

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit && user) {
        await apiClient.patch(`/api/users/${user.id}`, {
          name: values.name,
          email: values.email,
          role: values.role,
          active: values.active,
          assignedGenerators: values.assignedGenerators,
        });
        toast.success(t('users.updatedToast', { name: values.name }));
      } else {
        await apiClient.post('/api/users', values);
        toast.success(t('users.createdToast', { name: values.name }));
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('users.editUserTitle') : t('users.newUserTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('users.editUserDescription') : t('users.newUserDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">{t('users.fieldName')}</Label>
            <Input id="user-name" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">{t('users.fieldEmail')}</Label>
            <Input id="user-email" type="email" {...form.register('email')} />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-password">{t('users.fieldPassword')}</Label>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-role">{t('users.fieldRole')}</Label>
            <Select
              value={form.watch('role')}
              onValueChange={(value) => form.setValue('role', value, { shouldValidate: true })}
            >
              <SelectTrigger id="user-role">
                <SelectValue placeholder={t('users.chooseRolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {roles?.items.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.role ? (
              <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>
            ) : null}
          </div>

          {isTechnician ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t('users.assignedGenerators')}</Label>
              <p className="text-xs text-muted-foreground">{t('users.assignedGeneratorsHelp')}</p>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-border p-2.5">
                {generators?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('users.noGenerators')}</p>
                ) : (
                  generators?.items.map((generator) => {
                    const assigned = form.watch('assignedGenerators');
                    const checked = assigned.includes(generator.id);
                    return (
                      <label
                        key={generator.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            form.setValue(
                              'assignedGenerators',
                              next
                                ? [...assigned, generator.id]
                                : assigned.filter((id) => id !== generator.id),
                            )
                          }
                        />
                        {generator.code}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={form.watch('active')}
              onCheckedChange={(checked) => form.setValue('active', Boolean(checked))}
            />
            {t('users.activeCanSignIn')}
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? t('common.saveChanges') : t('users.createUser')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
