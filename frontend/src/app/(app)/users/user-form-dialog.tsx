'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRolesQuery } from './use-roles';
import type { UserRow } from './types';

const baseSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().optional(),
  role: z.string().min(1, 'Choose a role'),
  active: z.boolean(),
});

/** Password is required on create only — one schema shape so the form's type stays stable across modes. */
function buildSchema(isEdit: boolean) {
  return baseSchema.superRefine((data, ctx) => {
    if (!isEdit && (!data.password || data.password.length < 8)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password must be at least 8 characters' });
    }
  });
}

type FormValues = z.infer<typeof baseSchema>;

export interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new user; pass an existing row to edit it. */
  user?: UserRow;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const isEdit = Boolean(user);
  const queryClient = useQueryClient();
  const { data: roles } = useRolesQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(buildSchema(isEdit)),
    defaultValues: { name: '', email: '', password: '', role: '', active: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      user
        ? { name: user.name, email: user.email, password: '', role: user.role.id, active: user.active }
        : { name: '', email: '', password: '', role: '', active: true },
    );
  }, [open, user, form]);

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit && user) {
        await apiClient.patch(`/api/users/${user.id}`, {
          name: values.name,
          email: values.email,
          role: values.role,
          active: values.active,
        });
        toast.success(`Updated ${values.name}`);
      } else {
        await apiClient.post('/api/users', values);
        toast.success(`Created ${values.name}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'New user'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update their details, role, or access.' : 'They can sign in with this email and password right away.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">Name</Label>
            <Input id="user-name" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" {...form.register('email')} />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-password">Password</Label>
              <Input id="user-password" type="password" autoComplete="new-password" {...form.register('password')} />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-role">Role</Label>
            <Select value={form.watch('role')} onValueChange={(value) => form.setValue('role', value, { shouldValidate: true })}>
              <SelectTrigger id="user-role">
                <SelectValue placeholder="Choose a role" />
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

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={form.watch('active')}
              onCheckedChange={(checked) => form.setValue('active', Boolean(checked))}
            />
            Active — can sign in
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
