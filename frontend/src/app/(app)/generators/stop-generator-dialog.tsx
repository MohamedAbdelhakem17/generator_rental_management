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

export interface StopGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatorCode: string;
  onStopped: (reason: string) => void | Promise<void>;
}

/** Section 15: Stop requires a reason textarea — Resume (no reason) reuses the generic ConfirmDialog instead. */
export function StopGeneratorDialog({ open, onOpenChange, generatorCode, onStopped }: StopGeneratorDialogProps) {
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
      setError(t('generators.stopReasonRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onStopped(reason.trim());
      toast.success(t('generators.stoppedToast', { code: generatorCode }));
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : t('generators.stopFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('generators.stopTitle', { code: generatorCode })}</DialogTitle>
          <DialogDescription>{t('generators.stopDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stop-reason">{t('generators.reason')}</Label>
          <Textarea
            id="stop-reason"
            rows={3}
            placeholder={t('generators.reasonPlaceholder')}
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
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('generators.stopButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
