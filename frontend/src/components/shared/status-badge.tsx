import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { TranslationKey } from '@/lib/i18n/dictionary';

/** Mirrors the Generator Status Engine's four derived states (PRD 6.1). */
export type GeneratorStatus = 'available' | 'rented' | 'under_maintenance' | 'stopped';

const STATUS_CONFIG: Record<
  GeneratorStatus,
  { labelKey: TranslationKey; bg: string; fg: string; border: string; dot: string }
> = {
  available: {
    labelKey: 'status.available',
    bg: 'bg-status-available-bg',
    fg: 'text-status-available-fg',
    border: 'border-status-available-border',
    dot: 'bg-status-available-fg',
  },
  rented: {
    labelKey: 'status.rented',
    bg: 'bg-status-rented-bg',
    fg: 'text-status-rented-fg',
    border: 'border-status-rented-border',
    dot: 'bg-status-rented-fg',
  },
  under_maintenance: {
    labelKey: 'status.underMaintenance',
    bg: 'bg-status-maintenance-bg',
    fg: 'text-status-maintenance-fg',
    border: 'border-status-maintenance-border',
    dot: 'bg-status-maintenance-fg',
  },
  stopped: {
    labelKey: 'status.stopped',
    bg: 'bg-status-stopped-bg',
    fg: 'text-status-stopped-fg',
    border: 'border-status-stopped-border',
    dot: 'bg-status-stopped-fg',
  },
};

export function StatusBadge({ status, className }: { status: GeneratorStatus; className?: string }) {
  const { t } = useLocale();
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        config.bg,
        config.fg,
        config.border,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', config.dot)} aria-hidden />
      {t(config.labelKey)}
    </span>
  );
}
