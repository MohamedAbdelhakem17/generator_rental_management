import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import type { GeneratorAttrs, GeneratorDocument } from './generator.model.js';
import { GeneratorService } from './generator.service.js';
import {
  createGeneratorSchema,
  listGeneratorsQuerySchema,
  meterCorrectionSchema,
  stopGeneratorSchema,
  updateGeneratorSchema,
} from './generator.validation.js';

function toGeneratorResponse(generator: GeneratorAttrs | GeneratorDocument) {
  return {
    id: String(generator._id),
    code: generator.code,
    specifications: generator.specifications,
    currentMeter: generator.currentMeter,
    location: generator.location,
    normalFuelConsumption: generator.normalFuelConsumption,
    maintenanceCycleHours: generator.maintenanceCycleHours,
    manualStatus: generator.manualStatus,
    status: generator.status,
    commercialStatus: generator.commercialStatus,
    createdAt: generator.createdAt,
  };
}

export async function listGenerators(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listGeneratorsQuerySchema, req.query);
  const result = await GeneratorService.list(query);
  res.status(200).json(successResponse(result.items.map(toGeneratorResponse), null, result.meta));
}

export async function getGenerator(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const generator = await GeneratorService.getById(id);
  res.status(200).json(successResponse(toGeneratorResponse(generator)));
}

export async function createGenerator(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createGeneratorSchema, req.body);
  const generator = await GeneratorService.create(input, req.user!.id);
  res.status(201).json(successResponse(toGeneratorResponse(generator)));
}

export async function updateGenerator(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateGeneratorSchema, req.body);
  const generator = await GeneratorService.update(id, input, req.user!.id);
  res.status(200).json(successResponse(toGeneratorResponse(generator)));
}

export async function stopGenerator(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(stopGeneratorSchema, req.body);
  const generator = await GeneratorService.stop(id, input, req.user!.id);
  res.status(200).json(successResponse(toGeneratorResponse(generator)));
}

export async function resumeGenerator(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const generator = await GeneratorService.resume(id, req.user!.id);
  res.status(200).json(successResponse(toGeneratorResponse(generator)));
}

export async function correctGeneratorMeter(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(meterCorrectionSchema, req.body);
  const generator = await GeneratorService.correctMeter(id, input, req.user!.id);
  res.status(200).json(successResponse(toGeneratorResponse(generator)));
}

export async function deleteGenerator(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  await GeneratorService.softDelete(id, req.user!.id);
  res.status(200).json(successResponse(null));
}
