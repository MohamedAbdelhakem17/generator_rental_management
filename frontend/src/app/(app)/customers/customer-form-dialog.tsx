'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
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
import { Textarea } from '@/components/ui/textarea';
import type { CustomerRow } from './types';

const formSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  companyName: z.string().trim().min(1, 'Company name is required').max(150),
  contactPerson: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  taxNumber: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  code: '',
  companyName: '',
  contactPerson: '',
  phone: '',
  taxNumber: '',
  address: '',
};

export interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new customer; pass an existing row to edit its details. */
  customer?: CustomerRow;
}

export function CustomerFormDialog({ open, onOpenChange, customer }: CustomerFormDialogProps) {
  const isEdit = Boolean(customer);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      customer
        ? {
            code: customer.code,
            companyName: customer.companyName,
            contactPerson: customer.contactPerson,
            phone: customer.phone,
            taxNumber: customer.taxNumber,
            address: customer.address,
          }
        : DEFAULT_VALUES,
    );
  }, [open, customer, form]);

  async function onSubmit(values: FormValues) {
    try {
      if (isEdit && customer) {
        await apiClient.patch(`/api/customers/${customer.id}`, {
          companyName: values.companyName,
          contactPerson: values.contactPerson,
          phone: values.phone,
          taxNumber: values.taxNumber,
          address: values.address,
        });
        toast.success(`Updated ${values.companyName}`);
      } else {
        await apiClient.post('/api/customers', values);
        toast.success(`Added ${values.companyName}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field && fieldError.field in form.getValues()) {
            form.setError(fieldError.field as keyof FormValues, { message: fieldError.message });
          }
        }
      }
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${customer?.companyName}` : 'Add a customer'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Contact and billing details only — the code is fixed once created.' : 'The billing counterparty for projects and contracts.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-code">Code</Label>
              <Input id="cust-code" disabled={isEdit} {...form.register('code')} />
              {form.formState.errors.code ? <p className="text-xs text-destructive">{form.formState.errors.code.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-company">Company name</Label>
              <Input id="cust-company" {...form.register('companyName')} />
              {form.formState.errors.companyName ? (
                <p className="text-xs text-destructive">{form.formState.errors.companyName.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-contact">Contact person</Label>
              <Input id="cust-contact" {...form.register('contactPerson')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-phone">Phone</Label>
              <Input id="cust-phone" {...form.register('phone')} />
              {form.formState.errors.phone ? <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cust-tax">Tax number</Label>
            <Input id="cust-tax" placeholder="Required before a contract can be activated" {...form.register('taxNumber')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cust-address">Address</Label>
            <Textarea id="cust-address" rows={2} {...form.register('address')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? 'Save changes' : 'Add customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
