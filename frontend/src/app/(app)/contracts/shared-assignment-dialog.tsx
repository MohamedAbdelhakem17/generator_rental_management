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

export interface SharedAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatorCode: string;
  onApproved: (justification: string) => void | Promise<void>;
}

/** TASK-013 FR-004/Section 16: Admin-only, requires a non-empty justification. */
export function SharedAssignmentDialog({ open, onOpenChange, generatorCode, onApproved }: SharedAssignmentDialogProps) {
  const { t } = useLocale();
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    if (!next) {
      setJustification('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!justification.trim()) {
      setError(t('contracts.justificationRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onApproved(justification.trim());
      toast.success(t('contracts.overrideAppliedToast', { code: generatorCode }));
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : t('contracts.overrideFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contracts.overrideDialogTitle', { code: generatorCode })}</DialogTitle>
          <DialogDescription>{t('contracts.overrideDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shared-assignment-justification">{t('contracts.justificationLabel')}</Label>
          <Textarea
            id="shared-assignment-justification"
            rows={3}
            placeholder={t('contracts.justificationPlaceholder')}
            value={justification}
            onChange={(event) => {
              setJustification(event.target.value);
              if (error) setError(null);
            }}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('contracts.applyOverrideButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
