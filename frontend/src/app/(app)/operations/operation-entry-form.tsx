'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
import type { GeneratorRow } from '../generators/types';
import { GeneratorSelect } from '../contracts/generator-select';
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
import { Textarea } from '@/components/ui/textarea';
import { ProjectSelect } from './project-select';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const formSchema = z
  .object({
    date: z.string().min(1, 'Date is required'),
    projectId: z.string().min(1, 'Choose a project'),
    generatorId: z.string().min(1, 'Choose a generator'),
    startMeter: z.coerce.number().min(0),
    endMeter: z.coerce.number().min(0, 'End meter is required'),
    downtimeHours: z.coerce.number().min(0).max(24, 'Cannot exceed 24 hours').optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.endMeter >= data.startMeter, {
    message: 'End meter cannot be less than the start meter',
    path: ['endMeter'],
  });

type FormValues = z.infer<typeof formSchema>;

function defaultValues(): FormValues {
  return { date: today(), projectId: '', generatorId: '', startMeter: 0, endMeter: 0, downtimeHours: 0, notes: '' };
}

export interface OperationEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Section 18: unlike other create dialogs in this app, this one stays open and resets after
 * a successful submit — Technicians log many generators back-to-back in one sitting.
 */
export function OperationEntryForm({ open, onOpenChange }: OperationEntryFormProps) {
  const queryClient = useQueryClient();
  const [generatorLabel, setGeneratorLabel] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(),
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset(defaultValues());
      setGeneratorLabel(null);
    }
    onOpenChange(next);
  }

  async function handleGeneratorChange(generatorId: string) {
    form.setValue('generatorId', generatorId, { shouldValidate: true });
    try {
      const generator = await apiClient.get<GeneratorRow>(`/api/generators/${generatorId}`);
      form.setValue('startMeter', generator.currentMeter);
      setGeneratorLabel(generator.code);
    } catch {
      // Best-effort prefill — the field still accepts manual entry if this fails.
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      await apiClient.post('/api/operations', values);
      toast.success(`Logged ${generatorLabel ?? 'entry'} — ${values.endMeter - values.startMeter}h`);
      await queryClient.invalidateQueries({ queryKey: ['operations'] });
      // Section 18: reset for the next generator, but keep date/project for rapid re-entry.
      form.reset({ ...defaultValues(), date: values.date, projectId: values.projectId });
      setGeneratorLabel(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New operation entry</DialogTitle>
          <DialogDescription>Stays open after each save so you can log the next generator right away.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-date">Date</Label>
            <Input id="op-date" type="date" className="h-11 text-base" {...form.register('date')} />
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
            <GeneratorSelect value={form.watch('generatorId')} onChange={(value) => void handleGeneratorChange(value)} />
            {form.formState.errors.generatorId ? (
              <p className="text-xs text-destructive">{form.formState.errors.generatorId.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-start-meter">Start meter</Label>
              <Input
                id="op-start-meter"
                type="number"
                inputMode="decimal"
                disabled
                className="h-11 text-base tabular-data"
                {...form.register('startMeter')}
              />
              <p className="text-xs text-muted-foreground">Pre-filled from the generator&apos;s current reading.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-end-meter">End meter</Label>
              <Input id="op-end-meter" type="number" inputMode="decimal" className="h-11 text-base tabular-data" autoFocus {...form.register('endMeter')} />
              {form.formState.errors.endMeter ? (
                <p className="text-xs text-destructive">{form.formState.errors.endMeter.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  If this is lower than the start meter, ask a manager for a correction instead of resubmitting.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-downtime">Downtime (hours)</Label>
            <Input id="op-downtime" type="number" inputMode="decimal" className="h-11 text-base tabular-data" {...form.register('downtimeHours')} />
            {form.formState.errors.downtimeHours ? (
              <p className="text-xs text-destructive">{form.formState.errors.downtimeHours.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-notes">Notes</Label>
            <Textarea id="op-notes" rows={2} {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
            <Button type="submit" size="lg" className="h-11 flex-1 text-base" disabled={form.formState.isSubmitting}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
