'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
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

export interface CancelContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractNumber: string;
  onCancelled: (reason: string) => void | Promise<void>;
}

/** Section 12/16: cancel requires a mandatory reason — mirrors StopGeneratorDialog's pattern. */
export function CancelContractDialog({ open, onOpenChange, contractNumber, onCancelled }: CancelContractDialogProps) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    if (!next) {
      setReason('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!reason.trim()) {
      setError(t('contracts.cancelReasonRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onCancelled(reason.trim());
      toast.success(t('contracts.cancelledToast', { number: contractNumber }));
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : t('contracts.cancelFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contracts.cancelDialogTitle', { number: contractNumber })}</DialogTitle>
          <DialogDescription>{t('contracts.cancelDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-reason">{t('contracts.reasonLabel')}</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            placeholder={t('contracts.cancelReasonPlaceholder')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('contracts.keepContract')}
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('contracts.cancelButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
