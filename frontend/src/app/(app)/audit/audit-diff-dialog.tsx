'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { AuditLogRow } from './types';

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Section 15: the diff view highlights changed fields — old value struck through, new value
 * shown — rather than a raw JSON dump. `before`/`after` are already field-diffed at the point
 * of recording (FR-002), so every key present here is a field that actually changed. */
export function AuditDiffDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  if (!entry) return null;

  const fields = [...new Set([...Object.keys(entry.before), ...Object.keys(entry.after)])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry.action}</DialogTitle>
          <DialogDescription>
            {entry.entityType ? `${entry.entityType} · ${entry.entityId}` : entry.action}
          </DialogDescription>
        </DialogHeader>

        {entry.reason ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t('audit.reasonLabel')}: </span>
            {entry.reason}
          </p>
        ) : null}

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('audit.diffNoChanges')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <div className="grid grid-cols-2 gap-3 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span>{t('audit.diffBefore')}</span>
              <span>{t('audit.diffAfter')}</span>
            </div>
            {fields.map((field) => (
              <div key={field} className="grid grid-cols-2 gap-3 px-3 py-2 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{field}</span>
                  <span className="tabular-data text-destructive line-through">
                    {formatValue(entry.before[field])}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{field}</span>
                  <span className="tabular-data text-emerald-600 dark:text-emerald-400">
                    {formatValue(entry.after[field])}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
