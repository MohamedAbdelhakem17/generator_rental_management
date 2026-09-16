'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';

type FormValues = {
  amount: number;
  reason: string;
};

export interface CreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  onCreated: () => void;
}

/** Section 13/16: a standalone manual balance adjustment, outside extract line-item discounts. */
export function CreditNoteDialog({
  open,
  onOpenChange,
  customerId,
  onCreated,
}: CreditNoteDialogProps) {
  const { t } = useLocale();

  const formSchema = z.object({
    amount: z.coerce.number().positive(t('customers.creditNoteAmountRequired')),
    reason: z.string().trim().min(5, t('customers.creditNoteReasonRequired')),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: 0, reason: '' },
  });

  useEffect(() => {
    if (open) form.reset({ amount: 0, reason: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (form.formState.isSubmitting) return;
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    try {
      await apiClient.post('/api/credit-notes', {
        customerId,
        amount: values.amount,
        reason: values.reason,
      });
      toast.success(t('customers.creditNoteCreatedToast'));
      onCreated();
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('customers.creditNoteFailedToast'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('customers.newCreditNote')}</DialogTitle>
          <DialogDescription>{t('customers.creditNoteDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="credit-note-amount">{t('customers.fieldAmount')}</Label>
            <Input
              id="credit-note-amount"
              type="number"
              step="any"
              className="h-11 text-base tabular-data"
              {...form.register('amount')}
            />
            {form.formState.errors.amount ? (
              <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="credit-note-reason">{t('customers.fieldReason')}</Label>
            <Textarea id="credit-note-reason" rows={3} {...form.register('reason')} />
            {form.formState.errors.reason ? (
              <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t('customers.newCreditNote')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
