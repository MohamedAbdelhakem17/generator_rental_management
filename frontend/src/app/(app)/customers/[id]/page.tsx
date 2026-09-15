'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomerFormDialog } from '../customer-form-dialog';
import type { CustomerRow } from '../types';

const PLACEHOLDER_TABS = [
  { value: 'projects', label: 'Projects', description: 'This customer’s job sites land here once project management ships.' },
  { value: 'contracts', label: 'Contracts', description: 'Rental contracts with this customer land here once contract management ships.' },
  { value: 'extracts', label: 'Extracts', description: 'Billing extracts land here once extract management ships.' },
  { value: 'receipts', label: 'Receipts', description: 'Payments received land here once receipt tracking ships.' },
  { value: 'statement', label: 'Statement', description: 'The live account balance and history land here once the Customer Ledger Engine ships.' },
] as const;

function ActiveBadge({ active }: { active: boolean }) {
  const tone = STATUS_TONE_CLASSES[active ? 'success' : 'neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('customers:write') ?? false;

  const [isEditing, setIsEditing] = useState(false);

  const { data: customer, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', params.id],
    queryFn: ({ signal }) => apiClient.get<CustomerRow>(`/api/customers/${params.id}`, undefined, signal),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  async function toggleActive() {
    if (!customer) return;
    try {
      await apiClient.patch(`/api/customers/${customer.id}`, { active: !customer.active });
      toast.success(customer.active ? `Deactivated ${customer.companyName}` : `Activated ${customer.companyName}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
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

  if (isError || !customer) {
    return <ErrorState title="Couldn't load this customer" onRetry={refetch} />;
  }

  return (
    <>
      <PageHeader
        title={customer.companyName}
        description={`Code ${customer.code}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/customers')}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to customers
            </Button>
            <span data-testid="customer-header-status">
              <ActiveBadge active={customer.active} />
            </span>
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => void toggleActive()}>
                  {customer.active ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />}
                  {customer.active ? 'Deactivate' : 'Activate'}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {PLACEHOLDER_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-foreground">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Contact person" value={customer.contactPerson || '—'} />
              <Field label="Phone" value={customer.phone || '—'} />
              <Field label="Tax number" value={customer.taxNumber || '—'} mono />
              <Field label="Address" value={customer.address || '—'} />
            </dl>
          </div>
        </TabsContent>

        {PLACEHOLDER_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <EmptyState title={`No ${tab.label.toLowerCase()} data yet`} description={tab.description} />
          </TabsContent>
        ))}
      </Tabs>

      <CustomerFormDialog open={isEditing} onOpenChange={setIsEditing} customer={customer} />
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'tabular-data text-foreground' : 'text-foreground'}>{value}</dd>
    </div>
  );
}
