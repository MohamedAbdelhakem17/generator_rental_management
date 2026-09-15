'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Pencil, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectFormDialog } from '../project-form-dialog';
import type { ProjectDetail } from '../types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: ProjectDetail['status'] }) {
  const tone = STATUS_TONE_CLASSES[status === 'Active' ? 'success' : 'neutral'];
  return (
    <span
      data-testid="project-header-status"
      className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {status}
    </span>
  );
}

export default function ProjectProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('projects:write') ?? false;

  const [isEditing, setIsEditing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const { data: project, isLoading, isError, refetch } = useQuery({
    queryKey: ['projects', params.id],
    queryFn: ({ signal }) => apiClient.get<ProjectDetail>(`/api/projects/${params.id}`, undefined, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['projects'] });
  }

  async function confirmClose() {
    if (!project) return;
    try {
      await apiClient.delete(`/api/projects/${project.id}`);
      toast.success(`Closed ${project.name}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't close this project.");
      throw error;
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return <ErrorState title="Couldn't load this project" onRetry={refetch} />;
  }

  return (
    <>
      <PageHeader
        title={project.name}
        description={`Code ${project.code}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to projects
            </Button>
            <StatusBadge status={project.status} />
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Button>
                {project.status === 'Active' ? (
                  <Button variant="destructive" size="sm" onClick={() => setIsClosing(true)}>
                    <Lock className="size-4" aria-hidden />
                    Close
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="generators">Generators</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-foreground">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field
                label="Customer"
                value={
                  <Link href={`/customers/${project.customer.id}`} className="text-primary hover:underline">
                    {project.customer.companyName}
                  </Link>
                }
              />
              <Field label="Location" value={project.location || '—'} />
              <Field label="Site manager" value={project.siteManager || '—'} />
              <Field label="Start date" value={formatDate(project.startDate)} />
              <Field label="End date" value={formatDate(project.endDate)} />
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="generators">
          {project.assignedGenerators.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No generators assigned yet"
              description="This is a live view of generators under this project's active contracts — it fills in once contract management ships."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {project.assignedGenerators.map((generator) => (
                <li key={generator.generatorId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <Link href={`/generators/${generator.generatorId}`} className="font-medium text-primary hover:underline">
                    {generator.code}
                  </Link>
                  <span className="text-muted-foreground">{generator.status}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="contracts">
          <EmptyState title="No contracts yet" description="Rental contracts under this project land here once contract management ships." />
        </TabsContent>

        <TabsContent value="revenue">
          <EmptyState title="No revenue data yet" description="A revenue summary from this project's extracts lands here once extract management ships." />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={isEditing} onOpenChange={setIsEditing} project={project} />

      <ConfirmDialog
        open={isClosing}
        onOpenChange={setIsClosing}
        title={`Close ${project.name}?`}
        description="It's blocked while an active contract references it, and stays visible in historical reports."
        confirmLabel="Close project"
        onConfirm={confirmClose}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
