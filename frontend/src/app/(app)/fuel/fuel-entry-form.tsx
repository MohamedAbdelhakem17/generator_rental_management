'use client';

import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
import { GeneratorSelect } from '../contracts/generator-select';
import { ProjectSelect } from '../operations/project-select';
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const formSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  projectId: z.string().min(1, 'Choose a project'),
  generatorId: z.string().min(1, 'Choose a generator'),
  liters: z.coerce.number().positive('Enter a positive amount'),
  pricePerLiter: z.coerce.number().positive('Enter a positive price'),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(): FormValues {
  return { date: today(), projectId: '', generatorId: '', liters: 0, pricePerLiter: 0 };
}

export interface FuelEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FuelEntryForm({ open, onOpenChange }: FuelEntryFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(),
  });

  function handleOpenChange(next: boolean) {
    if (!next) form.reset(defaultValues());
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    try {
      await apiClient.post('/api/fuel', values);
      toast.success(`Logged ${values.liters}L fill-up`);
      await queryClient.invalidateQueries({ queryKey: ['fuel'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  const liters = form.watch('liters');
  const pricePerLiter = form.watch('pricePerLiter');
  const totalCost = liters > 0 && pricePerLiter > 0 ? (liters * pricePerLiter).toFixed(2) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New fuel entry</DialogTitle>
          <DialogDescription>Total cost is computed automatically from liters × price per liter.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fuel-date">Date</Label>
            <Input id="fuel-date" type="date" className="h-11 text-base" {...form.register('date')} />
            {form.formState.errors.date ? <p className="text-xs text-destructive">{form.formState.errors.date.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Project</Label>
            <ProjectSelect value={form.watch('projectId')} onChange={(value) => form.setValue('projectId', value, { shouldValidate: true })} />
            {form.formState.errors.projectId ? (
              <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Generator</Label>
            <GeneratorSelect value={form.watch('generatorId')} onChange={(value) => form.setValue('generatorId', value, { shouldValidate: true })} />
            {form.formState.errors.generatorId ? (
              <p className="text-xs text-destructive">{form.formState.errors.generatorId.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fuel-liters">Liters</Label>
              <Input id="fuel-liters" type="number" inputMode="decimal" step="any" className="h-11 text-base tabular-data" {...form.register('liters')} />
              {form.formState.errors.liters ? <p className="text-xs text-destructive">{form.formState.errors.liters.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fuel-price">Price / liter</Label>
              <Input id="fuel-price" type="number" inputMode="decimal" step="any" className="h-11 text-base tabular-data" {...form.register('pricePerLiter')} />
              {form.formState.errors.pricePerLiter ? (
                <p className="text-xs text-destructive">{form.formState.errors.pricePerLiter.message}</p>
              ) : null}
            </div>
          </div>

          {totalCost ? (
            <p className="text-sm text-muted-foreground">
              Total cost: <span className="tabular-data font-medium text-foreground">{totalCost}</span>
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
