'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PackageX, Plus, Trash2 } from 'lucide-react';

import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { ROLE_LABELS } from '@/lib/permissions/roles';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge, type GeneratorStatus } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { SkeletonCard, SkeletonList, SkeletonTable, SkeletonText } from '@/components/shared/loading-skeleton';

const STATUSES: GeneratorStatus[] = ['available', 'rented', 'under_maintenance', 'stopped'];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col items-start gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function ShellFoundationPage() {
  const { locale, setLocale } = useLocale();
  const { role, userName } = useSession();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <>
      <PageHeader
        title="Shell foundation"
        description={`Signed in as ${userName}, ${ROLE_LABELS[role]}. AppShell, RTL, and the shared primitives every later module builds on.`}
        action={
          <div className="flex overflow-hidden rounded-md border border-input">
            <button
              onClick={() => setLocale('en')}
              className={`px-2.5 py-1.5 text-xs font-medium ${locale === 'en' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground hover:bg-muted'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLocale('ar')}
              className={`px-2.5 py-1.5 text-xs font-medium ${locale === 'ar' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground hover:bg-muted'}`}
            >
              AR
            </button>
          </div>
        }
      />

      <Section
        title="Generator status"
        description="Status Engine states (PRD 6.1) — the same four colors are used everywhere a generator's status appears."
      >
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={PackageX}
          title="No generators assigned"
          description="Generators assigned to this project will appear here once a contract is active."
          action={
            <Button size="sm">
              <Plus className="size-4" aria-hidden />
              Assign generator
            </Button>
          }
        />
      </Section>

      <Section title="Error state">
        {deleted ? (
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Retried — request would run again here.
          </p>
        ) : (
          <ErrorState
            title="Couldn't load generators"
            description="The generators list failed to load. Check your connection and try again."
            onRetry={() => setDeleted(true)}
          />
        )}
      </Section>

      <Section title="Confirm dialog" description="Destructive actions never use a native confirm() — always this dialog.">
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-4" aria-hidden />
          Delete generator GEN-014
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete generator GEN-014?"
          description="This soft-deletes the generator. Its operational and financial history is preserved and it can be restored later."
          confirmLabel="Delete"
          onConfirm={() => new Promise((resolve) => setTimeout(resolve, 600))}
        />
      </Section>

      <Section title="Loading skeletons">
        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Text</p>
            <SkeletonText />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Card</p>
            <SkeletonCard />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">List</p>
            <SkeletonList />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Table</p>
            <SkeletonTable rows={3} />
          </div>
        </div>
      </Section>

      <Section title="DataTable foundation" description="TASK-005 preview — apiClient, DataTable, filters, and useDataTableQuery over mock data.">
        <Link href="/dev/data-table" className="text-sm font-medium text-primary hover:underline">
          Open the DataTable preview
        </Link>
      </Section>
    </>
  );
}
