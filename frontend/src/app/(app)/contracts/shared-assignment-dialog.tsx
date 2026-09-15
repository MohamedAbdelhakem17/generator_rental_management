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

export interface SharedAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatorCode: string;
  onApproved: (justification: string) => void | Promise<void>;
}

/** TASK-013 FR-004/Section 16: Admin-only, requires a non-empty justification. */
export function SharedAssignmentDialog({ open, onOpenChange, generatorCode, onApproved }: SharedAssignmentDialogProps) {
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
      setError('A justification is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onApproved(justification.trim());
      toast.success(`Shared Assignment override applied to ${generatorCode}`);
      handleOpenChange(false);
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : "Couldn't apply the override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shared Assignment override — {generatorCode}</DialogTitle>
          <DialogDescription>
            Records an approved exception to the conflict block for this item only. The overlap still exists — this is an
            explicit, audited decision to allow it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shared-assignment-justification">Justification</Label>
          <Textarea
            id="shared-assignment-justification"
            rows={3}
            placeholder="e.g. Approved short overlap for handover between sites"
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
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Apply override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
