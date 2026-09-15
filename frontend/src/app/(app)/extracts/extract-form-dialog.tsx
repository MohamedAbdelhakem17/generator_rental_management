'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerCombobox } from '../projects/customer-combobox';
import { ProjectSelect } from '../contracts/project-select';
import { ContractMultiSelect } from './contract-multi-select';
import type { ExtractRow, PreviewTotals } from './types';

const LINE_ITEM_TYPES = ['rent', 'transport', 'services'] as const;

const formSchema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    projectId: z.string().min(1, 'Choose a project'),
    contractIds: z.array(z.string()).min(1, 'At least one contract is required'),
    periodStart: z.string().min(1, 'Start date is required'),
    periodEnd: z.string().min(1, 'End date is required'),
    lineItems: z.array(
      z.object({
        type: z.enum(LINE_ITEM_TYPES),
        description: z.string().trim().min(1, 'A description is required'),
        amount: z.coerce.number().min(0),
      }),
    ),
    discounts: z.coerce.number().min(0).optional(),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: 'End date must be on or after the start date',
    path: ['periodEnd'],
  });

type FormValues = z.infer<typeof formSchema>;

function defaultValues(extract: ExtractRow | null): FormValues {
  if (extract) {
    return {
      customerId: extract.customer.id,
      projectId: extract.project.id,
      contractIds: extract.contractIds,
      periodStart: extract.period.start.slice(0, 10),
      periodEnd: extract.period.end.slice(0, 10),
      lineItems: extract.lineItems.map((item) => ({ type: item.type, description: item.description, amount: Number(item.amount) })),
      discounts: Number(extract.discounts),
    };
  }
  return { customerId: '', projectId: '', contractIds: [], periodStart: '', periodEnd: '', lineItems: [], discounts: 0 };
}

export interface ExtractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set — PATCHes the existing Draft/Under Review extract instead of creating one. */
  extract?: ExtractRow | null;
}

/** Section 13's `ExtractCreationWizard`/edit form: contract select → rent pre-fill → line items → live totals. */
export function ExtractFormDialog({ open, onOpenChange, extract = null }: ExtractFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = extract !== null;
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
    const rent = lineItems.filter((item) => item.type === 'rent').reduce((sum, item) => sum + (item.amount || 0), 0);
    const transport = lineItems.filter((item) => item.type === 'transport').reduce((sum, item) => sum + (item.amount || 0), 0);
    const services = lineItems.filter((item) => item.type === 'services').reduce((sum, item) => sum + (item.amount || 0), 0);

    const handle = setTimeout(() => {
      apiClient
        .post<PreviewTotals>('/api/extracts/preview-totals', { rent, transport, services, discounts })
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
      toast.error('Select at least one contract first');
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
          description: `Rent — generator ${item.generatorId.slice(-6)} (${item.method})`,
          amount: Number(item.amount),
        })),
      );
      const nonRent = form.getValues('lineItems').filter((item) => item.type !== 'rent');
      form.setValue('lineItems', [...rentItems, ...nonRent]);
      toast.success(`Pre-filled ${rentItems.length} rent line item(s)`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't calculate rent for these contracts.");
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
        toast.success(`${extract.number} updated`);
      } else {
        const created = await apiClient.post<ExtractRow>('/api/extracts', payload);
        toast.success(`${created.number} saved as Draft`);
      }
      await queryClient.invalidateQueries({ queryKey: ['extracts'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${extract!.number}` : 'New extract'}</DialogTitle>
          <DialogDescription>Totals are computed by the Financial Calculation Engine — never re-derived here.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pe-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Customer</Label>
              <CustomerCombobox
                value={customerId}
                onSelect={(customer) => {
                  form.setValue('customerId', customer.id, { shouldValidate: true });
                  form.setValue('projectId', '');
                  form.setValue('contractIds', []);
                }}
              />
              {form.formState.errors.customerId ? (
                <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Project</Label>
              <ProjectSelect
                customerId={customerId}
                value={projectId}
                onChange={(value) => {
                  form.setValue('projectId', value, { shouldValidate: true });
                  form.setValue('contractIds', []);
                }}
              />
              {form.formState.errors.projectId ? (
                <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Contracts</Label>
            <ContractMultiSelect
              customerId={customerId}
              projectId={projectId}
              value={contractIds}
              onChange={(value) => form.setValue('contractIds', value, { shouldValidate: true })}
            />
            {form.formState.errors.contractIds ? (
              <p className="text-xs text-destructive">{form.formState.errors.contractIds.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-period-start">Period start</Label>
              <Input id="extract-period-start" type="date" className="h-11 text-base" {...form.register('periodStart')} />
              {form.formState.errors.periodStart ? (
                <p className="text-xs text-destructive">{form.formState.errors.periodStart.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-period-end">Period end</Label>
              <Input id="extract-period-end" type="date" className="h-11 text-base" {...form.register('periodEnd')} />
              {form.formState.errors.periodEnd ? (
                <p className="text-xs text-destructive">{form.formState.errors.periodEnd.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => void prefillRent()} disabled={isPrefilling}>
                <Sparkles className="size-3.5" aria-hidden />
                Pre-fill rent from contracts
              </Button>
            </div>

            {fields.length === 0 ? <p className="text-sm text-muted-foreground">No line items yet.</p> : null}

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2">
                <div className="w-32">
                  <Label>Type</Label>
                  <Select
                    value={form.watch(`lineItems.${index}.type`)}
                    onValueChange={(value) => form.setValue(`lineItems.${index}.type`, value as FormValues['lineItems'][number]['type'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_ITEM_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type[0]!.toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>Description</Label>
                  <Input {...form.register(`lineItems.${index}.description`)} />
                </div>
                <div className="w-32">
                  <Label>Amount</Label>
                  <Input type="number" step="any" className="tabular-data" {...form.register(`lineItems.${index}.amount`)} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove line item">
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={() => append({ type: 'services', description: '', amount: 0 })}>
              <Plus className="size-4" aria-hidden />
              Add line item
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="extract-discounts">Discounts</Label>
            <Input id="extract-discounts" type="number" step="any" className="h-11 w-48 text-base tabular-data" {...form.register('discounts')} />
          </div>

          {totals ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Total work</span>
                <span className="tabular-data">{totals.totalWork}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Net before VAT</span>
                <span className="tabular-data">{totals.netBeforeVat}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>VAT ({(totals.vatRateUsed * 100).toFixed(0)}%)</span>
                <span className="tabular-data">{totals.vat}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground">
                <span>Final total</span>
                <span className="tabular-data">{totals.finalTotal}</span>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? 'Save changes' : 'Save as Draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
