'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { ProjectSelect } from '../contracts/project-select';
import { CustomerCombobox } from '../projects/customer-combobox';
import { ContractMultiSelect } from './contract-multi-select';
import type { ExtractRow, PreviewTotals } from './types';

const LINE_ITEM_TYPES = ['rent', 'transport', 'services'] as const;

type FormValues = {
  customerId: string;
  projectId: string;
  contractIds: string[];
  periodStart: string;
  periodEnd: string;
  lineItems: { type: (typeof LINE_ITEM_TYPES)[number]; description: string; amount: number }[];
  discounts?: number;
};

function defaultValues(extract: ExtractRow | null): FormValues {
  if (extract) {
    return {
      customerId: extract.customer.id,
      projectId: extract.project.id,
      contractIds: extract.contractIds,
      periodStart: extract.period.start.slice(0, 10),
      periodEnd: extract.period.end.slice(0, 10),
      lineItems: extract.lineItems.map((item) => ({
        type: item.type,
        description: item.description,
        amount: Number(item.amount),
      })),
      discounts: Number(extract.discounts),
    };
  }
  return {
    customerId: '',
    projectId: '',
    contractIds: [],
    periodStart: '',
    periodEnd: '',
    lineItems: [],
    discounts: 0,
  };
}

export interface ExtractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set — PATCHes the existing Draft/Under Review extract instead of creating one. */
  extract?: ExtractRow | null;
}

