'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { ReceiptRow } from './types';

export interface ReceiptCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptRow;
  onCancelled: (reason: string) => void | Promise<void>;
}

/** Section 15/20: shows which extracts will have their collected amounts reversed before confirming. */
export function ReceiptCancelDialog({
  open,
  onOpenChange,
  receipt,
  onCancelled,
}: ReceiptCancelDialogProps) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    if (!next) setReason('');
    onOpenChange(next);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onCancelled(reason.trim());
      toast.success(t('receipts.cancelledToast', { number: receipt.number }));
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('receipts.cancelFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('receipts.cancelDialogTitle', { number: receipt.number })}</DialogTitle>
          <DialogDescription>{t('receipts.cancelDialogDescription')}</DialogDescription>
        </DialogHeader>

        {receipt.allocations.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              {t('receipts.cancelReversalNote')}
            </p>
            {receipt.allocations.map((allocation) => (
              <div key={allocation.extractId} className="flex justify-between">
                <span className="text-muted-foreground">{allocation.extractId.slice(-6)}</span>
                <span className="tabular-data">-{allocation.amount}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt-cancel-reason">{t('receipts.reasonLabel')}</Label>
          <Textarea
            id="receipt-cancel-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting || reason.trim().length === 0}
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('receipts.cancelButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
