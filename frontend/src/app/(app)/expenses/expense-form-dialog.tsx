'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { Textarea } from '@/components/ui/textarea';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { GeneratorRow } from '../generators/types';
import type { ProjectRow } from '../projects/types';
import type { ExpenseRow } from './types';

type FormValues = {
  category: string;
  date: string;
  amount: number;
  attributionType: 'none' | 'generator' | 'project';
  generatorId: string;
  projectId: string;
  description?: string;
};

export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseRow | null;
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

export function ExpenseFormDialog({ open, onOpenChange, expense }: ExpenseFormDialogProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const isEditing = Boolean(expense);

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

  const formSchema = z
    .object({
      category: z.string().trim().min(1, t('expenses.categoryRequired')),
      date: z.string().min(1, t('expenses.dateRequired')),
      amount: z.coerce.number().positive(t('expenses.amountRequired')),
      attributionType: z.enum(['none', 'generator', 'project']),
      generatorId: z.string(),
      projectId: z.string(),
      description: z.string().trim().max(300, t('expenses.descriptionTooLong')).optional(),
    })
    .refine((values) => values.attributionType !== 'generator' || values.generatorId.length > 0, {
      message: t('expenses.chooseGeneratorPlaceholder'),
      path: ['generatorId'],
    })
    .refine((values) => values.attributionType !== 'project' || values.projectId.length > 0, {
      message: t('expenses.chooseProjectPlaceholder'),
      path: ['projectId'],
    });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: '',
      date: '',
      amount: 0,
      attributionType: 'none',
      generatorId: '',
      projectId: '',
      description: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (expense) {
      form.reset({
        category: expense.category,
        date: toDateInputValue(expense.date),
        amount: Number(expense.amount),
        attributionType: expense.generatorId ? 'generator' : expense.projectId ? 'project' : 'none',
        generatorId: expense.generatorId ?? '',
        projectId: expense.projectId ?? '',
        description: expense.description,
      });
    } else {
      form.reset({
        category: '',
        date: '',
        amount: 0,
        attributionType: 'none',
        generatorId: '',
        projectId: '',
        description: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const attributionType = form.watch('attributionType');

  function handleOpenChange(next: boolean) {
    if (form.formState.isSubmitting) return;
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      category: values.category,
      date: values.date,
      amount: values.amount,
      generatorId: values.attributionType === 'generator' ? values.generatorId : null,
      projectId: values.attributionType === 'project' ? values.projectId : null,
      description: values.description ?? '',
    };

    try {
      if (isEditing && expense) {
        await apiClient.patch(`/api/expenses/${expense.id}`, payload);
        toast.success(t('expenses.updatedToast'));
      } else {
        await apiClient.post('/api/expenses', payload);
        toast.success(t('expenses.createdToast'));
      }
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('expenses.saveFailedToast'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t('expenses.editExpense') : t('expenses.newExpense')}</DialogTitle>
          <DialogDescription>{t('expenses.formDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-category">{t('expenses.fieldCategory')}</Label>
              <Input id="expense-category" {...form.register('category')} />
              {form.formState.errors.category ? (
                <p className="text-xs text-destructive">{form.formState.errors.category.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-date">{t('expenses.fieldDate')}</Label>
              <Input id="expense-date" type="date" {...form.register('date')} />
              {form.formState.errors.date ? (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">{t('expenses.fieldAmount')}</Label>
            <Input
              id="expense-amount"
              type="number"
              step="any"
              className="tabular-data"
              {...form.register('amount')}
            />
            {form.formState.errors.amount ? (
              <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('expenses.fieldAttribution')}</Label>
            <Select
              value={attributionType}
              onValueChange={(value) => {
                form.setValue('attributionType', value as FormValues['attributionType'], {
                  shouldValidate: true,
                });
                form.setValue('generatorId', '');
                form.setValue('projectId', '');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('expenses.attributionUnallocated')}</SelectItem>
                <SelectItem value="generator">{t('expenses.attributionGenerator')}</SelectItem>
                <SelectItem value="project">{t('expenses.attributionProject')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {attributionType === 'generator' ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t('expenses.fieldGenerator')}</Label>
              <Select
                value={form.watch('generatorId')}
                onValueChange={(value) => form.setValue('generatorId', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('expenses.chooseGeneratorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {generators?.items.map((generator) => (
                    <SelectItem key={generator.id} value={generator.id}>
                      {generator.code} — {generator.specifications.brand} {generator.specifications.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.generatorId ? (
                <p className="text-xs text-destructive">{form.formState.errors.generatorId.message}</p>
              ) : null}
            </div>
          ) : null}

          {attributionType === 'project' ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t('expenses.fieldProject')}</Label>
              <Select
                value={form.watch('projectId')}
                onValueChange={(value) => form.setValue('projectId', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('expenses.chooseProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {projects?.items.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code} — {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.projectId ? (
                <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-description">{t('expenses.fieldDescription')}</Label>
            <Textarea id="expense-description" rows={3} {...form.register('description')} />
            {form.formState.errors.description ? (
              <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {isEditing ? t('common.saveChanges') : t('expenses.newExpense')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
