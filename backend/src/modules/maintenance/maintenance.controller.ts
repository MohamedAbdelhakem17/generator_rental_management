import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { UserModel } from '../users/user.model.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { toDisplayString } from '../../services/money.js';
import { MaintenanceService } from './maintenance.service.js';
import type { MaintenanceAttrs } from './maintenance.model.js';
import {
  cancelMaintenanceSchema,
  listMaintenanceQuerySchema,
  openMaintenanceSchema,
  updateMaintenanceSchema,
} from './maintenance.validation.js';

const TECHNICIAN_ROLE_NAME = 'Technician';

/** `generatorId` is always populated before this runs — see MaintenanceService. */
type PopulatedMaintenance = Omit<MaintenanceAttrs, 'generatorId'> & {
  generatorId: { _id: Types.ObjectId; code: string };
};

function toMaintenanceResponse(record: PopulatedMaintenance) {
  return {
    id: String(record._id),
    generator: { id: String(record.generatorId._id), code: record.generatorId.code },
    type: record.type,
    status: record.status,
    date: record.date,
    meter: record.meter,
    partsCost: toDisplayString(record.partsCost),
    oilCost: toDisplayString(record.oilCost),
    laborCost: toDisplayString(record.laborCost),
    transportCost: toDisplayString(record.transportCost),
    totalCost: toDisplayString(record.totalCost),
    maintenanceCycleOverride: record.maintenanceCycleOverride,
    nextMaintenanceMeter: record.nextMaintenanceMeter,
    notes: record.notes,
    cancelReason: record.cancelReason,
    createdAt: record.createdAt,
  };
}

/** Section 17: a Technician only sees/acts on generators from their own assignment list. */
async function technicianRestriction(req: Request): Promise<string[] | undefined> {
  if (req.user!.role !== TECHNICIAN_ROLE_NAME) return undefined;
  const user = await UserModel.findById(req.user!.id).select('assignedGenerators');
  return (user?.assignedGenerators ?? []).map((id) => String(id));
}

export async function listMaintenance(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listMaintenanceQuerySchema, req.query);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const result = await MaintenanceService.list(query, restrictToGeneratorIds);
  const items = result.items as unknown as PopulatedMaintenance[];
  res.status(200).json(successResponse(items.map(toMaintenanceResponse), null, result.meta));
}

export async function getMaintenance(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const record = await MaintenanceService.getById(id, restrictToGeneratorIds);
  res.status(200).json(successResponse(toMaintenanceResponse(record as unknown as PopulatedMaintenance)));
}

export async function openMaintenance(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(openMaintenanceSchema, req.body);
  const record = await MaintenanceService.open(input, req.user!.id, req.user!.role);
  res.status(201).json(successResponse(toMaintenanceResponse(record as unknown as PopulatedMaintenance)));
}

export async function updateMaintenance(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateMaintenanceSchema, req.body);
  const record = await MaintenanceService.update(id, input, req.user!.id, req.user!.role);
  res.status(200).json(successResponse(toMaintenanceResponse(record as unknown as PopulatedMaintenance)));
}

export async function startMaintenance(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const record = await MaintenanceService.start(id, req.user!.id, req.user!.role);
  res.status(200).json(successResponse(toMaintenanceResponse(record as unknown as PopulatedMaintenance)));
}

export async function completeMaintenance(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const record = await MaintenanceService.complete(id, req.user!.id);
  res.status(200).json(successResponse(toMaintenanceResponse(record as unknown as PopulatedMaintenance)));
}

export async function cancelMaintenance(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(cancelMaintenanceSchema, req.body);
  const record = await MaintenanceService.cancel(id, input, req.user!.id);
  res.status(200).json(successResponse(toMaintenanceResponse(record as unknown as PopulatedMaintenance)));
}
