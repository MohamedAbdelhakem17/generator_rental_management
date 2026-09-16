'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { Button } from '@/components/ui/button';
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
import { CustomerCombobox } from './customer-combobox';
import type { ProjectRow } from './types';

type FormValues = {
  code: string;
  name: string;
  customerId: string;
  location?: string;
  siteManager?: string;
  startDate: string;
  endDate?: string;
};

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

const DEFAULT_VALUES: FormValues = {
  code: '',
  name: '',
  customerId: '',
  location: '',
  siteManager: '',
  startDate: '',
  endDate: '',
};

export interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new project; pass an existing row to edit it (customer is fixed). */
  project?: ProjectRow;
}

export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  const { t } = useLocale();
  const isEdit = Boolean(project);
  const queryClient = useQueryClient();
  const [customerLabel, setCustomerLabel] = useState<string | null>(null);

  const formSchema = useMemo(
    () =>
      z
        .object({
          code: z.string().trim().min(1, t('projects.formCodeRequired')).max(30),
          name: z.string().trim().min(1, t('projects.formNameRequired')).max(150),
          customerId: z.string().min(1, t('projects.formChooseCustomer')),
          location: z.string().trim().max(200).optional(),
          siteManager: z.string().trim().max(100).optional(),
          startDate: z.string().min(1, t('projects.formStartDateRequired')),
          endDate: z.string().optional(),
        })
        .refine((data) => !data.endDate || data.endDate >= data.startDate, {
          message: t('projects.formEndDateInvalid'),
          path: ['endDate'],
        }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (project) {
      form.reset({
        code: project.code,
        name: project.name,
        customerId: project.customer.id,
        location: project.location,
        siteManager: project.siteManager,
        startDate: toDateInputValue(project.startDate),
        endDate: project.endDate ? toDateInputValue(project.endDate) : '',
      });
      setCustomerLabel(`${project.customer.code} — ${project.customer.companyName}`);
    } else {
      form.reset(DEFAULT_VALUES);
      setCustomerLabel(null);
    }
  }, [open, project, form]);

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit && project) {
        await apiClient.patch(`/api/projects/${project.id}`, {
          name: values.name,
          location: values.location,
          siteManager: values.siteManager,
          startDate: values.startDate,
          endDate: values.endDate || null,
        });
        toast.success(t('projects.updatedToast', { name: values.name }));
      } else {
        await apiClient.post('/api/projects', {
          code: values.code,
          name: values.name,
          customerId: values.customerId,
          location: values.location,
          siteManager: values.siteManager,
          startDate: values.startDate,
          endDate: values.endDate || undefined,
        });
        toast.success(t('projects.addedToast', { name: values.name }));
      }
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field && fieldError.field in form.getValues()) {
            form.setError(fieldError.field as keyof FormValues, { message: fieldError.message });
          }
        }
      }
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('projects.editTitle', { name: project?.name ?? '' }) : t('projects.addTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('projects.editDescription') : t('projects.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proj-code">{t('projects.fieldCode')}</Label>
              <Input id="proj-code" disabled={isEdit} {...form.register('code')} />
              {form.formState.errors.code ? <p className="text-xs text-destructive">{form.formState.errors.code.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proj-name">{t('projects.fieldName')}</Label>
              <Input id="proj-name" {...form.register('name')} />
              {form.formState.errors.name ? <p className="text-xs text-destructive">{form.formState.errors.name.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.fieldCustomer')}</Label>
            {isEdit ? (
              <Input disabled value={customerLabel ?? ''} />
            ) : (
              <CustomerCombobox
                value={form.watch('customerId')}
                onSelect={(customer) => {
                  form.setValue('customerId', customer.id, { shouldValidate: true });
                  setCustomerLabel(`${customer.code} — ${customer.companyName}`);
                }}
              />
            )}
            {form.formState.errors.customerId ? (
              <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proj-location">{t('projects.fieldLocation')}</Label>
              <Input id="proj-location" {...form.register('location')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proj-site-manager">{t('projects.fieldSiteManager')}</Label>
              <Input id="proj-site-manager" {...form.register('siteManager')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proj-start">{t('projects.fieldStartDate')}</Label>
              <Input id="proj-start" type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate ? (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proj-end">{t('projects.fieldEndDate')}</Label>
              <Input id="proj-end" type="date" {...form.register('endDate')} />
              {form.formState.errors.endDate ? (
                <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? t('common.saveChanges') : t('projects.addButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
