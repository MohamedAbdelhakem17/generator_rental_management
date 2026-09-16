export type ExpenseStatus = 'Confirmed' | 'Cancelled';

export interface ExpenseRow {
  id: string;
  category: string;
  date: string;
  amount: string;
  generatorId: string | null;
  projectId: string | null;
  description: string;
  allocatedFrom: string | null;
  status: ExpenseStatus;
  createdAt: string;
}
