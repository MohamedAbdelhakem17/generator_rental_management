import { Decimal } from 'decimal.js';
import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type BillingMethod = 'monthly' | 'daily' | 'weekly' | 'hourly';

const BILLING_METHODS: BillingMethod[] = ['monthly', 'daily', 'weekly', 'hourly'];

/** `_id` is declared explicitly — see the comment in `modules/roles/role.model.ts`. */
export interface ContractItemAttrs extends TimestampFields {
  _id: Types.ObjectId;
  contractId: Types.ObjectId;
  generatorId: Types.ObjectId;
  billingMethod: BillingMethod;
  unitPrice: Types.Decimal128;
  /** Immutable copy of `unitPrice` taken at activation (TASK-012 Data Model) — never edited. */
  priceSnapshot: Types.Decimal128 | null;
}

const contractItemSchema = new Schema<ContractItemAttrs>(
  {
    contractId: { type: Schema.Types.ObjectId, ref: 'RentalContract', required: true },
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    billingMethod: { type: String, enum: BILLING_METHODS, required: true },
    unitPrice: {
      type: Schema.Types.Decimal128,
      required: true,
      validate: {
        validator: (value: Types.Decimal128) => new Decimal(value.toString()).greaterThan(0),
        message: 'unitPrice must be greater than 0',
      },
    },
    priceSnapshot: { type: Schema.Types.Decimal128, default: null },
  },
  { timestamps: true },
);

contractItemSchema.index({ generatorId: 1, contractId: 1 }, { name: 'contract_items_generator_contract_idx' });

export type ContractItemDocument = HydratedDocument<ContractItemAttrs>;
export const ContractItemModel: Model<ContractItemAttrs> = model<ContractItemAttrs>(
  'ContractItem',
  contractItemSchema,
);
