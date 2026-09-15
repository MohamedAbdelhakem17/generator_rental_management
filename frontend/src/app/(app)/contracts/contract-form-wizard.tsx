'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';
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
import { ProjectSelect } from './project-select';
import { GeneratorSelect } from './generator-select';

const BILLING_METHODS = ['monthly', 'daily', 'weekly', 'hourly'] as const;

const formSchema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    projectId: z.string().min(1, 'Choose a project'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    rentalMethod: z.enum(BILLING_METHODS),
    insuranceProvider: z.string().trim().max(150).optional(),
    insurancePolicyNumber: z.string().trim().max(100).optional(),
    insuranceAmount: z.string().trim().optional(),
    items: z
      .array(
        z.object({
          generatorId: z.string().min(1, 'Choose a generator'),
          billingMethod: z.enum(BILLING_METHODS),
          unitPrice: z.coerce.number().positive('Enter a positive price'),
        }),
      )
      .min(0),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
  0: ['customerId', 'projectId'],
  1: ['startDate', 'endDate', 'rentalMethod'],
  2: ['items'],
};

const STEP_LABELS = ['Customer & project', 'Dates & terms', 'Generators'];

function defaultValues(): FormValues {
  return {
    customerId: '',
    projectId: '',
    startDate: '',
    endDate: '',
    rentalMethod: 'monthly',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    insuranceAmount: '',
    items: [],
  };
}

export interface ContractFormWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Section 13/18: a 3-step wizard (customer/project → dates/method → items), local state until submit. */
export function ContractFormWizard({ open, onOpenChange }: ContractFormWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [conflictWarnings, setConflictWarnings] = useState<Record<number, string[]>>({});

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(),
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset(defaultValues());
      setStep(0);
      setConflictWarnings({});
    }
    onOpenChange(next);
  }

  function dismissWarning(index: number) {
    setConflictWarnings((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  /** TASK-013 FR-001/Section 15: informational only — never blocks saving the Draft. */
  async function checkItemConflict(index: number, generatorId: string) {
    const { startDate, endDate } = form.getValues();
    if (!generatorId || !startDate || !endDate) return;

    try {
      const { conflicts } = await apiClient.post<{ conflicts: { contractNumber: string; status: string }[] }>(
        '/api/contracts/check-conflict',
        { generatorId, startDate, endDate },
      );
      if (conflicts.length === 0) {
        dismissWarning(index);
        return;
      }
      setConflictWarnings((current) => ({
        ...current,
        [index]: conflicts.map(
          (conflict) => `Also assigned to ${conflict.status} contract ${conflict.contractNumber} in this period.`,
        ),
      }));
    } catch {
      // Best-effort — a failed soft check never blocks the wizard.
    }
  }

  async function handleNext() {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (valid) setStep((current) => Math.min(current + 1, STEP_LABELS.length - 1));
  }

  async function onSubmit(values: FormValues) {
    try {
      await apiClient.post('/api/contracts', {
        customerId: values.customerId,
        projectId: values.projectId,
        startDate: values.startDate,
        endDate: values.endDate,
        rentalMethod: values.rentalMethod,
        insurance: {
          provider: values.insuranceProvider,
          policyNumber: values.insurancePolicyNumber,
          amount: values.insuranceAmount ? Number(values.insuranceAmount) : undefined,
        },
        items: values.items.map((item) => ({
          generatorId: item.generatorId,
          billingMethod: item.billingMethod,
          unitPrice: item.unitPrice,
        })),
      });
      toast.success('Contract created as Draft');
      await queryClient.invalidateQueries({ queryKey: ['contracts'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  const customerId = form.watch('customerId');
  const rentalMethod = form.watch('rentalMethod');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New contract — {STEP_LABELS[step]}</DialogTitle>
          <DialogDescription>Step {step + 1} of {STEP_LABELS.length}. It&apos;s created as a Draft — activation runs the conflict check.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {step === 0 ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Customer</Label>
                <CustomerCombobox
                  value={customerId}
                  onSelect={(customer) => {
                    form.setValue('customerId', customer.id, { shouldValidate: true });
                    form.setValue('projectId', '');
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
                  value={form.watch('projectId')}
                  onChange={(projectId) => form.setValue('projectId', projectId, { shouldValidate: true })}
                />
                {form.formState.errors.projectId ? (
                  <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contract-start">Start date</Label>
                  <Input id="contract-start" type="date" {...form.register('startDate')} />
                  {form.formState.errors.startDate ? (
                    <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contract-end">End date</Label>
                  <Input id="contract-end" type="date" {...form.register('endDate')} />
                  {form.formState.errors.endDate ? (
                    <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Rental method</Label>
                <Select value={rentalMethod} onValueChange={(value) => form.setValue('rentalMethod', value as FormValues['rentalMethod'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method[0]!.toUpperCase() + method.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The default billing method for items — each item can override it.</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contract-insurance-provider">Insurance provider</Label>
                  <Input id="contract-insurance-provider" {...form.register('insuranceProvider')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contract-insurance-policy">Policy number</Label>
                  <Input id="contract-insurance-policy" {...form.register('insurancePolicyNumber')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contract-insurance-amount">Amount</Label>
                  <Input id="contract-insurance-amount" type="number" step="any" {...form.register('insuranceAmount')} />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-3">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No generators added yet. A Draft can be saved with zero items.</p>
              ) : null}

              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Generator</Label>
                      <GeneratorSelect
                        value={form.watch(`items.${index}.generatorId`)}
                        onChange={(generatorId) => {
                          form.setValue(`items.${index}.generatorId`, generatorId, { shouldValidate: true });
                          void checkItemConflict(index, generatorId);
                        }}
                      />
                    </div>
                    <div className="w-32">
                      <Label>Method</Label>
                      <Select
                        value={form.watch(`items.${index}.billingMethod`)}
                        onValueChange={(value) => form.setValue(`items.${index}.billingMethod`, value as FormValues['rentalMethod'])}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BILLING_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {method[0]!.toUpperCase() + method.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28">
                      <Label>Unit price</Label>
                      <Input type="number" step="any" {...form.register(`items.${index}.unitPrice`)} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove item">
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>

                  {conflictWarnings[index] ? (
                    <div className="flex items-start justify-between gap-2 rounded-md bg-status-maintenance-bg px-2.5 py-1.5 text-xs text-status-maintenance-fg">
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          {conflictWarnings[index]!.join(' ')} You can still save — activation will be blocked unless
                          resolved.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissWarning(index)}
                        aria-label="Dismiss warning"
                        className="shrink-0 opacity-70 hover:opacity-100"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ generatorId: '', billingMethod: rentalMethod, unitPrice: 0 })}
              >
                <Plus className="size-4" aria-hidden />
                Add generator
              </Button>
              {form.formState.errors.items?.message ? (
                <p className="text-xs text-destructive">{form.formState.errors.items.message}</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)}>
                Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
            )}
            {step < STEP_LABELS.length - 1 ? (
              <Button type="button" onClick={() => void handleNext()}>
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Create Draft
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
