import { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';
import type { BillingMethod } from './contract-item.model.js';

export type ContractStatus = 'Draft' | 'Active' | 'Expired' | 'Cancelled';
/** The contract-level default billing method — reuses the same enum as ContractItem. */
export type RentalMethod = BillingMethod;

const RENTAL_METHODS: RentalMethod[] = ['monthly', 'daily', 'weekly', 'hourly'];
const CONTRACT_STATUSES: ContractStatus[] = ['Draft', 'Active', 'Expired', 'Cancelled'];

export interface ContractInsurance {
  provider: string;
  policyNumber: string;
  amount: Types.Decimal128;
}

/** `_id` is declared explicitly — see the comment in `modules/roles/role.model.ts`. */
export interface RentalContractAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  number: string;
  customerId: Types.ObjectId;
  projectId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  rentalMethod: RentalMethod;
  status: ContractStatus;
  insurance: ContractInsurance;
  cancelReason: string;
}

const contractSchema = createBaseSchema({
  number: { type: String, required: true, trim: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  startDate: { type: Date, required: true },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function validateEndDate(this: { startDate: Date }, value: Date): boolean {
        return value.getTime() >= this.startDate.getTime();
      },
      message: 'endDate must be on or after startDate',
    },
  },
  rentalMethod: { type: String, enum: RENTAL_METHODS, required: true },
  status: { type: String, enum: CONTRACT_STATUSES, default: 'Draft' },
  insurance: {
    provider: { type: String, default: '', trim: true },
    policyNumber: { type: String, default: '', trim: true },
    amount: { type: Schema.Types.Decimal128, default: () => Types.Decimal128.fromString('0') },
  },
  cancelReason: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function validateCancelReason(this: { status: ContractStatus }, value: string): boolean {
        return this.status !== 'Cancelled' || value.trim().length > 0;
      },
      message: 'cancelReason is required when status is Cancelled',
    },
  },
});

contractSchema.index({ number: 1 }, { unique: true, name: 'contracts_number_idx' });
contractSchema.index({ status: 1, startDate: 1, endDate: 1 }, { name: 'contracts_status_dates_idx' });

export type RentalContractDocument = HydratedDocument<RentalContractAttrs>;
export const RentalContractModel: Model<RentalContractAttrs> = model<RentalContractAttrs>(
  'RentalContract',
  contractSchema,
);
