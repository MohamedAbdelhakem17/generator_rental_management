'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PageHeader } from '@/components/layout/page-header';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { ListSettingField } from './list-setting-field';
import { NumberSettingField } from './number-setting-field';
import { TextSettingField } from './text-setting-field';

interface SettingsResponse {
  Financial: {
    vatRate?: number;
    currency?: string;
    paymentMethods?: string[];
  };
  Operational: {
    fuelAlertTolerancePercent?: number;
    fuelAlertCriticalPercent?: number;
    defaultMaintenanceCycleHours?: number;
    maintenanceScheduleBufferHours?: number;
    overdueGracePeriodDays?: number;
  };
  ReferenceList: {
    expenseCategories?: string[];
  };
}

const SETTINGS_QUERY_KEY = ['settings'];

export default function SettingsPage() {
  const { t } = useLocale();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('settings:manage') ?? false;
  const canEditFinancial = canManage || (user?.permissions.includes('settings:finance') ?? false);

  const {
    data: settings,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: ({ signal }) => apiClient.get<SettingsResponse>('/api/settings', undefined, signal),
  });

  function onSaved() {
    void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !settings) {
    return <ErrorState title={t('settings.loadFailedTitle')} onRetry={refetch} />;
  }

  const hasOperational = Object.keys(settings.Operational).length > 0;
  const hasReferenceLists = Object.keys(settings.ReferenceList).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('settings.pageTitle')} description={t('settings.pageDescription')} />

      <Tabs defaultValue="financial">
        <TabsList>
          <TabsTrigger value="financial">{t('settings.tabFinancial')}</TabsTrigger>
          {hasOperational ? (
            <TabsTrigger value="operational">{t('settings.tabOperational')}</TabsTrigger>
          ) : null}
          {hasReferenceLists ? (
            <TabsTrigger value="referenceLists">{t('settings.tabReferenceLists')}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="financial">
          <div className="rounded-lg border border-border bg-surface px-4">
            {settings.Financial.vatRate !== undefined ? (
              <NumberSettingField
                settingKey="vatRate"
                label={t('settings.vatRateLabel')}
                notice={t('settings.vatRateNotice')}
                value={settings.Financial.vatRate}
                canEdit={canEditFinancial}
                onSaved={onSaved}
              />
            ) : null}
            {settings.Financial.currency !== undefined ? (
              <TextSettingField
                settingKey="currency"
                label={t('settings.currencyLabel')}
                value={settings.Financial.currency}
                canEdit={canEditFinancial}
                onSaved={onSaved}
              />
            ) : null}
            {settings.Financial.paymentMethods !== undefined ? (
              <ListSettingField
                settingKey="paymentMethods"
                label={t('settings.paymentMethodsLabel')}
                value={settings.Financial.paymentMethods}
                canEdit={canEditFinancial}
                onSaved={onSaved}
              />
            ) : null}
          </div>
        </TabsContent>

        {hasOperational ? (
          <TabsContent value="operational">
            <div className="rounded-lg border border-border bg-surface px-4">
              {settings.Operational.fuelAlertTolerancePercent !== undefined ? (
                <NumberSettingField
                  settingKey="fuelAlertTolerancePercent"
                  label={t('settings.fuelAlertTolerancePercentLabel')}
                  description={t('settings.fuelAlertTolerancePercentDescription')}
                  value={settings.Operational.fuelAlertTolerancePercent}
                  canEdit={canManage}
                  onSaved={onSaved}
                />
              ) : null}
              {settings.Operational.fuelAlertCriticalPercent !== undefined ? (
                <NumberSettingField
                  settingKey="fuelAlertCriticalPercent"
                  label={t('settings.fuelAlertCriticalPercentLabel')}
                  description={t('settings.fuelAlertCriticalPercentDescription')}
                  value={settings.Operational.fuelAlertCriticalPercent}
                  canEdit={canManage}
                  onSaved={onSaved}
                />
              ) : null}
              {settings.Operational.defaultMaintenanceCycleHours !== undefined ? (
                <NumberSettingField
                  settingKey="defaultMaintenanceCycleHours"
                  label={t('settings.defaultMaintenanceCycleHoursLabel')}
                  description={t('settings.defaultMaintenanceCycleHoursDescription')}
                  value={settings.Operational.defaultMaintenanceCycleHours}
                  canEdit={canManage}
                  onSaved={onSaved}
                />
              ) : null}
              {settings.Operational.maintenanceScheduleBufferHours !== undefined ? (
                <NumberSettingField
                  settingKey="maintenanceScheduleBufferHours"
                  label={t('settings.maintenanceScheduleBufferHoursLabel')}
                  description={t('settings.maintenanceScheduleBufferHoursDescription')}
                  value={settings.Operational.maintenanceScheduleBufferHours}
                  canEdit={canManage}
                  onSaved={onSaved}
                />
              ) : null}
              {settings.Operational.overdueGracePeriodDays !== undefined ? (
                <NumberSettingField
                  settingKey="overdueGracePeriodDays"
                  label={t('settings.overdueGracePeriodDaysLabel')}
                  description={t('settings.overdueGracePeriodDaysDescription')}
                  value={settings.Operational.overdueGracePeriodDays}
                  canEdit={canManage}
                  onSaved={onSaved}
                />
              ) : null}
            </div>
          </TabsContent>
        ) : null}

        {hasReferenceLists ? (
          <TabsContent value="referenceLists">
            <div className="rounded-lg border border-border bg-surface px-4">
              {settings.ReferenceList.expenseCategories !== undefined ? (
                <ListSettingField
                  settingKey="expenseCategories"
                  label={t('settings.expenseCategoriesLabel')}
                  value={settings.ReferenceList.expenseCategories}
                  canEdit={canManage}
                  onSaved={onSaved}
                />
              ) : null}
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
