'use client';

import { Suspense } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersTab } from './users-tab';
import { RolesTab } from './roles-tab';

export default function UsersAndRolesPage() {
  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Manage who can sign in and what each role can do. Every permission here is enforced by the API, not just this screen."
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
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
