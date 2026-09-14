import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';

/** Mirrors the Generator Status Engine's four derived states (PRD 6.1). */
export type GeneratorStatus = 'available' | 'rented' | 'under_maintenance' | 'stopped';

const STATUS_TONE: Record<GeneratorStatus, StatusTone> = {
  available: 'success',
  rented: 'info',
  under_maintenance: 'warning',
  stopped: 'danger',
};

const STATUS_LABEL: Record<GeneratorStatus, TranslationKey> = {
  available: 'status.available',
  rented: 'status.rented',
  under_maintenance: 'status.underMaintenance',
  stopped: 'status.stopped',
};

export function StatusBadge({ status, className }: { status: GeneratorStatus; className?: string }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[STATUS_TONE[status]];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        tone.bg,
        tone.fg,
        tone.border,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {t(STATUS_LABEL[status])}
    </span>
  );
}
