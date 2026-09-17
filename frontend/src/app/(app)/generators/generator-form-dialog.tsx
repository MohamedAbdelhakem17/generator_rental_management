'use client';

import { useEffect, useMemo } from 'react';
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
import type { GeneratorRow } from './types';

type FormValues = {
  kva: number;
  brand: string;
  model: string;
  serialNumber: string;
  location?: string;
  normalFuelConsumption: number;
  maintenanceCycleHours: number;
};

const DEFAULT_VALUES: FormValues = {
  kva: 0,
  brand: '',
  model: '',
  serialNumber: '',
  location: '',
  normalFuelConsumption: 0,
  maintenanceCycleHours: 250,
};

export interface GeneratorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to register a new generator; pass an existing row to edit its specs/location/thresholds. */
  generator?: GeneratorRow;
}

export function GeneratorFormDialog({ open, onOpenChange, generator }: GeneratorFormDialogProps) {
  const { t } = useLocale();
  const isEdit = Boolean(generator);
  const queryClient = useQueryClient();

  const formSchema = useMemo(
    () =>
      z.object({
        kva: z.coerce.number().positive(t('common.enterPositiveNumber')),
        brand: z.string().trim().min(1, t('generators.formBrandRequired')).max(50),
        model: z.string().trim().min(1, t('generators.formModelRequired')).max(50),
        serialNumber: z.string().trim().min(1, t('generators.formSerialRequired')),
        location: z.string().trim().max(200).optional(),
        normalFuelConsumption: z.coerce.number().positive(t('common.enterPositiveNumber')),
        maintenanceCycleHours: z.coerce.number().positive(t('common.enterPositiveNumber')),
      }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      generator
        ? {
            kva: generator.specifications.kva,
            brand: generator.specifications.brand,
            model: generator.specifications.model,
            serialNumber: generator.specifications.serialNumber,
            location: generator.location,
            normalFuelConsumption: generator.normalFuelConsumption,
            maintenanceCycleHours: generator.maintenanceCycleHours,
          }
        : DEFAULT_VALUES,
    );
  }, [open, generator, form]);

  async function onSubmit(values: FormValues) {
    const specifications = { kva: values.kva, brand: values.brand, model: values.model, serialNumber: values.serialNumber };

    try {
      if (isEdit && generator) {
        await apiClient.patch(`/api/generators/${generator.id}`, {
          specifications,
          location: values.location,
          normalFuelConsumption: values.normalFuelConsumption,
          maintenanceCycleHours: values.maintenanceCycleHours,
        });
        toast.success(t('generators.updatedToast', { code: generator.code }));
      } else {
        const created = await apiClient.post<{ code: string }>('/api/generators', {
          specifications,
          location: values.location,
          normalFuelConsumption: values.normalFuelConsumption,
          maintenanceCycleHours: values.maintenanceCycleHours,
        });
        toast.success(t('generators.registeredToast', { code: created.code }));
      }
      await queryClient.invalidateQueries({ queryKey: ['generators'] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === 'specifications.serialNumber') form.setError('serialNumber', { message: fieldError.message });
        }
      }
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('generators.editTitle', { code: generator?.code ?? '' }) : t('generators.registerTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('generators.editDescription') : t('generators.registerDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-brand">{t('generators.fieldBrand')}</Label>
              <Input id="gen-brand" {...form.register('brand')} />
              {form.formState.errors.brand ? <p className="text-xs text-destructive">{form.formState.errors.brand.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-model">{t('generators.fieldModel')}</Label>
              <Input id="gen-model" {...form.register('model')} />
              {form.formState.errors.model ? <p className="text-xs text-destructive">{form.formState.errors.model.message}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-kva">{t('generators.fieldKva')}</Label>
              <Input id="gen-kva" type="number" step="any" {...form.register('kva')} />
              {form.formState.errors.kva ? <p className="text-xs text-destructive">{form.formState.errors.kva.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gen-serial">{t('generators.fieldSerial')}</Label>
            <Input id="gen-serial" {...form.register('serialNumber')} />
            {form.formState.errors.serialNumber ? (
              <p className="text-xs text-destructive">{form.formState.errors.serialNumber.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gen-location">{t('generators.fieldLocation')}</Label>
            <Input id="gen-location" placeholder={t('generators.fieldLocationPlaceholder')} {...form.register('location')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-fuel">{t('generators.fieldFuel')}</Label>
              <Input id="gen-fuel" type="number" step="any" {...form.register('normalFuelConsumption')} />
              {form.formState.errors.normalFuelConsumption ? (
                <p className="text-xs text-destructive">{form.formState.errors.normalFuelConsumption.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-cycle">{t('generators.fieldCycle')}</Label>
              <Input id="gen-cycle" type="number" step="any" {...form.register('maintenanceCycleHours')} />
              {form.formState.errors.maintenanceCycleHours ? (
                <p className="text-xs text-destructive">{form.formState.errors.maintenanceCycleHours.message}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? t('common.saveChanges') : t('generators.saveButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
