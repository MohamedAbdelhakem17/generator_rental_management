import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type ExpenseStatus = 'Confirmed' | 'Cancelled';

export interface ExpenseAttrs extends TimestampFields {
  _id: Types.ObjectId;
  category: string;
  date: Date;
  amount: Types.Decimal128;
  generatorId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  description: string;
  allocatedFrom?: Types.ObjectId | null;
  status: ExpenseStatus;
}

const expenseSchema = new Schema<ExpenseAttrs>(
  {
    category: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    allocatedFrom: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },
    status: { type: String, enum: ['Confirmed', 'Cancelled'], default: 'Confirmed' },
  },
  { timestamps: true },
);

expenseSchema.index({ generatorId: 1, date: 1 }, { name: 'expenses_generator_date_idx' });
expenseSchema.index({ projectId: 1, date: 1 }, { name: 'expenses_project_date_idx' });
expenseSchema.index({ category: 1 }, { name: 'expenses_category_idx' });

export type ExpenseDocument = HydratedDocument<ExpenseAttrs>;
export const ExpenseModel: Model<ExpenseAttrs> = model<ExpenseAttrs>('Expense', expenseSchema);
