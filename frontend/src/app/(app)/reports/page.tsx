'use client';

import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { REPORT_DEFINITIONS } from './report-definitions';
import { ReportKpiView } from './report-kpi-view';
import { ReportStatementView } from './report-statement-view';
import { ReportTableView } from './report-table-view';

export default function ReportsPage() {
  const { t } = useLocale();
  const { user } = useSession();

  const availableReports = REPORT_DEFINITIONS.filter((report) =>
    user?.permissions.includes(report.permission),
  );

  const [selectedId, setSelectedId] = useState<string | undefined>(availableReports[0]?.id);
  const selected = availableReports.find((report) => report.id === selectedId);

  return (
    <>
      <PageHeader title={t('reports.title')} description={t('reports.description')} />

      {availableReports.length === 0 ? (
        <EmptyState title={t('reports.noAccessTitle')} description={t('reports.noAccessDescription')} />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
            {availableReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedId(report.id)}
                className={cn(
                  'shrink-0 rounded-md px-3 py-2 text-start text-sm font-medium transition-colors',
                  report.id === selectedId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(report.titleKey)}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {selected ? (
              <div>
                <h2 className="text-sm font-medium text-foreground">{t(selected.titleKey)}</h2>
                <p className="text-sm text-muted-foreground">{t(selected.descriptionKey)}</p>
              </div>
            ) : null}

            {selected?.kind === 'table' ? <ReportTableView definition={selected} /> : null}
            {selected?.kind === 'profitability' || selected?.kind === 'profitExpenseSummary' ? (
              <ReportKpiView definition={selected} />
            ) : null}
            {selected?.kind === 'customerStatement' ? <ReportStatementView definition={selected} /> : null}
          </div>
        </div>
      )}
    </>
  );
}
