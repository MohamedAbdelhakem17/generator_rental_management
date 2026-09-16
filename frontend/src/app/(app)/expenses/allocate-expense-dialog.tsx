'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';
import type { GeneratorRow } from '../generators/types';
import type { ProjectRow } from '../projects/types';
import type { ExpenseRow } from './types';

interface SplitRow {
  targetType: 'generator' | 'project';
  targetId: string;
  percentage: number;
}

export interface AllocateExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRow;
}

function emptyRow(): SplitRow {
  return { targetType: 'generator', targetId: '', percentage: 0 };
}

export function AllocateExpenseDialog({ open, onOpenChange, expense }: AllocateExpenseDialogProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<SplitRow[]>([emptyRow(), emptyRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select', 'all'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ProjectRow>(
        '/api/projects',
        { status: 'Active', limit: 100, sort: 'name' },
        signal,
      ),
  });

  useEffect(() => {
    if (open) {
      setRows([emptyRow(), emptyRow()]);
    }
  }, [open]);

  const totalPercentage = rows.reduce((sum, row) => sum + (Number.isFinite(row.percentage) ? row.percentage : 0), 0);
  const remaining = Math.round((100 - totalPercentage) * 100) / 100;
  const canConfirm =
    remaining === 0 &&
    rows.length > 0 &&
    rows.every((row) => row.targetId.length > 0 && row.percentage > 0);

  function updateRow(index: number, patch: Partial<SplitRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    onOpenChange(next);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await apiClient.post(`/api/expenses/${expense.id}/allocate`, {
        splits: rows.map((row) => ({
          [row.targetType === 'generator' ? 'generatorId' : 'projectId']: row.targetId,
          percentage: row.percentage,
        })),
      });
      toast.success(t('expenses.allocatedToast'));
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('expenses.allocateFailedToast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('expenses.allocateDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('expenses.allocateDialogDescription', { amount: expense.amount })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-2 rounded-md border border-border p-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t('expenses.splitTargetType')}</Label>
                <Select
                  value={row.targetType}
                  onValueChange={(value) =>
                    updateRow(index, { targetType: value as SplitRow['targetType'], targetId: '' })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generator">{t('expenses.attributionGenerator')}</SelectItem>
                    <SelectItem value="project">{t('expenses.attributionProject')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{t('expenses.splitTarget')}</Label>
                <Select value={row.targetId} onValueChange={(value) => updateRow(index, { targetId: value })}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        row.targetType === 'generator'
                          ? t('expenses.chooseGeneratorPlaceholder')
                          : t('expenses.chooseProjectPlaceholder')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {row.targetType === 'generator'
                      ? generators?.items.map((generator) => (
                          <SelectItem key={generator.id} value={generator.id}>
                            {generator.code} — {generator.specifications.brand} {generator.specifications.model}
                          </SelectItem>
                        ))
                      : projects?.items.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.code} — {project.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-24 flex-col gap-1.5">
                <Label>{t('expenses.splitPercentage')}</Label>
                <Input
                  type="number"
                  step="any"
                  className="tabular-data"
                  value={row.percentage}
                  onChange={(event) => updateRow(index, { percentage: Number(event.target.value) })}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length <= 2}
                onClick={() => removeRow(index)}
                aria-label={t('expenses.removeSplitRow')}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRow}>
            <Plus className="size-4" aria-hidden />
            {t('expenses.addSplitRow')}
          </Button>

          <div
            className={cn(
              'flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium',
              remaining === 0
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            <span>{t('expenses.remainingToAllocate')}</span>
            <span className="tabular-data">{remaining}%</span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canConfirm || isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('expenses.confirmAllocation')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
