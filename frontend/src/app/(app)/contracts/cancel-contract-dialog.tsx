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

export interface CancelContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractNumber: string;
  onCancelled: (reason: string) => void | Promise<void>;
}

/** Section 12/16: cancel requires a mandatory reason — mirrors StopGeneratorDialog's pattern. */
export function CancelContractDialog({ open, onOpenChange, contractNumber, onCancelled }: CancelContractDialogProps) {
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
      await onCancelled(reason.trim());
      toast.success(`${contractNumber} cancelled`);
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : "Couldn't cancel this contract.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {contractNumber}</DialogTitle>
          <DialogDescription>
            This is terminal — a cancelled contract can never be reactivated. If it was Active, every generator on it is recalculated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            placeholder="e.g. Customer requested early termination"
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
            Keep contract
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Cancel contract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
