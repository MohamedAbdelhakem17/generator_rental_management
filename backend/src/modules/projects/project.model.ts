import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';

export type ProjectStatus = 'Active' | 'Closed';

/** `_id` is declared explicitly — see the comment in `modules/roles/role.model.ts`. */
export interface ProjectAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  name: string;
  customerId: Types.ObjectId;
  location: string;
  siteManager: string;
  startDate: Date;
  endDate: Date | null;
  status: ProjectStatus;
}

const projectSchema = createBaseSchema({
  code: { type: String, required: true, trim: true, minlength: 1, maxlength: 30 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
  // FR-001: set at creation, never reassigned — `immutable` is defense-in-depth alongside
  // updateProjectSchema (Zod) simply never accepting this field.
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
  location: { type: String, default: '', trim: true, maxlength: 200 },
  siteManager: { type: String, default: '', trim: true, maxlength: 100 },
  startDate: { type: Date, required: true },
  endDate: {
    type: Date,
    default: null,
    validate: {
      validator: function validateEndDate(this: { startDate: Date }, value: Date | null): boolean {
        if (!value) return true;
        return value.getTime() >= this.startDate.getTime();
      },
      message: 'endDate must be on or after startDate',
    },
  },
  status: { type: String, enum: ['Active', 'Closed'], default: 'Active' },
});

projectSchema.index({ code: 1 }, { unique: true, name: 'projects_code_idx' });
projectSchema.index({ customerId: 1, status: 1 }, { name: 'projects_customer_status_idx' });

export type ProjectDocument = HydratedDocument<ProjectAttrs>;
export const ProjectModel: Model<ProjectAttrs> = model<ProjectAttrs>('Project', projectSchema);
