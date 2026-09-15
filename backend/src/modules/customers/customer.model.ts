import { model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';

/** `_id` is declared explicitly — see the comment in `modules/roles/role.model.ts`. */
export interface CustomerAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  taxNumber: string;
  address: string;
  active: boolean;
}

const customerSchema = createBaseSchema({
  code: { type: String, required: true, trim: true, minlength: 1, maxlength: 30 },
  companyName: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
  contactPerson: { type: String, default: '', trim: true, maxlength: 100 },
  phone: { type: String, default: '', trim: true, maxlength: 30 },
  taxNumber: { type: String, default: '', trim: true, maxlength: 30 },
  address: { type: String, default: '', trim: true, maxlength: 300 },
  active: { type: Boolean, default: true },
});

customerSchema.index({ code: 1 }, { unique: true, name: 'customers_code_idx' });

export type CustomerDocument = HydratedDocument<CustomerAttrs>;
export const CustomerModel: Model<CustomerAttrs> = model<CustomerAttrs>('Customer', customerSchema);
