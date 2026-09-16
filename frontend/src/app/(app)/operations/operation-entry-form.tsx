'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
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

type FormValues = {
  date: string;
  projectId: string;
  generatorId: string;
  startMeter: number;
  endMeter: number;
  downtimeHours?: number;
  notes?: string;
};

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
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [generatorLabel, setGeneratorLabel] = useState<string | null>(null);

  const formSchema = useMemo(
    () =>
      z
        .object({
          date: z.string().min(1, t('operations.formDateRequired')),
          projectId: z.string().min(1, t('operations.formChooseProject')),
          generatorId: z.string().min(1, t('operations.formChooseGenerator')),
          startMeter: z.coerce.number().min(0),
          endMeter: z.coerce.number().min(0, t('operations.formEndMeterRequired')),
          downtimeHours: z.coerce.number().min(0).max(24, t('operations.formDowntimeMax')).optional(),
          notes: z.string().trim().max(500).optional(),
        })
        .refine((data) => data.endMeter >= data.startMeter, {
          message: t('operations.formEndMeterInvalid'),
          path: ['endMeter'],
        }),
    [t],
  );

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
      toast.success(
        t('operations.loggedToast', {
          label: generatorLabel ?? t('operations.entryFallback'),
          hours: values.endMeter - values.startMeter,
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ['operations'] });
      // Section 18: reset for the next generator, but keep date/project for rapid re-entry.
      form.reset({ ...defaultValues(), date: values.date, projectId: values.projectId });
      setGeneratorLabel(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('operations.newEntryTitle')}</DialogTitle>
          <DialogDescription>{t('operations.newEntryDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-date">{t('operations.fieldDate')}</Label>
            <Input id="op-date" type="date" className="h-11 text-base" {...form.register('date')} />
            {form.formState.errors.date ? <p className="text-xs text-destructive">{form.formState.errors.date.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('operations.fieldProject')}</Label>
            <ProjectSelect value={form.watch('projectId')} onChange={(value) => form.setValue('projectId', value, { shouldValidate: true })} />
            {form.formState.errors.projectId ? (
              <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('operations.fieldGenerator')}</Label>
            <GeneratorSelect value={form.watch('generatorId')} onChange={(value) => void handleGeneratorChange(value)} />
            {form.formState.errors.generatorId ? (
              <p className="text-xs text-destructive">{form.formState.errors.generatorId.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-start-meter">{t('operations.fieldStartMeter')}</Label>
              <Input
                id="op-start-meter"
                type="number"
                inputMode="decimal"
                disabled
                className="h-11 text-base tabular-data"
                {...form.register('startMeter')}
              />
              <p className="text-xs text-muted-foreground">{t('operations.startMeterHelp')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-end-meter">{t('operations.fieldEndMeter')}</Label>
              <Input id="op-end-meter" type="number" inputMode="decimal" className="h-11 text-base tabular-data" autoFocus {...form.register('endMeter')} />
              {form.formState.errors.endMeter ? (
                <p className="text-xs text-destructive">{form.formState.errors.endMeter.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('operations.endMeterHelp')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-downtime">{t('operations.fieldDowntimeHours')}</Label>
            <Input id="op-downtime" type="number" inputMode="decimal" className="h-11 text-base tabular-data" {...form.register('downtimeHours')} />
            {form.formState.errors.downtimeHours ? (
              <p className="text-xs text-destructive">{form.formState.errors.downtimeHours.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-notes">{t('operations.fieldNotes')}</Label>
            <Textarea id="op-notes" rows={2} {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('operations.done')}
            </Button>
            <Button type="submit" size="lg" className="h-11 flex-1 text-base" disabled={form.formState.isSubmitting}>
              {t('operations.saveEntryButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