/** Section 13's `ExtractCreationWizard`/edit form: contract select → rent pre-fill → line items → live totals. */
export function ExtractFormDialog({ open, onOpenChange, extract = null }: ExtractFormDialogProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const isEdit = extract !== null;
  const formSchema = useMemo(
    () =>
      z
        .object({
          customerId: z.string().min(1, t('extracts.formChooseCustomer')),
          projectId: z.string().min(1, t('extracts.formChooseProject')),
          contractIds: z.array(z.string()).min(1, t('extracts.formContractRequired')),
          periodStart: z.string().min(1, t('extracts.formStartDateRequired')),
          periodEnd: z.string().min(1, t('extracts.formEndDateRequired')),
          lineItems: z.array(
            z.object({
              type: z.enum(LINE_ITEM_TYPES),
              description: z.string().trim().min(1, t('extracts.formDescriptionRequired')),
              amount: z.coerce.number().min(0),
            }),
          ),
          discounts: z.coerce.number().min(0).optional(),
        })
        .refine((data) => data.periodEnd >= data.periodStart, {
          message: t('extracts.formEndDateInvalid'),
          path: ['periodEnd'],
        }),
    [t],
  );
  const [totals, setTotals] = useState<PreviewTotals | null>(null);
  const [isPrefilling, setIsPrefilling] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(extract),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lineItems' });

  useEffect(() => {
    if (open) form.reset(defaultValues(extract));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extract?.id]);

  const customerId = form.watch('customerId');
  const projectId = form.watch('projectId');
  const contractIds = form.watch('contractIds');
  const lineItems = form.watch('lineItems');
  const discounts = form.watch('discounts') ?? 0;

  useEffect(() => {
    const rent = lineItems
      .filter((item) => item.type === 'rent')
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const transport = lineItems
      .filter((item) => item.type === 'transport')
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const services = lineItems
      .filter((item) => item.type === 'services')
      .reduce((sum, item) => sum + (item.amount || 0), 0);

    const handle = setTimeout(() => {
      apiClient
        .post<PreviewTotals>('/api/extracts/preview-totals', {
          rent,
          transport,
          services,
          discounts,
        })
        .then(setTotals)
        .catch(() => setTotals(null));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lineItems), discounts]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset(defaultValues(null));
      setTotals(null);
    }
    onOpenChange(next);
  }

  async function prefillRent() {
    if (contractIds.length === 0) {
      toast.error(t('extracts.selectContractFirst'));
      return;
    }
    setIsPrefilling(true);
    try {
      const results = await Promise.all(
        contractIds.map((contractId) =>
          apiClient.post<{ items: { generatorId: string; method: string; amount: string }[] }>(
            `/api/contracts/${contractId}/preview-rent`,
            { periodStart: form.getValues('periodStart'), periodEnd: form.getValues('periodEnd') },
          ),
        ),
      );
      const rentItems = results.flatMap((result) =>
        result.items.map((item) => ({
          type: 'rent' as const,
          description: t('extracts.rentLineDescription', {
            generator: item.generatorId.slice(-6),
            method: item.method,
          }),
          amount: Number(item.amount),
        })),
      );
      const nonRent = form.getValues('lineItems').filter((item) => item.type !== 'rent');
      form.setValue('lineItems', [...rentItems, ...nonRent]);
      toast.success(t('extracts.rentPrefilledToast', { count: rentItems.length }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('extracts.rentPreviewFailedToast'));
    } finally {
      setIsPrefilling(false);
    }
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      customerId: values.customerId,
      projectId: values.projectId,
      contractIds: values.contractIds,
      period: { start: values.periodStart, end: values.periodEnd },
      lineItems: values.lineItems,
      discounts: values.discounts,
    };
    try {
      if (isEdit && extract) {
        await apiClient.patch(`/api/extracts/${extract.id}`, payload);
        toast.success(t('extracts.updatedToast', { number: extract.number }));
      } else {
        const created = await apiClient.post<ExtractRow>('/api/extracts', payload);
        toast.success(t('extracts.createdToast', { number: created.number }));
      }
      await queryClient.invalidateQueries({ queryKey: ['extracts'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.genericError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('extracts.editTitle', { number: extract!.number })
              : t('extracts.newExtractTitle')}
          </DialogTitle>
          <DialogDescription>{t('extracts.formDescription')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pe-1"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('extracts.fieldCustomer')}</Label>
              <CustomerCombobox
                value={customerId}
                onSelect={(customer) => {
                  form.setValue('customerId', customer.id, { shouldValidate: true });
                  form.setValue('projectId', '');
                  form.setValue('contractIds', []);
                }}
              />
              {form.formState.errors.customerId ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.customerId.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('extracts.fieldProject')}</Label>
              <ProjectSelect
                customerId={customerId}
                value={projectId}
                onChange={(value) => {
                  form.setValue('projectId', value, { shouldValidate: true });
                  form.setValue('contractIds', []);
                }}
              />
              {form.formState.errors.projectId ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.projectId.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('extracts.fieldContracts')}</Label>
            <ContractMultiSelect
              customerId={customerId}
              projectId={projectId}
              value={contractIds}
              onChange={(value) => form.setValue('contractIds', value, { shouldValidate: true })}
            />
            {form.formState.errors.contractIds ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.contractIds.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-period-start">{t('extracts.fieldPeriodStart')}</Label>
              <Input
                id="extract-period-start"
                type="date"
                className="h-11 text-base"
                {...form.register('periodStart')}
              />
              {form.formState.errors.periodStart ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.periodStart.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-period-end">{t('extracts.fieldPeriodEnd')}</Label>
              <Input
                id="extract-period-end"
                type="date"
                className="h-11 text-base"
                {...form.register('periodEnd')}
              />
              {form.formState.errors.periodEnd ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.periodEnd.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{t('extracts.fieldLineItems')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void prefillRent()}
                disabled={isPrefilling}
              >
                <Sparkles className="size-3.5" aria-hidden />
                {t('extracts.prefillRent')}
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('extracts.noLineItems')}</p>
            ) : null}

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2">
                <div className="w-32">
                  <Label>{t('extracts.fieldType')}</Label>
                  <Select
                    value={form.watch(`lineItems.${index}.type`)}
                    onValueChange={(value) =>
                      form.setValue(
                        `lineItems.${index}.type`,
                        value as FormValues['lineItems'][number]['type'],
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_ITEM_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(
                            `extracts.type${type[0]!.toUpperCase()}${type.slice(1)}` as
                              | 'extracts.typeRent'
                              | 'extracts.typeTransport'
                              | 'extracts.typeServices',
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>{t('extracts.fieldDescription')}</Label>
                  <Input {...form.register(`lineItems.${index}.description`)} />
                </div>
                <div className="w-32">
                  <Label>{t('extracts.fieldAmount')}</Label>
                  <Input
                    type="number"
                    step="any"
                    className="tabular-data"
                    {...form.register(`lineItems.${index}.amount`)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  aria-label={t('extracts.removeLineItem')}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ type: 'services', description: '', amount: 0 })}
            >
              <Plus className="size-4" aria-hidden />
              {t('extracts.addLineItem')}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="extract-discounts">{t('extracts.fieldDiscounts')}</Label>
            <Input
              id="extract-discounts"
              type="number"
              step="any"
              className="h-11 w-48 text-base tabular-data"
              {...form.register('discounts')}
            />
          </div>

          {totals ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('extracts.totalWork')}</span>
                <span className="tabular-data">{totals.totalWork}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t('extracts.netBeforeVat')}</span>
                <span className="tabular-data">{totals.netBeforeVat}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {t('extracts.vatLabel', { rate: (totals.vatRateUsed * 100).toFixed(0) })}
                </span>
                <span className="tabular-data">{totals.vat}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground">
                <span>{t('extracts.finalTotal')}</span>
                <span className="tabular-data">{totals.finalTotal}</span>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? t('common.saveChanges') : t('extracts.saveDraft')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
