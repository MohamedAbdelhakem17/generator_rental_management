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

export interface CancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractNumber: string;
  onCancelled: (reason: string) => void | Promise<void>;
}

/** Section 19: a reason is required to cancel an extract. */
export function CancelDialog({ open, onOpenChange, extractNumber, onCancelled }: CancelDialogProps) {
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
      toast.success(`${extractNumber} cancelled`);
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't cancel this extract.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {extractNumber}</DialogTitle>
          <DialogDescription>
            An Approved+ extract can only be cancelled directly while nothing has been collected against it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="extract-cancel-reason">Reason</Label>
          <Textarea id="extract-cancel-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Back
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting || reason.trim().length === 0}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Cancel extract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
