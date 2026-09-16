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

export interface CancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatorCode: string;
  onCancelled: (reason: string) => void | Promise<void>;
}

/** Section 19/25: a reason is required to cancel a maintenance record. */
export function CancelDialog({ open, onOpenChange, generatorCode, onCancelled }: CancelDialogProps) {
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
      toast.success(t('maintenance.cancelledToast', { code: generatorCode }));
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('maintenance.cancelFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('maintenance.cancelDialogTitle', { code: generatorCode })}</DialogTitle>
          <DialogDescription>{t('maintenance.cancelDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-reason">{t('maintenance.reasonLabel')}</Label>
          <Textarea id="cancel-reason" rows={3} placeholder={t('maintenance.reasonPlaceholder')} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting || reason.trim().length === 0}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('maintenance.cancelButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
