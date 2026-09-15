'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { ContractRow } from '../contracts/types';

export interface ContractMultiSelectProps {
  customerId: string;
  projectId: string;
  value: string[];
  onChange: (contractIds: string[]) => void;
  disabled?: boolean;
}

/** Section 6: contracts are scoped to the selected customer+project and must be Active to bill against. */
export function ContractMultiSelect({ customerId, projectId, value, onChange, disabled }: ContractMultiSelectProps) {
  const { data, isFetching } = useQuery({
    queryKey: ['contracts', 'select', customerId, projectId],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ContractRow>('/api/contracts', { customerId, projectId, status: 'Active', limit: 50 }, signal),
    enabled: Boolean(customerId && projectId),
  });

  function toggle(contractId: string) {
    onChange(value.includes(contractId) ? value.filter((id) => id !== contractId) : [...value, contractId]);
  }

  if (!customerId || !projectId) {
    return <p className="text-sm text-muted-foreground">Choose a customer and project first.</p>;
  }
  if (isFetching) {
    return <p className="text-sm text-muted-foreground">Loading contracts…</p>;
  }
  if (!data || data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">No active contracts for this customer/project.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      {data.items.map((contract) => (
        <label
          key={contract.id}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <Checkbox checked={value.includes(contract.id)} onCheckedChange={() => toggle(contract.id)} disabled={disabled} />
          <span>
            {contract.number} · {contract.rentalMethod} · {contract.startDate.slice(0, 10)} – {contract.endDate.slice(0, 10)}
          </span>
        </label>
      ))}
    </div>
  );
}
