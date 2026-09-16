'use client';

import { Suspense } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/lib/i18n/locale-provider';
import { RolesTab } from './roles-tab';
import { UsersTab } from './users-tab';

export default function UsersAndRolesPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHeader title={t('users.title')} description={t('users.description')} />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t('users.tabUsers')}</TabsTrigger>
          <TabsTrigger value="roles">{t('users.tabRoles')}</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          {/* useDataTableQuery reads useSearchParams(), which needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <UsersTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
