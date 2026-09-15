export type ExtractLineItemType = 'rent' | 'transport' | 'services';
export type ExtractStatus = 'Draft' | 'Under Review' | 'Approved' | 'Partially Collected' | 'Collected' | 'Cancelled';

export interface ExtractLineItem {
  id: string;
  type: ExtractLineItemType;
  description: string;
  amount: string;
}

export interface ExtractPeriod {
  start: string;
  end: string;
}

export interface ExtractRow {
  id: string;
  number: string;
  customer: { id: string; companyName: string };
  project: { id: string; code: string; name: string };
  contractIds: string[];
  period: ExtractPeriod;
  lineItems: ExtractLineItem[];
  discounts: string;
  vatRateSnapshot: number | null;
  vat: string | null;
  totalBeforeVat: string | null;
  finalTotal: string | null;
  status: ExtractStatus;
  collectedAmount: string;
  cancelReason: string;
  customerNameSnapshot: string;
  createdAt: string;
}

export interface PreviewTotals {
  totalWork: string;
  netBeforeVat: string;
  vat: string;
  finalTotal: string;
  vatRateUsed: number;
}
