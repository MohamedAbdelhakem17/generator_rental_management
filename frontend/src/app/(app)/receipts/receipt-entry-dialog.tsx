'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';
import { CustomerCombobox } from '../projects/customer-combobox';
import type { AllocatableExtract, ReceiptPaymentMethod, ReceiptRow } from './types';

const PAYMENT_METHODS: ReceiptPaymentMethod[] = ['Cash', 'BankTransfer', 'Cheque', 'Card'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormValues = {
  customerId: string;
  date: string;
  amount: number;
  paymentMethod: ReceiptPaymentMethod;
  account?: string;
  transferNumber?: string;
};

function defaultValues(): FormValues {
  return {
    customerId: '',
    date: todayIso(),
    amount: 0,
    paymentMethod: 'Cash',
    account: '',
    transferNumber: '',
  };
}

function remainingBalance(extract: AllocatableExtract): number {
  return Number(extract.finalTotal ?? '0') - Number(extract.collectedAmount);
}

export interface ReceiptEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Section 13/14: customer select → payment fields → allocation table against that
 * customer's open (Approved/Partially Collected) extracts → live unallocated indicator.
 */
export function ReceiptEntryDialog({ open, onOpenChange }: ReceiptEntryDialogProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const formSchema = useMemo(
    () =>
      z
        .object({
          customerId: z.string().min(1, t('receipts.formChooseCustomer')),
          date: z
            .string()
            .min(1, t('receipts.dateRequired'))
            .refine((value) => value <= todayIso(), { message: t('receipts.dateFutureInvalid') }),
          amount: z.coerce.number().positive(t('receipts.amountRequired')),
          paymentMethod: z.enum(['Cash', 'BankTransfer', 'Cheque', 'Card']),
          account: z.string().optional().default(''),
          transferNumber: z.string().optional().default(''),
        })
        .refine((data) => (data.paymentMethod === 'BankTransfer' ? data.transferNumber.trim().length > 0 : true), {
          message: t('receipts.transferNumberRequired'),
          path: ['transferNumber'],
        })
        .refine(
          (data) =>
            data.paymentMethod === 'BankTransfer' || data.paymentMethod === 'Cheque'
              ? data.account.trim().length > 0
              : true,
          { message: t('receipts.accountRequired'), path: ['account'] },
        ),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(),
  });

  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [onAccountConfirmed, setOnAccountConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerId = form.watch('customerId');
  const amount = form.watch('amount') || 0;
  const paymentMethod = form.watch('paymentMethod');
  const date = form.watch('date');

  useEffect(() => {
    if (open) {
      form.reset(defaultValues());
      setAllocations({});
      setOnAccountConfirmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setAllocations({});
    setOnAccountConfirmed(false);
  }, [customerId]);

  const { data: approved, isFetching: isFetchingApproved } = useQuery({
    queryKey: ['receipts', 'allocatable-extracts', customerId, 'Approved'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<AllocatableExtract>(
        '/api/extracts',
        { customerId, status: 'Approved', limit: 50 },
        signal,
      ),
    enabled: open && customerId.length > 0,
  });
  const { data: partiallyCollected, isFetching: isFetchingPartial } = useQuery({
    queryKey: ['receipts', 'allocatable-extracts', customerId, 'Partially Collected'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<AllocatableExtract>(
        '/api/extracts',
        { customerId, status: 'Partially Collected', limit: 50 },
        signal,
      ),
    enabled: open && customerId.length > 0,
  });

  const isFetchingExtracts = isFetchingApproved || isFetchingPartial;
  const openExtracts = useMemo(
    () => [...(approved?.items ?? []), ...(partiallyCollected?.items ?? [])],
    [approved, partiallyCollected],
  );

  // Edge Case: non-blocking "similar receipt entered today" warning (same customer/amount/date).
  const { data: similarReceipts } = useQuery({
    queryKey: ['receipts', 'similar-check', customerId, amount, date],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ReceiptRow>(
        '/api/receipts',
        { customerId, dateFrom: date, dateTo: date, limit: 10 },
        signal,
      ),
    enabled: open && customerId.length > 0 && amount > 0 && date.length > 0,
  });
  const hasSimilarReceipt = (similarReceipts?.items ?? []).some(
    (receipt) => Number(receipt.amount) === Number(amount),
  );

  const totalAllocated = Object.values(allocations).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const unallocated = Math.round((amount - totalAllocated) * 100) / 100;
  const allocationExceedsAmount = totalAllocated > amount + 0.001;
  const needsOnAccountConfirm = unallocated > 0.001;
  const canSubmit =
    !allocationExceedsAmount && (!needsOnAccountConfirm || onAccountConfirmed) && amount > 0;

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    onOpenChange(next);
  }

  function setAllocationAmount(extractId: string, value: string, remaining: number) {
    const numeric = Number(value);
    if (value !== '' && (Number.isNaN(numeric) || numeric < 0)) return;
    const clamped = value === '' ? '' : String(Math.min(numeric, remaining));
    setAllocations((prev) => ({ ...prev, [extractId]: clamped }));
  }

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const payload = {
        customerId: values.customerId,
        date: values.date,
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        account: values.account ?? '',
        transferNumber: values.transferNumber ?? '',
        allocations: Object.entries(allocations)
          .filter(([, value]) => Number(value) > 0)
          .map(([extractId, value]) => ({ extractId, amount: Number(value) })),
      };
      const created = await apiClient.post<ReceiptRow>('/api/receipts', payload);
      toast.success(t('receipts.createdToast', { number: created.number }));
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('receipts.createFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('receipts.newReceiptTitle')}</DialogTitle>
          <DialogDescription>{t('receipts.formDescription')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pe-1"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{t('receipts.fieldCustomer')}</Label>
            <CustomerCombobox
              value={customerId}
              onSelect={(customer) => form.setValue('customerId', customer.id, { shouldValidate: true })}
            />
            {form.formState.errors.customerId ? (
              <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-date">{t('receipts.fieldDate')}</Label>
              <Input
                id="receipt-date"
                type="date"
                className="h-11 text-base"
                {...form.register('date')}
              />
              {form.formState.errors.date ? (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-amount">{t('receipts.fieldAmount')}</Label>
              <Input
                id="receipt-amount"
                type="number"
                step="any"
                className="h-11 text-base tabular-data"
                {...form.register('amount')}
              />
              {form.formState.errors.amount ? (
                <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
              ) : null}
            </div>
          </div>

          {hasSimilarReceipt ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {t('receipts.similarReceiptWarning')}
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('receipts.fieldPaymentMethod')}</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => form.setValue('paymentMethod', value as ReceiptPaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(`receipts.method${method}` as `receipts.method${typeof method}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-account">{t('receipts.fieldAccount')}</Label>
              <Input id="receipt-account" {...form.register('account')} />
              {form.formState.errors.account ? (
                <p className="text-xs text-destructive">{form.formState.errors.account.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-transfer-number">{t('receipts.fieldTransferNumber')}</Label>
              <Input id="receipt-transfer-number" {...form.register('transferNumber')} />
              {form.formState.errors.transferNumber ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.transferNumber.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('receipts.allocationSectionTitle')}</Label>

            {!customerId ? (
              <p className="text-sm text-muted-foreground">{t('receipts.selectCustomerFirst')}</p>
            ) : isFetchingExtracts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('receipts.loadingExtracts')}
              </div>
            ) : openExtracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('receipts.noOpenExtracts')}</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">
                        {t('receipts.allocationTableExtract')}
                      </th>
                      <th className="px-3 py-2 text-start font-medium">
                        {t('receipts.allocationTableRemaining')}
                      </th>
                      <th className="px-3 py-2 text-start font-medium">
                        {t('receipts.allocationTableAllocate')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {openExtracts.map((extract) => {
                      const remaining = remainingBalance(extract);
                      const value = allocations[extract.id] ?? '';
                      return (
                        <tr key={extract.id}>
                          <td className="px-3 py-2 font-medium">{extract.number}</td>
                          <td className="px-3 py-2 tabular-data text-muted-foreground">
                            {remaining.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              max={remaining}
                              className="h-9 w-32 tabular-data"
                              value={value}
                              onChange={(event) =>
                                setAllocationAmount(extract.id, event.target.value, remaining)
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div
            className={cn(
              'flex flex-col gap-2 rounded-md border px-3 py-2 text-sm',
              allocationExceedsAmount
                ? 'border-destructive/40 bg-destructive/5'
                : 'border-border bg-muted/40',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('receipts.unallocatedLabel')}</span>
              <span
                className={cn(
                  'tabular-data font-medium',
                  allocationExceedsAmount ? 'text-destructive' : 'text-foreground',
                )}
              >
                {unallocated.toFixed(2)}
              </span>
            </div>
            {allocationExceedsAmount ? (
              <p className="text-xs text-destructive">{t('receipts.allocationExceedsAmount')}</p>
            ) : needsOnAccountConfirm ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={onAccountConfirmed}
                  onCheckedChange={(checked) => setOnAccountConfirmed(checked === true)}
                />
                {t('receipts.onAccountCreditConfirm')}
              </label>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || isSubmitting || !canSubmit}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t('receipts.newReceipt')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
