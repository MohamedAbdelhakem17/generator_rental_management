import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type ReceiptPaymentMethod = 'Cash' | 'BankTransfer' | 'Cheque' | 'Card';
export type ReceiptStatus = 'Confirmed' | 'Cancelled';

export interface ReceiptAllocation {
  _id?: Types.ObjectId;
  extractId: Types.ObjectId;
  amount: Types.Decimal128;
}

export interface ReceiptAttrs extends TimestampFields {
  _id: Types.ObjectId;
  number: string;
  customerId: Types.ObjectId;
  date: Date;
  amount: Types.Decimal128;
  paymentMethod: ReceiptPaymentMethod;
  account: string;
  transferNumber: string;
  allocations: ReceiptAllocation[];
  status: ReceiptStatus;
  cancelReason: string;
}

const allocationSchema = new Schema<ReceiptAllocation>(
  {
    extractId: { type: Schema.Types.ObjectId, ref: 'Extract', required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
  },
  { timestamps: false },
);

const receiptSchema = new Schema<ReceiptAttrs>(
  {
    number: { type: String, required: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    date: { type: Date, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'BankTransfer', 'Cheque', 'Card'],
      required: true,
    },
    account: { type: String, default: '', trim: true },
    transferNumber: { type: String, default: '', trim: true },
    allocations: { type: [allocationSchema], default: [] },
    status: { type: String, enum: ['Confirmed', 'Cancelled'], default: 'Confirmed' },
    cancelReason: {
      type: String,
      default: '',
      trim: true,
      validate: {
        validator: function validateCancelReason(
          this: { status: ReceiptStatus },
          value: string,
        ): boolean {
          return this.status !== 'Cancelled' || value.trim().length > 0;
        },
        message: 'cancelReason is required when status is Cancelled',
      },
    },
  },
  { timestamps: true },
);

receiptSchema.index({ number: 1 }, { unique: true, name: 'receipts_number_idx' });
receiptSchema.index({ customerId: 1, date: 1 }, { name: 'receipts_customer_date_idx' });

export type ReceiptDocument = HydratedDocument<ReceiptAttrs>;
export const ReceiptModel: Model<ReceiptAttrs> = model<ReceiptAttrs>('Receipt', receiptSchema);
