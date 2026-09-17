'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { AttachmentsPanel } from '@/components/shared/attachments-panel';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { GeneratorSelect } from '../contracts/generator-select';
import type { MaintenanceRow } from './types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormValues = {
  generatorId: string;
  type: 'Preventive' | 'Corrective';
  date: string;
  meter: number;
  partsCost?: number;
  oilCost?: number;
  laborCost?: number;
  transportCost?: number;
  maintenanceCycleOverride?: number;
  notes?: string;
};

function defaultValues(record: MaintenanceRow | null): FormValues {
  if (record) {
    return {
      generatorId: record.generator.id,
      type: record.type,
      date: record.date.slice(0, 10),
      meter: record.meter,
      partsCost: Number(record.partsCost),
      oilCost: Number(record.oilCost),
      laborCost: Number(record.laborCost),
      transportCost: Number(record.transportCost),
      maintenanceCycleOverride: record.maintenanceCycleOverride ?? undefined,
      notes: record.notes,
    };
  }
  return {
    generatorId: '',
    type: 'Preventive',
    date: today(),
    meter: 0,
    partsCost: 0,
    oilCost: 0,
    laborCost: 0,
    transportCost: 0,
    notes: '',
  };
}

export interface MaintenanceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set — generator/type/date/meter are fixed at open time; only costs/notes/cycle are editable. */
  record?: MaintenanceRow | null;
}

/** Section 13/15: cost fields update a live-computed total as the user types. */
export function MaintenanceFormDialog({
  open,
  onOpenChange,
  record = null,
}: MaintenanceFormDialogProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const isEdit = record !== null;
  const formSchema = useMemo(
    () =>
      z.object({
        generatorId: z.string().min(1, t('maintenance.formChooseGenerator')),
        type: z.enum(['Preventive', 'Corrective']),
        date: z.string().min(1, t('maintenance.formDateRequired')),
        meter: z.coerce.number().min(0, t('maintenance.formMeterRequired')),
        partsCost: z.coerce.number().min(0).optional(),
        oilCost: z.coerce.number().min(0).optional(),
        laborCost: z.coerce.number().min(0).optional(),
        transportCost: z.coerce.number().min(0).optional(),
        maintenanceCycleOverride: z.coerce.number().positive().optional(),
        notes: z.string().trim().max(500).optional(),
      }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(record),
  });

  useEffect(() => {
    if (open) form.reset(defaultValues(record));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) form.reset(defaultValues(null));
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit && record) {
        await apiClient.patch(`/api/maintenance/${record.id}`, {
          partsCost: values.partsCost,
          oilCost: values.oilCost,
          laborCost: values.laborCost,
          transportCost: values.transportCost,
          maintenanceCycleOverride: values.maintenanceCycleOverride ?? null,
          notes: values.notes,
        });
        toast.success(t('maintenance.updatedToast', { code: record.generator.code }));
      } else {
        await apiClient.post('/api/maintenance', values);
        toast.success(t('maintenance.openedToast'));
      }
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  const partsCost = form.watch('partsCost') ?? 0;
  const oilCost = form.watch('oilCost') ?? 0;
  const laborCost = form.watch('laborCost') ?? 0;
  const transportCost = form.watch('transportCost') ?? 0;
  const totalCost = (partsCost + oilCost + laborCost + transportCost).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('maintenance.editTitle', { code: record!.generator.code })
              : t('maintenance.openTitle')}
          </DialogTitle>
          <DialogDescription>{t('maintenance.formDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {isEdit ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {t(
                `maintenance.type${record!.type}` as
                  'maintenance.typePreventive' | 'maintenance.typeCorrective',
              )}{' '}
              · {t('maintenance.meterSummary', { meter: record!.meter })} ·{' '}
              {new Date(record!.date).toLocaleDateString()}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{t('maintenance.fieldGenerator')}</Label>
                <GeneratorSelect
                  value={form.watch('generatorId')}
                  onChange={(value) =>
                    form.setValue('generatorId', value, { shouldValidate: true })
                  }
                />
                {form.formState.errors.generatorId ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.generatorId.message}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('maintenance.fieldType')}</Label>
                  <Select
                    value={form.watch('type')}
                    onValueChange={(value) => form.setValue('type', value as FormValues['type'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Preventive">{t('maintenance.typePreventive')}</SelectItem>
                      <SelectItem value="Corrective">{t('maintenance.typeCorrective')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="maint-date">{t('maintenance.fieldDate')}</Label>
                  <Input
                    id="maint-date"
                    type="date"
                    className="h-11 text-base"
                    {...form.register('date')}
                  />
                  {form.formState.errors.date ? (
                    <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maint-meter">{t('maintenance.fieldMeter')}</Label>
                <Input
                  id="maint-meter"
                  type="number"
                  inputMode="decimal"
                  className="h-11 text-base tabular-data"
                  {...form.register('meter')}
                />
                {form.formState.errors.meter ? (
                  <p className="text-xs text-destructive">{form.formState.errors.meter.message}</p>
                ) : null}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maint-parts">{t('maintenance.fieldParts')}</Label>
              <Input
                id="maint-parts"
                type="number"
                inputMode="decimal"
                step="any"
                className="h-11 text-base tabular-data"
                {...form.register('partsCost')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maint-oil">{t('maintenance.fieldOil')}</Label>
              <Input
                id="maint-oil"
                type="number"
                inputMode="decimal"
                step="any"
                className="h-11 text-base tabular-data"
                {...form.register('oilCost')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maint-labor">{t('maintenance.fieldLabor')}</Label>
              <Input
                id="maint-labor"
                type="number"
                inputMode="decimal"
                step="any"
                className="h-11 text-base tabular-data"
                {...form.register('laborCost')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maint-transport">{t('maintenance.fieldTransport')}</Label>
              <Input
                id="maint-transport"
                type="number"
                inputMode="decimal"
                step="any"
                className="h-11 text-base tabular-data"
                {...form.register('transportCost')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maint-cycle-override">{t('maintenance.fieldCycleOverride')}</Label>
            <Input
              id="maint-cycle-override"
              type="number"
              inputMode="decimal"
              className="h-11 text-base tabular-data"
              {...form.register('maintenanceCycleOverride')}
            />
            <p className="text-xs text-muted-foreground">{t('maintenance.cycleOverrideHelp')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maint-notes">{t('maintenance.fieldNotes')}</Label>
            <Textarea id="maint-notes" rows={2} {...form.register('notes')} />
          </div>

          <p className="text-sm text-muted-foreground">
            {t('maintenance.totalCostLabel')}:{' '}
            <span className="tabular-data font-medium text-foreground">{totalCost}</span>
          </p>

          {isEdit && record ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t('attachments.title')}</Label>
              <AttachmentsPanel entityType="Maintenance" entityId={record.id} canWrite />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? t('common.saveChanges') : t('maintenance.openButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
