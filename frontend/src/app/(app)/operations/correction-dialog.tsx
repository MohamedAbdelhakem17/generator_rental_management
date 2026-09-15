'use client';

import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { OperationLogRow } from './types';

export interface CorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: OperationLogRow | null;
  onCorrected: (input: { startMeter?: number; endMeter?: number; reason: string }) => void | Promise<void>;
}

/** Admin/Ops Manager only (Section 17) — creates a new record and supersedes the original. */
export function CorrectionDialog({ open, onOpenChange, log, onCorrected }: CorrectionDialogProps) {
  const [startMeter, setStartMeter] = useState('');
  const [endMeter, setEndMeter] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && log) {
      setStartMeter(String(log.startMeter));
      setEndMeter(String(log.endMeter));
      setReason('');
      setError(null);
    }
  }, [open, log]);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCorrected({
        startMeter: startMeter === '' ? undefined : Number(startMeter),
        endMeter: endMeter === '' ? undefined : Number(endMeter),
        reason: reason.trim(),
      });
      toast.success(`${log?.generator.code} entry corrected`);
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : "Couldn't correct this entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct {log?.generator.code ?? 'entry'}</DialogTitle>
          <DialogDescription>
            The original stays on record as Superseded — this creates a new, corrected entry linked to it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correction-start">Start meter</Label>
            <Input id="correction-start" type="number" inputMode="decimal" value={startMeter} onChange={(event) => setStartMeter(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correction-end">End meter</Label>
            <Input id="correction-end" type="number" inputMode="decimal" value={endMeter} onChange={(event) => setEndMeter(event.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correction-reason">Reason</Label>
          <Textarea
            id="correction-reason"
            rows={3}
            placeholder="e.g. Technician transposed the digits on-site"
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
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
