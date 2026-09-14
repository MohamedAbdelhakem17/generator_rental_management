import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/locale-provider';
import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ title, description, onRetry, retryLabel, className }: ErrorStateProps) {
  const { t } = useLocale();

  return (
    <div
      role="alert"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title ?? t('error.defaultTitle')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description ?? t('error.defaultBody')}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel ?? t('error.retry')}
        </Button>
      ) : null}
    </div>
  );
}
