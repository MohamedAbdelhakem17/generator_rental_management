import { model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';

export type ManualStatus = 'Stopped' | null;
export type GeneratorStatus = 'Available' | 'Rented' | 'Under Maintenance' | 'Stopped';
export type CommercialStatus = 'Assigned' | 'Unassigned';

export interface GeneratorSpecifications {
  kva: number;
  brand: string;
  model: string;
  serialNumber: string;
}

/** `_id` is declared explicitly — see the comment in `modules/roles/role.model.ts`. */
export interface GeneratorAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  specifications: GeneratorSpecifications;
  currentMeter: number;
  location: string;
  normalFuelConsumption: number;
  maintenanceCycleHours: number;
  manualStatus: ManualStatus;
  status: GeneratorStatus;
  commercialStatus: CommercialStatus;
}

const generatorSchema = createBaseSchema({
  code: { type: String, required: true, trim: true, minlength: 2, maxlength: 20 },
  specifications: {
    kva: { type: Number, required: true, min: 0.01 },
    brand: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    model: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    serialNumber: { type: String, required: true, trim: true },
  },
  currentMeter: { type: Number, required: true, default: 0, min: 0 },
  location: { type: String, default: '', trim: true, maxlength: 200 },
  normalFuelConsumption: { type: Number, required: true, min: 0.01 },
  maintenanceCycleHours: { type: Number, required: true, default: 250, min: 0.01 },
  manualStatus: { type: String, enum: ['Stopped', null], default: null },
  status: {
    type: String,
    enum: ['Available', 'Rented', 'Under Maintenance', 'Stopped'],
    default: 'Available',
  },
  commercialStatus: { type: String, enum: ['Assigned', 'Unassigned'], default: 'Unassigned' },
});

generatorSchema.index({ code: 1 }, { unique: true, name: 'generators_code_idx' });
generatorSchema.index(
  { 'specifications.serialNumber': 1 },
  { unique: true, name: 'generators_serial_number_idx' },
);
generatorSchema.index({ status: 1, location: 1 }, { name: 'generators_status_location_idx' });

export type GeneratorDocument = HydratedDocument<GeneratorAttrs>;
export const GeneratorModel: Model<GeneratorAttrs> = model<GeneratorAttrs>('Generator', generatorSchema);
