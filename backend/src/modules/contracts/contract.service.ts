import { AuditService } from '../audit/audit.service.js';
import { ConflictEngineService, type ConflictMatch } from '../contract-conflict-engine/service.js';
import { PricingEngineService } from '../contract-pricing-engine/service.js';
import { CustomerModel } from '../customers/customer.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { StatusEngineService } from '../status-engine/status-engine.service.js';
import { ConflictError, NotFoundError, ValidationError, type FieldError } from '../../utils/AppError.js';
import { toDecimal128, toDisplayString } from '../../services/money.js';
import { paginateQuery } from '../../services/pagination.js';
import { ContractItemModel, type ContractItemDocument } from './contract-item.model.js';
import { nextContractNumber } from './contract-number.js';
import { RentalContractModel, type RentalContractAttrs, type RentalContractDocument } from './contract.model.js';
import type {
  CancelContractInput,
  CheckConflictInput,
  ContractItemInput,
  CreateContractInput,
  ListContractsQuery,
  PreviewRentInput,
  SharedAssignmentOverrideInput,
  UpdateContractInput,
} from './contract.validation.js';

const ALLOWED_SORT_FIELDS = ['number', 'startDate', 'endDate', 'createdAt'] as const;
const CUSTOMER_POPULATE = { path: 'customerId', select: 'code companyName' };
const PROJECT_POPULATE = { path: 'projectId', select: 'code name' };

/**
 * Mongoose's `.populate()` typings resolve to a stricter (`Document[]`-only) overload when
 * given an array of PopulateOptions, which doesn't match `paginateQuery`'s plain-attrs return
 * type — two sequential single-ref calls use the same overload every other module's `.populate`
 * call already relies on (see ProjectService/UserService).
 */
async function populateRefs<T extends { populate: (options: { path: string; select: string }) => Promise<unknown> }>(
  target: T,
): Promise<T> {
  await target.populate(CUSTOMER_POPULATE);
  await target.populate(PROJECT_POPULATE);
  return target;
}

async function populateRefsMany<T extends { _id: unknown }>(model: typeof RentalContractModel, items: T[]): Promise<void> {
  await model.populate(items, CUSTOMER_POPULATE);
  await model.populate(items, PROJECT_POPULATE);
}

