import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { UserModel } from '../users/user.model.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { OperationLogService } from './operation-log.service.js';
import type { OperationLogAttrs } from './operation-log.model.js';
import {
  correctOperationLogSchema,
  createOperationLogSchema,
  listOperationLogsQuerySchema,
} from './operation-log.validation.js';

const TECHNICIAN_ROLE_NAME = 'Technician';

/** `generatorId`/`projectId` are always populated before this runs — see OperationLogService. */
type PopulatedOperationLog = Omit<OperationLogAttrs, 'generatorId' | 'projectId'> & {
  generatorId: { _id: Types.ObjectId; code: string };
  projectId: { _id: Types.ObjectId; code: string; name: string };
};

function toOperationLogResponse(log: PopulatedOperationLog) {
  return {
    id: String(log._id),
    date: log.date,
    project: { id: String(log.projectId._id), code: log.projectId.code, name: log.projectId.name },
    generator: { id: String(log.generatorId._id), code: log.generatorId.code },
    startMeter: log.startMeter,
    endMeter: log.endMeter,
    operatingHours: log.operatingHours,
    downtimeHours: log.downtimeHours,
    notes: log.notes,
    status: log.status,
    correctionOf: log.correctionOf ? String(log.correctionOf) : null,
    correctionReason: log.correctionReason,
    createdAt: log.createdAt,
  };
}

/** Section 17: a Technician only sees/lists logs for generators on their own assignment list. */
async function technicianRestriction(req: Request): Promise<string[] | undefined> {
  if (req.user!.role !== TECHNICIAN_ROLE_NAME) return undefined;
  const user = await UserModel.findById(req.user!.id).select('assignedGenerators');
  return (user?.assignedGenerators ?? []).map((id) => String(id));
}

export async function listOperationLogs(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listOperationLogsQuerySchema, req.query);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const result = await OperationLogService.list(query, restrictToGeneratorIds);
  const items = result.items as unknown as PopulatedOperationLog[];
  res.status(200).json(successResponse(items.map(toOperationLogResponse), null, result.meta));
}

export async function getOperationLog(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const restrictToGeneratorIds = await technicianRestriction(req);
  const log = await OperationLogService.getById(id, restrictToGeneratorIds);
  res.status(200).json(successResponse(toOperationLogResponse(log as unknown as PopulatedOperationLog)));
}

export async function createOperationLog(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createOperationLogSchema, req.body);
  const log = await OperationLogService.create(input, req.user!.id, req.user!.role);
  res.status(201).json(successResponse(toOperationLogResponse(log as unknown as PopulatedOperationLog)));
}

export async function correctOperationLog(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(correctOperationLogSchema, req.body);
  const log = await OperationLogService.correct(id, input, req.user!.id);
  res.status(200).json(successResponse(toOperationLogResponse(log as unknown as PopulatedOperationLog)));
}
