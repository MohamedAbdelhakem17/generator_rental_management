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

const MIN_NOTE_LENGTH = 5;

export interface ResolveAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatorCode: string;
  onResolved: (resolutionNote: string) => void | Promise<void>;
}

/** Section 15/16/FR-004: the Confirm button only enables once the note meets the minimum length. */
export function ResolveAlertDialog({ open, onOpenChange, generatorCode, onResolved }: ResolveAlertDialogProps) {
  const { t } = useLocale();
  const [resolutionNote, setResolutionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    if (!next) setResolutionNote('');
    onOpenChange(next);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onResolved(resolutionNote.trim());
      toast.success(t('fuel.alertResolvedToast', { code: generatorCode }));
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('fuel.resolveFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('fuel.resolveDialogTitle', { code: generatorCode })}</DialogTitle>
          <DialogDescription>{t('fuel.resolveDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resolve-note">{t('fuel.resolutionNoteLabel')}</Label>
          <Textarea
            id="resolve-note"
            rows={3}
            placeholder={t('fuel.resolutionNotePlaceholder')}
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || resolutionNote.trim().length < MIN_NOTE_LENGTH}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('fuel.resolveButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
