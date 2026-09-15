export type ContractStatus = 'Draft' | 'Active' | 'Expired' | 'Cancelled';
export type BillingMethod = 'monthly' | 'daily' | 'weekly' | 'hourly';

export interface ContractRef {
  id: string;
  code: string;
  companyName: string;
}

export interface ContractProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface ContractInsurance {
  provider: string;
  policyNumber: string;
  amount: string;
}

export interface ContractItemRow {
  id: string;
  generatorId: string;
  generatorCode: string;
  billingMethod: BillingMethod;
  unitPrice: string;
  priceSnapshot: string | null;
  isSharedAssignmentException: boolean;
  sharedAssignmentJustification: string;
}

export interface ContractRow {
  id: string;
  number: string;
  customer: ContractRef;
  project: ContractProjectRef;
  startDate: string;
  endDate: string;
  rentalMethod: BillingMethod;
  status: ContractStatus;
  insurance: ContractInsurance;
  cancelReason: string;
  itemCount: number;
  createdAt: string;
}

/** Only present on the detail (`GET /api/contracts/:id`) response, never on list rows. */
export interface ContractDetail extends Omit<ContractRow, 'itemCount'> {
  items: ContractItemRow[];
}