export interface ContractListResult {
  items: RentalContractAttrs[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  itemCounts: Record<string, number>;
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  return `${fmt(start)}–${fmt(end)}`;
}

async function findOrThrow(contractId: string): Promise<RentalContractDocument> {
  const contract = await RentalContractModel.findOne({ _id: contractId, isDeleted: { $ne: true } });
  if (!contract) {
    throw new NotFoundError('Contract not found');
  }
  return contract;
}

async function assertCustomerExists(customerId: string): Promise<void> {
  const customer = await CustomerModel.findOne({ _id: customerId, isDeleted: { $ne: true } });
  if (!customer) {
    throw new ValidationError('Validation failed', [{ field: 'customerId', message: 'Customer does not exist' }]);
  }
}

/** Data Model: projectId "ref exists, same customer" — a contract's project must belong to its customer. */
async function assertProjectBelongsToCustomer(projectId: string, customerId: string): Promise<void> {
  const project = await ProjectModel.findOne({ _id: projectId, isDeleted: { $ne: true } });
  if (!project) {
    throw new ValidationError('Validation failed', [{ field: 'projectId', message: 'Project does not exist' }]);
  }
  if (String(project.customerId) !== customerId) {
    throw new ValidationError('Validation failed', [
      { field: 'projectId', message: 'Project does not belong to this customer' },
    ]);
  }
}

async function assertGeneratorsExist(items: ContractItemInput[]): Promise<void> {
  for (const item of items) {
    const generator = await GeneratorModel.findOne({ _id: item.generatorId, isDeleted: { $ne: true } });
    if (!generator) {
      throw new ValidationError('Validation failed', [
        { field: 'items.generatorId', message: `Generator ${item.generatorId} does not exist` },
      ]);
    }
  }
}

/** FR-002: a Draft contract can freely add/remove items — this replaces the full set. */
async function replaceItems(contract: RentalContractDocument, items: ContractItemInput[]): Promise<void> {
  await ContractItemModel.deleteMany({ contractId: contract._id });
  if (items.length === 0) return;

  await ContractItemModel.insertMany(
    items.map((item) => ({
      contractId: contract._id,
      generatorId: item.generatorId,
      billingMethod: item.billingMethod ?? contract.rentalMethod,
      unitPrice: toDecimal128(item.unitPrice),
    })),
  );
}

/**
 * Business Rule 6.1: "an active RentalContract (status = Active, today within [startDate,
 * endDate]) has a ContractItem referencing this generator." Shared by the Status Engine's
 * `ACTIVE_CONTRACT_CHECKS` registration and the Generator module's deactivation guard —
 * both need the exact same answer, so neither re-derives it.
 */
export async function hasActiveContractForGenerator(generatorId: string, today: Date = new Date()): Promise<boolean> {
  const activeContractIds = await RentalContractModel.find({
    status: 'Active',
    startDate: { $lte: today },
    endDate: { $gte: today },
  }).distinct('_id');
  if (activeContractIds.length === 0) return false;

  const count = await ContractItemModel.countDocuments({ generatorId, contractId: { $in: activeContractIds } });
  return count > 0;
}

export const ContractService = {
  async list(options: ListContractsQuery): Promise<ContractListResult> {
    const filters: Record<string, unknown> = {};
    if (options.customerId) filters.customerId = options.customerId;
    if (options.projectId) filters.projectId = options.projectId;
    if (options.status) filters.status = options.status;
    if (options.startDateFrom || options.startDateTo) {
      filters.startDate = {
        ...(options.startDateFrom ? { $gte: options.startDateFrom } : {}),
        ...(options.startDateTo ? { $lte: options.startDateTo } : {}),
      };
    }

    const result = await paginateQuery(RentalContractModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });

    await populateRefsMany(RentalContractModel, result.items);

    const counts = await ContractItemModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { contractId: { $in: result.items.map((item) => item._id) } } },
      { $group: { _id: '$contractId', count: { $sum: 1 } } },
    ]);
    const itemCounts = Object.fromEntries(counts.map((entry) => [String(entry._id), entry.count]));

    return { items: result.items, meta: result.meta, itemCounts };
  },

  async getById(
    contractId: string,
  ): Promise<{ contract: RentalContractDocument; items: ContractItemDocument[] }> {
    const contract = await findOrThrow(contractId);
    await populateRefs(contract);
    const items = await ContractItemModel.find({ contractId }).populate('generatorId', 'code specifications');
    return { contract, items };
  },

  async create(input: CreateContractInput, actorUserId: string): Promise<RentalContractDocument> {
    await assertCustomerExists(input.customerId);
    await assertProjectBelongsToCustomer(input.projectId, input.customerId);
    await assertGeneratorsExist(input.items);

    const number = await nextContractNumber();

    const contract = await RentalContractModel.create({
      number,
      customerId: input.customerId,
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      rentalMethod: input.rentalMethod,
      insurance: {
        provider: input.insurance?.provider ?? '',
        policyNumber: input.insurance?.policyNumber ?? '',
        amount: toDecimal128(input.insurance?.amount ?? 0),
      },
    });

    await replaceItems(contract, input.items);

    await AuditService.record({
      action: 'contract.create',
      actorUserId,
      entityType: 'RentalContract',
      entityId: String(contract._id),
      metadata: { after: contract.toObject() },
    });

    await populateRefs(contract);
    return contract;
  },

  async update(contractId: string, input: UpdateContractInput, actorUserId: string): Promise<RentalContractDocument> {
    const contract = await findOrThrow(contractId);
    if (contract.status !== 'Draft') {
      throw new ConflictError('Only Draft contracts can be edited');
    }
    const before = contract.toObject();

    if (input.startDate !== undefined) contract.startDate = input.startDate;
    if (input.endDate !== undefined) contract.endDate = input.endDate;
    if (input.rentalMethod !== undefined) contract.rentalMethod = input.rentalMethod;
    if (input.insurance?.provider !== undefined) contract.insurance.provider = input.insurance.provider;
    if (input.insurance?.policyNumber !== undefined) contract.insurance.policyNumber = input.insurance.policyNumber;
    if (input.insurance?.amount !== undefined) contract.insurance.amount = toDecimal128(input.insurance.amount);

    if (contract.endDate.getTime() < contract.startDate.getTime()) {
      throw new ValidationError('Validation failed', [
        { field: 'endDate', message: 'endDate must be on or after startDate' },
      ]);
    }

    if (input.items !== undefined) {
      await assertGeneratorsExist(input.items);
    }

    await contract.save();

    if (input.items !== undefined) {
      await replaceItems(contract, input.items);
    }

    await AuditService.record({
      action: 'contract.update',
      actorUserId,
      entityType: 'RentalContract',
      entityId: contractId,
      metadata: { before, after: contract.toObject() },
    });

    await populateRefs(contract);
    return contract;
  },

  async activate(contractId: string, actorUserId: string): Promise<RentalContractDocument> {
    const contract = await findOrThrow(contractId);
    if (contract.status !== 'Draft') {
      throw new ConflictError('Only Draft contracts can be activated');
    }

    const items = await ContractItemModel.find({ contractId });
    if (items.length === 0) {
      throw new ValidationError('Validation failed', [
        { field: 'items', message: 'At least one contract item is required to activate' },
      ]);
    }

    const itemConflicts = await ConflictEngineService.checkContract(contractId);
    if (itemConflicts.length > 0) {
      const generators = await GeneratorModel.find({
        _id: { $in: itemConflicts.map((conflict) => conflict.generatorId) },
      }).select('code');
      const codeById = new Map(generators.map((generator) => [String(generator._id), generator.code]));

      const errors: FieldError[] = itemConflicts.flatMap((itemConflict) =>
        itemConflict.conflicts.map((conflict) => ({
          field: `items[${itemConflict.itemIndex}].generatorId`,
          message: `${codeById.get(itemConflict.generatorId) ?? itemConflict.generatorId} overlaps with Active contract ${conflict.contractNumber} (${formatDateRange(conflict.startDate, conflict.endDate)})`,
        })),
      );

      throw new ConflictError('Conflicting generator assignment', errors);
    }

    contract.status = 'Active';
    await contract.save();

    await Promise.all(
      items.map(async (item) => {
        item.priceSnapshot = item.unitPrice;
        await item.save();
      }),
    );

    await Promise.all(
      items.map((item) =>
        StatusEngineService.recalculate(String(item.generatorId), {
          reason: `Contract ${contract.number} activated`,
          triggeredBy: 'user',
        }),
      ),
    );

    await AuditService.record({
      action: 'contract.activate',
      actorUserId,
      entityType: 'RentalContract',
      entityId: contractId,
      metadata: { itemCount: items.length },
    });

    await populateRefs(contract);
    return contract;
  },

  async cancel(contractId: string, input: CancelContractInput, actorUserId: string): Promise<RentalContractDocument> {
    const contract = await findOrThrow(contractId);
    if (contract.status !== 'Draft' && contract.status !== 'Active') {
      throw new ConflictError('Only Draft or Active contracts can be cancelled');
    }

    const wasActive = contract.status === 'Active';
    const before = { status: contract.status };
    contract.status = 'Cancelled';
    contract.cancelReason = input.reason;
    await contract.save();

    if (wasActive) {
      const items = await ContractItemModel.find({ contractId });
      await Promise.all(
        items.map((item) =>
          StatusEngineService.recalculate(String(item.generatorId), {
            reason: `Contract ${contract.number} cancelled`,
            triggeredBy: 'user',
          }),
        ),
      );
    }

    await AuditService.record({
      action: 'contract.cancel',
      actorUserId,
      entityType: 'RentalContract',
      entityId: contractId,
      metadata: { before, after: { status: contract.status }, reason: input.reason },
    });

    await populateRefs(contract);
    return contract;
  },

  /** TASK-013: the Draft-time soft warning — informational only, never blocks saving. */
  async checkConflict(input: CheckConflictInput): Promise<ConflictMatch[]> {
    return ConflictEngineService.checkGenerator(input.generatorId, input.startDate, input.endDate, {
      excludeContractId: input.excludeContractId,
      includeDraft: true,
    });
  },

  /**
   * TASK-013 FR-004: an Admin-only, justified exception to the conflict hard-block, recorded
   * distinctly on the item (never a normal non-conflicting assignment). Applied to a Draft's
   * item so a retried activation skips that item's conflict check (ConflictEngineService).
   */
  async applySharedAssignmentOverride(
    contractId: string,
    itemId: string,
    input: SharedAssignmentOverrideInput,
    actorUserId: string,
  ): Promise<ContractItemDocument> {
    const contract = await findOrThrow(contractId);
    if (contract.status !== 'Draft') {
      throw new ConflictError('Shared Assignment overrides can only be applied to a Draft contract');
    }

    const item = await ContractItemModel.findOne({ _id: itemId, contractId });
    if (!item) {
      throw new NotFoundError('Contract item not found');
    }

    item.isSharedAssignmentException = true;
    item.sharedAssignmentJustification = input.justification;
    await item.save();

    await AuditService.record({
      action: 'contract.sharedAssignmentOverride',
      actorUserId,
      entityType: 'ContractItem',
      entityId: itemId,
      metadata: { contractId, generatorId: String(item.generatorId), justification: input.justification },
    });

    return item;
  },

  /**
   * TASK-014: preview-only — never creates an Extract. Section 16: a period outside the
   * contract's own dates is rejected; a period that only partially overlaps is clipped to
   * the intersection rather than rejected.
   */
  async previewRent(
    contractId: string,
    input: PreviewRentInput,
  ): Promise<{ generatorId: string; method: string; amount: string; breakdown: Record<string, unknown> }[]> {
    const contract = await findOrThrow(contractId);

    const clippedStart = input.periodStart < contract.startDate ? contract.startDate : input.periodStart;
    const clippedEnd = input.periodEnd > contract.endDate ? contract.endDate : input.periodEnd;
    if (clippedStart > clippedEnd) {
      throw new ValidationError('Validation failed', [
        { field: 'periodStart', message: "The period falls entirely outside the contract's date range" },
      ]);
    }

    const items = await ContractItemModel.find({ contractId });

    return Promise.all(
      items.map(async (item) => {
        const { amount, breakdown } = await PricingEngineService.calculateRent(
          {
            generatorId: String(item.generatorId),
            projectId: String(contract.projectId),
            billingMethod: item.billingMethod,
            unitPrice: item.unitPrice,
          },
          clippedStart,
          clippedEnd,
        );

        return {
          generatorId: String(item.generatorId),
          method: item.billingMethod,
          amount: toDisplayString(amount),
          breakdown,
        };
      }),
    );
  },
};
