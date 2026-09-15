import { Decimal } from 'decimal.js';
import type { Types } from 'mongoose';

import { AuditService } from '../audit/audit.service.js';
import { CustomerModel } from '../customers/customer.model.js';
import { RentalContractModel } from '../contracts/contract.model.js';
import { FinancialEngineService } from '../financial-engine/service.js';
import { ProjectModel } from '../projects/project.model.js';
import { SINGLETON_KEY, SystemSettingModel } from '../settings/systemSetting.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal, toDecimal128, type MoneyInput } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { nextExtractNumber } from './extract-number.js';
import { ExtractModel, type ExtractAttrs, type ExtractDocument, type ExtractLineItemType } from './extract.model.js';
import type { CancelExtractInput, CreateExtractInput, ListExtractsQuery, UpdateExtractInput } from './extract.validation.js';

export interface ExtractDisplayTotals {
  netBeforeVat: Types.Decimal128;
  vat: Types.Decimal128;
  finalTotal: Types.Decimal128;
}

const ALLOWED_SORT_FIELDS = ['number', 'createdAt'] as const;
const EDITABLE_STATUSES = ['Draft', 'Under Review'] as const;
const CUSTOMER_POPULATE = { path: 'customerId', select: 'companyName' };
const PROJECT_POPULATE = { path: 'projectId', select: 'code name' };

async function populateRefs<T extends { populate: (options: { path: string; select: string }) => Promise<unknown> }>(
  target: T,
): Promise<T> {
  await target.populate(CUSTOMER_POPULATE);
  await target.populate(PROJECT_POPULATE);
  return target;
}

async function populateRefsMany<T extends { _id: unknown }>(items: T[]): Promise<void> {
  await ExtractModel.populate(items, CUSTOMER_POPULATE);
  await ExtractModel.populate(items, PROJECT_POPULATE);
}

async function assertCustomerExists(customerId: string) {
  const customer = await CustomerModel.findOne({ _id: customerId, isDeleted: { $ne: true } });
  if (!customer) {
    throw new ValidationError('Validation failed', [{ field: 'customerId', message: 'Customer does not exist' }]);
  }
  return customer;
}

async function assertProjectExists(projectId: string): Promise<void> {
  const project = await ProjectModel.findOne({ _id: projectId, isDeleted: { $ne: true } });
  if (!project) {
    throw new ValidationError('Validation failed', [{ field: 'projectId', message: 'Project does not exist' }]);
  }
}

/** Section 10 "ref exists" — extended to also require each contract actually belongs to the
 * selected customer/project, since an Extract billing a customer for someone else's contract
 * would be a silent data-integrity bug, not a legitimate use case. */
async function assertContractsExist(contractIds: string[], customerId: string, projectId: string): Promise<void> {
  const contracts = await RentalContractModel.find({ _id: { $in: contractIds }, isDeleted: { $ne: true } });
  if (contracts.length !== contractIds.length) {
    throw new ValidationError('Validation failed', [{ field: 'contractIds', message: 'One or more contracts do not exist' }]);
  }
  const mismatched = contracts.some(
    (contract) => String(contract.customerId) !== customerId || String(contract.projectId) !== projectId,
  );
  if (mismatched) {
    throw new ValidationError('Validation failed', [
      { field: 'contractIds', message: 'Contracts must belong to the selected customer and project' },
    ]);
  }
}

function sumLineItemsByType<T extends { type: ExtractLineItemType; amount: MoneyInput }>(
  lineItems: T[],
  type: ExtractLineItemType,
): Decimal {
  return lineItems.filter((item) => item.type === type).reduce((sum, item) => sum.plus(toDecimal(item.amount)), new Decimal(0));
}

/** FR-002 reused as a pure validation gate at Draft/Under Review save time too (Section 16/19)
 * — `vatRate: 0` since the live/snapshot rate is irrelevant to whether discounts fit. */
function assertDiscountsWithinTotalWork<T extends { type: ExtractLineItemType; amount: MoneyInput }>(
  lineItems: T[],
  discounts: MoneyInput,
): void {
  const rent = sumLineItemsByType(lineItems, 'rent');
  const transport = sumLineItemsByType(lineItems, 'transport');
  const services = sumLineItemsByType(lineItems, 'services');
  FinancialEngineService.calculateExtractTotals({ rent, transport, services, discounts, vatRate: 0 });
}

