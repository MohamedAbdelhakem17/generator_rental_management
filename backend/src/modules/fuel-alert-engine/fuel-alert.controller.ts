import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { UserModel } from '../users/user.model.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { FuelAlertEngineService } from './service.js';
import type { FuelAlertAttrs } from './fuel-alert.model.js';
import { listFuelAlertsQuerySchema, resolveFuelAlertSchema } from './fuel-alert.validation.js';

const TECHNICIAN_ROLE_NAME = 'Technician';

/** `generatorId` is always populated before this runs — see FuelAlertEngineService. */
type PopulatedFuelAlert = Omit<FuelAlertAttrs, 'generatorId'> & { generatorId: { _id: Types.ObjectId; code: string } };

function toFuelAlertResponse(alert: PopulatedFuelAlert) {
  return {
    id: String(alert._id),
    generator: { id: String(alert.generatorId._id), code: alert.generatorId.code },
    severity: alert.severity,
    status: alert.status,
    firstOccurrenceAt: alert.firstOccurrenceAt,
    lastOccurrenceAt: alert.lastOccurrenceAt,
    occurrenceCount: alert.occurrenceCount,
    triggeringFuelLogId: String(alert.triggeringFuelLogId),
    resolutionNote: alert.resolutionNote,
    resolvedAt: alert.resolvedAt,
    resolvedBy: alert.resolvedBy,
    createdAt: alert.createdAt,
  };
}

/** Section 17: a Technician only sees/acts on alerts for generators on their own assignment list. */
async function technicianRestriction(req: Request): Promise<string[] | undefined> {
  if (req.user!.role !== TECHNICIAN_ROLE_NAME) return undefined;
  const user = await UserModel.findById(req.user!.id).select('assignedGenerators');
  return (user?.assignedGenerators ?? []).map((id) => String(id));
}

export async function listFuelAlerts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listFuelAlertsQuerySchema, req.query);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const result = await FuelAlertEngineService.list(query, restrictToGeneratorIds);
  const items = result.items as unknown as PopulatedFuelAlert[];
  res.status(200).json(successResponse(items.map(toFuelAlertResponse), null, result.meta));
}

export async function acknowledgeFuelAlert(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const alert = await FuelAlertEngineService.acknowledge(id, req.user!.id, req.user!.role);
  res.status(200).json(successResponse(toFuelAlertResponse(alert as unknown as PopulatedFuelAlert)));
}

export async function resolveFuelAlert(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(resolveFuelAlertSchema, req.body);
  const alert = await FuelAlertEngineService.resolve(id, input, req.user!.id);
  res.status(200).json(successResponse(toFuelAlertResponse(alert as unknown as PopulatedFuelAlert)));
}
