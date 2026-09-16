import { Decimal } from 'decimal.js';
import { startSession, type ClientSession } from 'mongoose';

async function runAtomicOrFallback<T>(
  work: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  const session = await startSession();

  try {
    try {
      return await session.withTransaction(async () => work(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('replica set member or mongos')) {
        throw error;
      }
      return work(null);
    }
  } finally {
    await session.endSession();
  }
}

import { toDecimal, toDecimal128, type MoneyInput } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel, type ExtractDocument } from '../extracts/extract.model.js';
import { nextReceiptNumber } from './receipt-number.js';
import { ReceiptModel, type ReceiptAttrs, type ReceiptDocument } from './receipt.model.js';
import type {
  CancelReceiptInput,
  CreateReceiptInput,
  ListReceiptsQuery,
} from './receipt.validation.js';

const ALLOWED_SORT_FIELDS = ['date', 'createdAt'] as const;

function clampAmount(amount: MoneyInput): Decimal {
  return toDecimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

async function assertCustomerExists(customerId: string): Promise<void> {
  const customer = await CustomerModel.findOne({ _id: customerId, isDeleted: { $ne: true } });
  if (!customer) {
    throw new ValidationError('Validation failed', [
      { field: 'customerId', message: 'Customer does not exist' },
    ]);
  }
}

function getRemainingBalance(extract: ExtractDocument): Decimal {
  const total = toDecimal(extract.finalTotal ?? '0');
  const collected = toDecimal(extract.collectedAmount ?? '0');
  return total.minus(collected);
}

export const ReceiptService = {
  async list(options: ListReceiptsQuery): Promise<PaginatedResult<ReceiptAttrs>> {
    const filters: Record<string, unknown> = {};
    if (options.customerId) filters.customerId = options.customerId;
    if (options.paymentMethod) filters.paymentMethod = options.paymentMethod;
    if (options.dateFrom || options.dateTo) {
      filters.date = {
        ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
        ...(options.dateTo ? { $lte: options.dateTo } : {}),
      };
    }

    const result = await paginateQuery(ReceiptModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-date',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    return result;
  },

  async getById(receiptId: string): Promise<ReceiptDocument> {
    const receipt = await ReceiptModel.findById(receiptId);
    if (!receipt) {
      throw new NotFoundError('Receipt not found');
    }
    return receipt;
  },

  async create(input: CreateReceiptInput, actorUserId: string): Promise<ReceiptDocument> {
    await assertCustomerExists(input.customerId);

    const totalAllocated = input.allocations.reduce(
      (sum, allocation) => sum.plus(clampAmount(allocation.amount)),
      new Decimal(0),
    );
    const receiptTotal = clampAmount(input.amount);
    if (totalAllocated.greaterThan(receiptTotal)) {
      throw new ValidationError('Validation failed', [
        { field: 'allocations', message: 'Allocation total cannot exceed receipt amount' },
      ]);
    }

    let receipt: ReceiptDocument | null = null;

    await runAtomicOrFallback(async (session) => {
      const uniqueExtractIds = new Set<string>();
      for (const allocation of input.allocations) {
        uniqueExtractIds.add(allocation.extractId);
      }

      const extracts = await ExtractModel.find({
        _id: { $in: Array.from(uniqueExtractIds) },
      }).session(session);
      const extractedMap = new Map(extracts.map((extract) => [String(extract._id), extract]));

      for (const allocation of input.allocations) {
        const extract = extractedMap.get(allocation.extractId);
        if (!extract) {
          throw new ValidationError('Validation failed', [
            { field: 'allocations', message: 'One or more extracts are not allocatable' },
          ]);
        }
        const remaining = getRemainingBalance(extract);
        if (clampAmount(allocation.amount).greaterThan(remaining)) {
          throw new ValidationError('Allocation exceeds remaining balance', [
            {
              field: 'allocations',
              message: `Allocation exceeds the remaining balance for extract ${extract.number}`,
            },
          ]);
        }
      }

      const number = await nextReceiptNumber();
      const created = await ReceiptModel.create(
        [
          {
            number,
            customerId: input.customerId,
            date: input.date,
            amount: toDecimal128(receiptTotal),
            paymentMethod: input.paymentMethod,
            account: input.account ?? '',
            transferNumber: input.transferNumber ?? '',
            allocations: input.allocations.map((allocation) => ({
              extractId: allocation.extractId,
              amount: toDecimal128(allocation.amount),
            })),
          },
        ],
        session ? { session } : undefined,
      );

      const createdReceipt = created[0];
      if (!createdReceipt) {
        throw new Error('Receipt creation failed');
      }
      receipt = createdReceipt;
      for (const allocation of input.allocations) {
        const extract = extractedMap.get(allocation.extractId)!;
        const newCollected = clampAmount(extract.collectedAmount).plus(
          clampAmount(allocation.amount),
        );
        extract.collectedAmount = toDecimal128(newCollected);
        extract.status = newCollected.greaterThanOrEqualTo(toDecimal(extract.finalTotal ?? '0'))
          ? 'Collected'
          : 'Partially Collected';
        await extract.save(session ? { session } : undefined);
      }

      await AuditService.record({
        action: 'receipt.create',
        actorUserId,
        entityType: 'Receipt',
        entityId: String(receipt._id),
        metadata: { after: receipt.toObject() },
      });
    });

    if (!receipt) {
      throw new Error('Receipt creation failed');
    }
    return receipt;
  },

  async cancel(
    receiptId: string,
    input: CancelReceiptInput,
    actorUserId: string,
  ): Promise<ReceiptDocument> {
    const receipt = await ReceiptModel.findById(receiptId);
    if (!receipt) {
      throw new NotFoundError('Receipt not found');
    }
    if (receipt.status === 'Cancelled') {
      throw new ForbiddenError('This receipt has already been cancelled');
    }

    await runAtomicOrFallback(async (session) => {
      const extractIds = receipt.allocations.map((allocation) => String(allocation.extractId));
      const extracts = await ExtractModel.find({ _id: { $in: extractIds } }).session(session);
      const map = new Map(extracts.map((extract) => [String(extract._id), extract]));

      for (const allocation of receipt.allocations) {
        const extract = map.get(String(allocation.extractId));
        if (!extract) continue;
        const newCollected = clampAmount(extract.collectedAmount).minus(
          clampAmount(allocation.amount),
        );
        extract.collectedAmount = toDecimal128(newCollected);
        extract.status = newCollected.greaterThan(0) ? 'Partially Collected' : 'Approved';
        await extract.save(session ? { session } : undefined);
      }

      receipt.status = 'Cancelled';
      receipt.cancelReason = input.reason;
      await receipt.save(session ? { session } : undefined);

      await AuditService.record({
        action: 'receipt.cancel',
        actorUserId,
        entityType: 'Receipt',
        entityId: String(receipt._id),
        metadata: { reason: input.reason },
      });
    });

    return receipt;
  },
};
