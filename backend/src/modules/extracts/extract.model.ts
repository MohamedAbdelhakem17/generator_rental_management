import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type ExtractLineItemType = 'rent' | 'transport' | 'services';
export type ExtractStatus = 'Draft' | 'Under Review' | 'Approved' | 'Partially Collected' | 'Collected' | 'Cancelled';

const LINE_ITEM_TYPES: ExtractLineItemType[] = ['rent', 'transport', 'services'];
const EXTRACT_STATUSES: ExtractStatus[] = [
  'Draft',
  'Under Review',
  'Approved',
  'Partially Collected',
  'Collected',
  'Cancelled',
];

export interface ExtractLineItem {
  _id: Types.ObjectId;
  type: ExtractLineItemType;
  description: string;
  amount: Types.Decimal128;
}

export interface ExtractPeriod {
  start: Date;
  end: Date;
}

/**
 * Never soft-deleted (not in CLAUDE.md's explicit soft-delete list) — `status` already
 * carries a terminal `Cancelled` state, the same "lifecycle flag instead of isDeleted"
 * precedent as OperationLog/FuelLog/Maintenance.
 */
export interface ExtractAttrs extends TimestampFields {
  _id: Types.ObjectId;
  number: string;
  customerId: Types.ObjectId;
  projectId: Types.ObjectId;
  contractIds: Types.ObjectId[];
  period: ExtractPeriod;
  lineItems: ExtractLineItem[];
  discounts: Types.Decimal128;
  /** A fraction (e.g. `0.14`), set only at Approval — never the raw settings percent. */
  vatRateSnapshot: number | null;
  vat: Types.Decimal128 | null;
  /** Table's own name for Business Rule 6.7's "Net Before VAT" — kept as the PRD spells it. */
  totalBeforeVat: Types.Decimal128 | null;
  finalTotal: Types.Decimal128 | null;
  status: ExtractStatus;
  collectedAmount: Types.Decimal128;
  cancelReason: string;
  customerNameSnapshot: string;
}

const lineItemSchema = new Schema<ExtractLineItem>(
  {
    type: { type: String, enum: LINE_ITEM_TYPES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Schema.Types.Decimal128, required: true },
  },
  { timestamps: false },
);

const extractSchema = new Schema<ExtractAttrs>(
  {
    number: { type: String, required: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    contractIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'RentalContract' }],
      required: true,
      validate: {
        validator: (value: Types.ObjectId[]) => value.length > 0,
        message: 'At least one contract is required',
      },
    },
    period: {
      start: { type: Date, required: true },
      end: {
        type: Date,
        required: true,
        validate: {
          validator: function validatePeriodEnd(this: { period: ExtractPeriod }, value: Date): boolean {
            return value.getTime() >= this.period.start.getTime();
          },
          message: 'period.end must be on or after period.start',
        },
      },
    },
    lineItems: { type: [lineItemSchema], default: [] },
    discounts: { type: Schema.Types.Decimal128, default: () => '0' },
    vatRateSnapshot: { type: Number, default: null },
    vat: { type: Schema.Types.Decimal128, default: null },
    totalBeforeVat: { type: Schema.Types.Decimal128, default: null },
    finalTotal: { type: Schema.Types.Decimal128, default: null },
    status: { type: String, enum: EXTRACT_STATUSES, default: 'Draft' },
    collectedAmount: { type: Schema.Types.Decimal128, default: () => '0' },
    cancelReason: {
      type: String,
      default: '',
      trim: true,
      validate: {
        validator: function validateCancelReason(this: { status: ExtractStatus }, value: string): boolean {
          return this.status !== 'Cancelled' || value.trim().length > 0;
        },
        message: 'cancelReason is required when status is Cancelled',
      },
    },
    customerNameSnapshot: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

extractSchema.index({ number: 1 }, { unique: true, name: 'extracts_number_idx' });
extractSchema.index({ customerId: 1, status: 1 }, { name: 'extracts_customer_status_idx' });
extractSchema.index({ projectId: 1, 'period.start': 1 }, { name: 'extracts_project_period_idx' });
extractSchema.index(
  { status: 1, 'period.end': 1, customerId: 1 },
  { name: 'extracts_status_period_end_customer_idx' },
);

export type ExtractDocument = HydratedDocument<ExtractAttrs>;
export const ExtractModel: Model<ExtractAttrs> = model<ExtractAttrs>('Extract', extractSchema);
