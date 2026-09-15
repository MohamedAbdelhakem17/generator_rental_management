'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
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

const formSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters')
    .max(20)
    .regex(/^[a-zA-Z0-9-]+$/, 'Letters, numbers, and dashes only'),
  kva: z.coerce.number().positive('Enter a positive number'),
  brand: z.string().trim().min(1, 'Brand is required').max(50),
  model: z.string().trim().min(1, 'Model is required').max(50),
  serialNumber: z.string().trim().min(1, 'Serial number is required'),
  location: z.string().trim().max(200).optional(),
  normalFuelConsumption: z.coerce.number().positive('Enter a positive number'),
  maintenanceCycleHours: z.coerce.number().positive('Enter a positive number'),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  code: '',
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
  const isEdit = Boolean(generator);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      generator
        ? {
            code: generator.code,
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
        toast.success(`Updated ${values.code}`);
      } else {
        await apiClient.post('/api/generators', {
          code: values.code,
          specifications,
          location: values.location,
          normalFuelConsumption: values.normalFuelConsumption,
          maintenanceCycleHours: values.maintenanceCycleHours,
        });
        toast.success(`Registered ${values.code}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['generators'] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === 'specifications.serialNumber') form.setError('serialNumber', { message: fieldError.message });
        }
      }
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${generator?.code}` : 'Register a generator'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Specifications, location, and thresholds only — the meter updates from operation logs.'
              : 'It starts out Available with a zero meter reading.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-code">Code</Label>
              <Input id="gen-code" disabled={isEdit} {...form.register('code')} />
              {form.formState.errors.code ? <p className="text-xs text-destructive">{form.formState.errors.code.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-kva">kVA</Label>
              <Input id="gen-kva" type="number" step="any" {...form.register('kva')} />
              {form.formState.errors.kva ? <p className="text-xs text-destructive">{form.formState.errors.kva.message}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-brand">Brand</Label>
              <Input id="gen-brand" {...form.register('brand')} />
              {form.formState.errors.brand ? <p className="text-xs text-destructive">{form.formState.errors.brand.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-model">Model</Label>
              <Input id="gen-model" {...form.register('model')} />
              {form.formState.errors.model ? <p className="text-xs text-destructive">{form.formState.errors.model.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gen-serial">Serial number</Label>
            <Input id="gen-serial" {...form.register('serialNumber')} />
            {form.formState.errors.serialNumber ? (
              <p className="text-xs text-destructive">{form.formState.errors.serialNumber.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gen-location">Location</Label>
            <Input id="gen-location" placeholder="e.g. Warehouse A" {...form.register('location')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-fuel">Normal fuel use (L/h)</Label>
              <Input id="gen-fuel" type="number" step="any" {...form.register('normalFuelConsumption')} />
              {form.formState.errors.normalFuelConsumption ? (
                <p className="text-xs text-destructive">{form.formState.errors.normalFuelConsumption.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-cycle">Maintenance cycle (h)</Label>
              <Input id="gen-cycle" type="number" step="any" {...form.register('maintenanceCycleHours')} />
              {form.formState.errors.maintenanceCycleHours ? (
                <p className="text-xs text-destructive">{form.formState.errors.maintenanceCycleHours.message}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? 'Save changes' : 'Register generator'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
