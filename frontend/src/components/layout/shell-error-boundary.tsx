'use client';

import { Component, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/locale-provider';
import { ErrorState } from '@/components/shared/error-state';

function ShellCrashFallback() {
  const { t } = useLocale();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <ErrorState
        title={t('shell.crashTitle')}
        description={t('shell.crashBody')}
        retryLabel={t('shell.reload')}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}

interface State {
  hasError: boolean;
}

/** Section 19: shell-level error boundary renders ErrorState with Reload instead of a blank screen. */
export class ShellErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('Shell caught an unhandled error:', error);
  }

  override render() {
    if (this.state.hasError) return <ShellCrashFallback />;
    return this.props.children;
  }
}
