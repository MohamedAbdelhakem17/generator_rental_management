'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/apiClient';
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
      setError('A reason is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onStopped(reason.trim());
      toast.success(`${generatorCode} marked Stopped`);
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : "Couldn't stop this generator.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop {generatorCode}</DialogTitle>
          <DialogDescription>
            This overrides the status to Stopped everywhere, even if it&apos;s under an active contract.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stop-reason">Reason</Label>
          <Textarea
            id="stop-reason"
            rows={3}
            placeholder="e.g. Engine fault reported on site"
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
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Stop generator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
