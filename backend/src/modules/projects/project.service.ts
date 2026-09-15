import { AuditService } from '../audit/audit.service.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { getAssignedGenerators, type AssignedGeneratorSummary } from './assigned-generators.js';
import { findCloseBlockReason } from './close-guards.js';
import { ProjectModel, type ProjectAttrs, type ProjectDocument } from './project.model.js';
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from './project.validation.js';

const ALLOWED_SORT_FIELDS = ['code', 'name', 'startDate', 'createdAt'] as const;
const CUSTOMER_POPULATE = { path: 'customerId', select: 'code companyName' } as const;

function throwIfDuplicateCode(error: unknown): never | void {
  if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
    throw new ConflictError('A project with this code already exists');
  }
  throw error;
}

async function findActiveOrThrow(projectId: string): Promise<ProjectDocument> {
  const project = await ProjectModel.findOne({ _id: projectId, isDeleted: { $ne: true } });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  return project;
}

async function assertCustomerExistsAndActive(customerId: string): Promise<void> {
  const customer = await CustomerModel.findOne({ _id: customerId, isDeleted: { $ne: true }, active: true });
  if (!customer) {
    throw new ValidationError('Validation failed', [
      { field: 'customerId', message: 'Customer does not exist or is inactive' },
    ]);
  }
}

export const ProjectService = {
  async list(options: ListProjectsQuery): Promise<PaginatedResult<ProjectAttrs>> {
    const filters: Record<string, unknown> = {};
    if (options.customerId) filters.customerId = options.customerId;
    if (options.status) filters.status = options.status;

    const result = await paginateQuery(ProjectModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });

    await ProjectModel.populate(result.items, CUSTOMER_POPULATE);
    return result;
  },

  async getById(
    projectId: string,
  ): Promise<{ project: ProjectDocument; assignedGenerators: AssignedGeneratorSummary[] }> {
    const project = await findActiveOrThrow(projectId);
    await project.populate(CUSTOMER_POPULATE);
    const assignedGenerators = await getAssignedGenerators(projectId);
    return { project, assignedGenerators };
  },

  async create(input: CreateProjectInput, actorUserId: string): Promise<ProjectDocument> {
    await assertCustomerExistsAndActive(input.customerId);

    let project: ProjectDocument;
    try {
      project = await ProjectModel.create({
        code: input.code,
        name: input.name,
        customerId: input.customerId,
        location: input.location ?? '',
        siteManager: input.siteManager ?? '',
        startDate: input.startDate,
        endDate: input.endDate ?? null,
      });
    } catch (error) {
      throwIfDuplicateCode(error);
      throw error;
    }

    await AuditService.record({
      action: 'project.create',
      actorUserId,
      entityType: 'Project',
      entityId: String(project._id),
      metadata: { after: project.toObject() },
    });

    await project.populate(CUSTOMER_POPULATE);
    return project;
  },

  async update(projectId: string, input: UpdateProjectInput, actorUserId: string): Promise<ProjectDocument> {
    const project = await findActiveOrThrow(projectId);
    const before = project.toObject();

    if (input.name !== undefined) project.name = input.name;
    if (input.location !== undefined) project.location = input.location;
    if (input.siteManager !== undefined) project.siteManager = input.siteManager;
    if (input.startDate !== undefined) project.startDate = input.startDate;
    if (input.endDate !== undefined) project.endDate = input.endDate;
    if (input.status !== undefined) project.status = input.status;

    // FR-002: re-check against the merged (not just the patched) dates — a PATCH that only
    // sends `endDate` must still be validated against the *persisted* startDate. The Mongoose
    // schema validator (project.model.ts) is the backstop; this is what turns the violation
    // into a proper 422 instead of an uncaught ValidationError.
    if (project.endDate && project.endDate.getTime() < project.startDate.getTime()) {
      throw new ValidationError('Validation failed', [
        { field: 'endDate', message: 'endDate must be on or after startDate' },
      ]);
    }

    try {
      await project.save();
    } catch (error) {
      throwIfDuplicateCode(error);
      throw error;
    }

    await AuditService.record({
      action: 'project.update',
      actorUserId,
      entityType: 'Project',
      entityId: projectId,
      metadata: { before, after: project.toObject() },
    });

    await project.populate(CUSTOMER_POPULATE);
    return project;
  },

  async close(projectId: string, actorUserId: string): Promise<ProjectDocument> {
    const project = await findActiveOrThrow(projectId);

    const blockReason = await findCloseBlockReason(projectId);
    if (blockReason) {
      throw new ConflictError(blockReason);
    }

    const before = { status: project.status };
    project.status = 'Closed';
    await project.save();

    await AuditService.record({
      action: 'project.close',
      actorUserId,
      entityType: 'Project',
      entityId: projectId,
      metadata: { before, after: { status: project.status } },
    });

    await project.populate(CUSTOMER_POPULATE);
    return project;
  },
};
