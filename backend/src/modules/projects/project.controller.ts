import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import type { AssignedGeneratorSummary } from './assigned-generators.js';
import type { ProjectAttrs } from './project.model.js';
import { ProjectService } from './project.service.js';
import { createProjectSchema, listProjectsQuerySchema, updateProjectSchema } from './project.validation.js';

/** `customerId` is always populated with at least `code`/`companyName` before this runs — see ProjectService. */
type PopulatedProject = Omit<ProjectAttrs, 'customerId'> & {
  customerId: { _id: Types.ObjectId; code: string; companyName: string };
};

function toProjectResponse(project: PopulatedProject, assignedGenerators?: AssignedGeneratorSummary[]) {
  return {
    id: String(project._id),
    code: project.code,
    name: project.name,
    customer: {
      id: String(project.customerId._id),
      code: project.customerId.code,
      companyName: project.customerId.companyName,
    },
    location: project.location,
    siteManager: project.siteManager,
    startDate: project.startDate,
    endDate: project.endDate,
    status: project.status,
    ...(assignedGenerators !== undefined ? { assignedGenerators } : {}),
    createdAt: project.createdAt,
  };
}

export async function listProjects(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listProjectsQuerySchema, req.query);
  const result = await ProjectService.list(query);
  // Populated by ProjectService.list — the static ProjectAttrs type still says `customerId: ObjectId`.
  const items = result.items as unknown as PopulatedProject[];
  res.status(200).json(successResponse(items.map((item) => toProjectResponse(item)), null, result.meta));
}

export async function getProject(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const { project, assignedGenerators } = await ProjectService.getById(id);
  res.status(200).json(successResponse(toProjectResponse(project as unknown as PopulatedProject, assignedGenerators)));
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createProjectSchema, req.body);
  const project = await ProjectService.create(input, req.user!.id);
  res.status(201).json(successResponse(toProjectResponse(project as unknown as PopulatedProject)));
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateProjectSchema, req.body);
  const project = await ProjectService.update(id, input, req.user!.id);
  res.status(200).json(successResponse(toProjectResponse(project as unknown as PopulatedProject)));
}

export async function closeProject(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const project = await ProjectService.close(id, req.user!.id);
  res.status(200).json(successResponse(toProjectResponse(project as unknown as PopulatedProject)));
}
