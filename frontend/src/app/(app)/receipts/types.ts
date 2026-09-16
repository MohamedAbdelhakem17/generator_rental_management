export type ReceiptPaymentMethod = 'Cash' | 'BankTransfer' | 'Cheque' | 'Card';
export type ReceiptStatus = 'Confirmed' | 'Cancelled';

export interface ReceiptAllocation {
  extractId: string;
  amount: string;
}

export interface ReceiptRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: string;
  paymentMethod: ReceiptPaymentMethod;
  account: string;
  transferNumber: string;
  allocations: ReceiptAllocation[];
  status: ReceiptStatus;
  cancelReason: string;
  createdAt: string;
}

/** The subset of an open Extract this module needs to build the allocation table. */
export interface AllocatableExtract {
  id: string;
  number: string;
  finalTotal: string | null;
  collectedAmount: string;
  status: 'Approved' | 'Partially Collected';
}