function assertEditable(extract: ExtractDocument): void {
  if (!EDITABLE_STATUSES.includes(extract.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new ConflictError('This extract is locked — cancel and reissue a new Draft instead of editing it directly');
  }
}

async function getLiveVatRateFraction(): Promise<Decimal> {
  const settings = await SystemSettingModel.findOne({ key: SINGLETON_KEY });
  if (!settings) {
    throw new Error('SystemSetting has not been seeded — run the baseline seed');
  }
  return toDecimal(settings.vatRatePercent).dividedBy(100);
}

export const ExtractService = {
  async list(options: ListExtractsQuery): Promise<PaginatedResult<ExtractAttrs>> {
    const filters: Record<string, unknown> = {};
    if (options.customerId) filters.customerId = options.customerId;
    if (options.projectId) filters.projectId = options.projectId;
    if (options.status) filters.status = options.status;
    if (options.dateFrom || options.dateTo) {
      filters['period.start'] = {
        ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
        ...(options.dateTo ? { $lte: options.dateTo } : {}),
      };
    }

    const result = await paginateQuery(ExtractModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-createdAt',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    await populateRefsMany(result.items);
    return result;
  },

  async getById(extractId: string): Promise<ExtractDocument> {
    const extract = await ExtractModel.findById(extractId);
    if (!extract) {
      throw new NotFoundError('Extract not found');
    }
    await populateRefs(extract);
    return extract;
  },

  getLiveVatRateFraction,

  /** Draft/Under Review extracts have no persisted vat/totalBeforeVat/finalTotal (FR-003) —
   * this derives a live preview from the current line items and settings so list/detail
   * responses always have a "total" to show (Section 14), without ever writing it back. A
   * data-inconsistent Draft (discounts > totalWork, which create()/update() already reject)
   * must never crash a read, so a computation failure falls back to `null`s. */
  async deriveDisplayTotals(
    extract: Pick<ExtractAttrs, 'status' | 'lineItems' | 'discounts' | 'totalBeforeVat' | 'vat' | 'finalTotal'>,
    vatRateFraction: Decimal,
  ): Promise<ExtractDisplayTotals | null> {
    if (extract.status !== 'Draft' && extract.status !== 'Under Review') {
      return { netBeforeVat: extract.totalBeforeVat!, vat: extract.vat!, finalTotal: extract.finalTotal! };
    }
    try {
      const rent = sumLineItemsByType(extract.lineItems, 'rent');
      const transport = sumLineItemsByType(extract.lineItems, 'transport');
      const services = sumLineItemsByType(extract.lineItems, 'services');
      const totals = FinancialEngineService.calculateExtractTotals({
        rent,
        transport,
        services,
        discounts: extract.discounts,
        vatRate: vatRateFraction,
      });
      return { netBeforeVat: totals.netBeforeVat, vat: totals.vat, finalTotal: totals.finalTotal };
    } catch {
      return null;
    }
  },

  async create(input: CreateExtractInput, actorUserId: string): Promise<ExtractDocument> {
    await assertCustomerExists(input.customerId);
    await assertProjectExists(input.projectId);
    await assertContractsExist(input.contractIds, input.customerId, input.projectId);

    const lineItems = input.lineItems ?? [];
    const discounts = input.discounts ?? 0;
    assertDiscountsWithinTotalWork(lineItems, discounts);

    const number = await nextExtractNumber();
    const extract = await ExtractModel.create({
      number,
      customerId: input.customerId,
      projectId: input.projectId,
      contractIds: input.contractIds,
      period: input.period,
      lineItems: lineItems.map((item) => ({ type: item.type, description: item.description, amount: toDecimal128(item.amount) })),
      discounts: toDecimal128(discounts),
    });

    await AuditService.record({
      action: 'extract.create',
      actorUserId,
      entityType: 'Extract',
      entityId: String(extract._id),
      metadata: { after: extract.toObject() },
    });

    await populateRefs(extract);
    return extract;
  },

  /** FR-002: only while Draft/Under Review — an Approved+ extract is never directly edited. */
  async update(extractId: string, input: UpdateExtractInput, actorUserId: string): Promise<ExtractDocument> {
    const extract = await ExtractModel.findById(extractId);
    if (!extract) {
      throw new NotFoundError('Extract not found');
    }
    assertEditable(extract);

    const before = extract.toObject();

    const nextCustomerId = input.customerId ?? String(extract.customerId);
    const nextProjectId = input.projectId ?? String(extract.projectId);

    if (input.customerId !== undefined) {
      await assertCustomerExists(input.customerId);
      extract.customerId = input.customerId as unknown as ExtractDocument['customerId'];
    }
    if (input.projectId !== undefined) {
      await assertProjectExists(input.projectId);
      extract.projectId = input.projectId as unknown as ExtractDocument['projectId'];
    }
    if (input.contractIds !== undefined) {
      await assertContractsExist(input.contractIds, nextCustomerId, nextProjectId);
      extract.contractIds = input.contractIds as unknown as ExtractDocument['contractIds'];
    }
    if (input.period !== undefined) {
      extract.period = input.period;
    }
    if (input.lineItems !== undefined) {
      extract.lineItems = input.lineItems.map((item) => ({
        type: item.type,
        description: item.description,
        amount: toDecimal128(item.amount),
      })) as unknown as ExtractDocument['lineItems'];
    }
    if (input.discounts !== undefined) {
      extract.discounts = toDecimal128(input.discounts);
    }

    assertDiscountsWithinTotalWork(extract.lineItems, extract.discounts);

    await extract.save();

    await AuditService.record({
      action: 'extract.update',
      actorUserId,
      entityType: 'Extract',
      entityId: String(extract._id),
      metadata: { before, after: extract.toObject() },
    });

    await populateRefs(extract);
    return extract;
  },

  /** FR-002/Section 16: Draft -> Under Review, gated on having at least one line item. */
  async submitReview(extractId: string, actorUserId: string): Promise<ExtractDocument> {
    const extract = await ExtractModel.findById(extractId);
    if (!extract) {
      throw new NotFoundError('Extract not found');
    }
    if (extract.status !== 'Draft') {
      throw new ConflictError('Only a Draft extract can be submitted for review');
    }
    if (extract.lineItems.length === 0) {
      throw new ConflictError('At least one line item is required to submit for review');
    }

    extract.status = 'Under Review';
    await extract.save();

    await AuditService.record({
      action: 'extract.submitReview',
      actorUserId,
      entityType: 'Extract',
      entityId: String(extract._id),
      metadata: {},
    });

    await populateRefs(extract);
    return extract;
  },

  /** FR-003: Under Review -> Approved, snapshotting VAT and locking all financial fields. */
  async approve(extractId: string, actorUserId: string): Promise<ExtractDocument> {
    const extract = await ExtractModel.findById(extractId);
    if (!extract) {
      throw new NotFoundError('Extract not found');
    }
    if (extract.status !== 'Under Review') {
      throw new ConflictError('Only an extract Under Review can be approved');
    }
    if (extract.lineItems.length === 0) {
      throw new ConflictError('Cannot approve an extract with no line items');
    }

    const customer = await CustomerModel.findById(extract.customerId);
    const vatRateFraction = await getLiveVatRateFraction();
    const rent = sumLineItemsByType(extract.lineItems, 'rent');
    const transport = sumLineItemsByType(extract.lineItems, 'transport');
    const services = sumLineItemsByType(extract.lineItems, 'services');
    const totals = FinancialEngineService.calculateExtractTotals({
      rent,
      transport,
      services,
      discounts: extract.discounts,
      vatRate: vatRateFraction,
    });

    extract.vatRateSnapshot = vatRateFraction.toNumber();
    extract.totalBeforeVat = totals.netBeforeVat;
    extract.vat = totals.vat;
    extract.finalTotal = totals.finalTotal;
    extract.customerNameSnapshot = customer?.companyName ?? '';
    extract.status = 'Approved';
    await extract.save();

    await AuditService.record({
      action: 'extract.approve',
      actorUserId,
      entityType: 'Extract',
      entityId: String(extract._id),
      metadata: { vatRateSnapshot: extract.vatRateSnapshot, finalTotal: totals.finalTotal.toString() },
    });

    await populateRefs(extract);
    return extract;
  },

  /** Section 20: blocked once collectedAmount > 0 — a partially/fully collected extract must
   * go through a Credit Note correction (TASK-022+), not a raw cancellation. */
  async cancel(extractId: string, input: CancelExtractInput, actorUserId: string): Promise<ExtractDocument> {
    const extract = await ExtractModel.findById(extractId);
    if (!extract) {
      throw new NotFoundError('Extract not found');
    }
    if (extract.status === 'Cancelled') {
      throw new ConflictError('This extract is already Cancelled');
    }
    if (toDecimal(extract.collectedAmount).greaterThan(0)) {
      throw new ConflictError('An extract with collected amounts must be corrected via a credit note, not cancelled directly');
    }

    extract.status = 'Cancelled';
    extract.cancelReason = input.reason;
    await extract.save();

    await AuditService.record({
      action: 'extract.cancel',
      actorUserId,
      entityType: 'Extract',
      entityId: String(extract._id),
      metadata: { reason: input.reason },
    });

    await populateRefs(extract);
    return extract;
  },
};
