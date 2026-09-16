import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type CreditNoteStatus = 'Confirmed' | 'Cancelled';

export interface CreditNoteAttrs extends TimestampFields {
  _id: Types.ObjectId;
  number: string;
  customerId: Types.ObjectId;
  amount: Types.Decimal128;
  reason: string;
  relatedExtractId?: Types.ObjectId | null;
  status: CreditNoteStatus;
}

const creditNoteSchema = new Schema<CreditNoteAttrs>(
  {
    number: { type: String, required: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    reason: { type: String, required: true, trim: true, minlength: 5 },
    relatedExtractId: { type: Schema.Types.ObjectId, ref: 'Extract', default: null },
    status: { type: String, enum: ['Confirmed', 'Cancelled'], default: 'Confirmed' },
  },
  { timestamps: true },
);

creditNoteSchema.index({ number: 1 }, { unique: true, name: 'credit_notes_number_idx' });

export type CreditNoteDocument = HydratedDocument<CreditNoteAttrs>;
export const CreditNoteModel: Model<CreditNoteAttrs> = model<CreditNoteAttrs>(
  'CreditNote',
  creditNoteSchema,
);
