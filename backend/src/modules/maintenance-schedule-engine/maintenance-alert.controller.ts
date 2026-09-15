import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { UserModel } from '../users/user.model.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { MaintenanceScheduleEngineService } from './service.js';
import type { MaintenanceAlertAttrs } from './maintenance-alert.model.js';
import { listMaintenanceAlertsQuerySchema } from './maintenance-alert.validation.js';

const TECHNICIAN_ROLE_NAME = 'Technician';

/** `generatorId` is always populated before this runs — see MaintenanceScheduleEngineService. */
type PopulatedMaintenanceAlert = Omit<MaintenanceAlertAttrs, 'generatorId'> & {
  generatorId: { _id: Types.ObjectId; code: string };
};

function toMaintenanceAlertResponse(alert: PopulatedMaintenanceAlert) {
  return {
    id: String(alert._id),
    generator: { id: String(alert.generatorId._id), code: alert.generatorId.code },
    level: alert.level,
    status: alert.status,
    dueAtMeter: alert.dueAtMeter,
    currentMeterAtCreation: alert.currentMeterAtCreation,
    resolvedAt: alert.resolvedAt,
    resolvedBy: alert.resolvedBy,
    createdAt: alert.createdAt,
  };
}

/** Section 17: a Technician only sees/acts on generators from their own assignment list. */
async function technicianRestriction(req: Request): Promise<string[] | undefined> {
  if (req.user!.role !== TECHNICIAN_ROLE_NAME) return undefined;
  const user = await UserModel.findById(req.user!.id).select('assignedGenerators');
  return (user?.assignedGenerators ?? []).map((id) => String(id));
}

export async function listMaintenanceAlerts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listMaintenanceAlertsQuerySchema, req.query);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const result = await MaintenanceScheduleEngineService.list(query, restrictToGeneratorIds);
  const items = result.items as unknown as PopulatedMaintenanceAlert[];
  res.status(200).json(successResponse(items.map(toMaintenanceAlertResponse), null, result.meta));
}

export async function acknowledgeMaintenanceAlert(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const alert = await MaintenanceScheduleEngineService.acknowledge(id, req.user!.id, req.user!.role);
  res.status(200).json(successResponse(toMaintenanceAlertResponse(alert as unknown as PopulatedMaintenanceAlert)));
}
