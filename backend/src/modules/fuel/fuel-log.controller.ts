import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { UserModel } from '../users/user.model.js';
import { toDisplayString } from '../../services/money.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { FuelLogService } from './fuel-log.service.js';
import type { FuelLogAttrs } from './fuel-log.model.js';
import { createFuelLogSchema, listFuelLogsQuerySchema } from './fuel-log.validation.js';

const TECHNICIAN_ROLE_NAME = 'Technician';

/** `generatorId`/`projectId` are always populated before this runs — see FuelLogService. */
type PopulatedFuelLog = Omit<FuelLogAttrs, 'generatorId' | 'projectId'> & {
  generatorId: { _id: Types.ObjectId; code: string; normalFuelConsumption: number };
  projectId: { _id: Types.ObjectId; code: string; name: string };
};

function toFuelLogResponse(log: PopulatedFuelLog, extras: { contributingOperationLogIds?: string[] } = {}) {
  return {
    id: String(log._id),
    date: log.date,
    project: { id: String(log.projectId._id), code: log.projectId.code, name: log.projectId.name },
    generator: {
      id: String(log.generatorId._id),
      code: log.generatorId.code,
      normalFuelConsumption: log.generatorId.normalFuelConsumption,
    },
    liters: log.liters,
    pricePerLiter: toDisplayString(log.pricePerLiter),
    totalCost: toDisplayString(log.totalCost),
    operatingHoursRef: log.operatingHoursRef,
    consumptionRate: log.consumptionRate,
    ...(extras.contributingOperationLogIds ? { contributingOperationLogIds: extras.contributingOperationLogIds } : {}),
    createdAt: log.createdAt,
  };
}

/** Section 17: a Technician only sees/lists fuel logs for generators on their own assignment list. */
async function technicianRestriction(req: Request): Promise<string[] | undefined> {
  if (req.user!.role !== TECHNICIAN_ROLE_NAME) return undefined;
  const user = await UserModel.findById(req.user!.id).select('assignedGenerators');
  return (user?.assignedGenerators ?? []).map((id) => String(id));
}

export async function listFuelLogs(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listFuelLogsQuerySchema, req.query);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const result = await FuelLogService.list(query, restrictToGeneratorIds);
  const items = result.items as unknown as PopulatedFuelLog[];
  res.status(200).json(successResponse(items.map((item) => toFuelLogResponse(item)), null, result.meta));
}

export async function getFuelLog(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const { fuelLog, contributingOperationLogIds } = await FuelLogService.getById(id, restrictToGeneratorIds);
  res
    .status(200)
    .json(successResponse(toFuelLogResponse(fuelLog as unknown as PopulatedFuelLog, { contributingOperationLogIds })));
}

export async function createFuelLog(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createFuelLogSchema, req.body);
  const fuelLog = await FuelLogService.create(input, req.user!.id, req.user!.role);
  res.status(201).json(successResponse(toFuelLogResponse(fuelLog as unknown as PopulatedFuelLog)));
}
