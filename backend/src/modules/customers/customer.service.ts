import { AuditService } from '../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { findDeactivationBlockReason } from './deactivation-guards.js';
import { CustomerModel, type CustomerAttrs, type CustomerDocument } from './customer.model.js';
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from './customer.validation.js';

const ALLOWED_SORT_FIELDS = ['code', 'companyName', 'createdAt'] as const;

function throwIfDuplicateCode(error: unknown): never | void {
  if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
    throw new ConflictError('A customer with this code already exists');
  }
  throw error;
}

async function findActiveOrThrow(customerId: string): Promise<CustomerDocument> {
  const customer = await CustomerModel.findOne({ _id: customerId, isDeleted: { $ne: true } });
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }
  return customer;
}

export const CustomerService = {
  async list(options: ListCustomersQuery): Promise<PaginatedResult<CustomerAttrs>> {
    const filters: Record<string, unknown> = {};

    if (options.search) {
      filters.$or = [
        { code: { $regex: options.search, $options: 'i' } },
        { companyName: { $regex: options.search, $options: 'i' } },
        { contactPerson: { $regex: options.search, $options: 'i' } },
        { taxNumber: { $regex: options.search, $options: 'i' } },
      ];
    }
    if (options.active !== undefined) {
      filters.active = options.active;
    }

    return paginateQuery(CustomerModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
  },

  async getById(customerId: string): Promise<CustomerDocument> {
    return findActiveOrThrow(customerId);
  },

  async create(input: CreateCustomerInput, actorUserId: string): Promise<CustomerDocument> {
    let customer: CustomerDocument;
    try {
      customer = await CustomerModel.create({
        code: input.code,
        companyName: input.companyName,
        contactPerson: input.contactPerson ?? '',
        phone: input.phone ?? '',
        taxNumber: input.taxNumber ?? '',
        address: input.address ?? '',
        active: input.active ?? true,
      });
    } catch (error) {
      throwIfDuplicateCode(error);
      throw error;
    }

    await AuditService.record({
      action: 'customer.create',
      actorUserId,
      entityType: 'Customer',
      entityId: String(customer._id),
      metadata: { after: customer.toObject() },
    });

    return customer;
  },

  async update(customerId: string, input: UpdateCustomerInput, actorUserId: string): Promise<CustomerDocument> {
    const customer = await findActiveOrThrow(customerId);
    const before = customer.toObject();

    if (input.companyName !== undefined) customer.companyName = input.companyName;
    if (input.contactPerson !== undefined) customer.contactPerson = input.contactPerson;
    if (input.phone !== undefined) customer.phone = input.phone;
    if (input.taxNumber !== undefined) customer.taxNumber = input.taxNumber;
    if (input.address !== undefined) customer.address = input.address;
    if (input.active !== undefined) customer.active = input.active;

    try {
      await customer.save();
    } catch (error) {
      throwIfDuplicateCode(error);
      throw error;
    }

    await AuditService.record({
      action: 'customer.update',
      actorUserId,
      entityType: 'Customer',
      entityId: customerId,
      metadata: { before, after: customer.toObject() },
    });

    return customer;
  },

  async softDelete(customerId: string, actorUserId: string): Promise<void> {
    const customer = await findActiveOrThrow(customerId);

    const blockReason = await findDeactivationBlockReason(customerId);
    if (blockReason) {
      throw new ConflictError(blockReason);
    }

    customer.isDeleted = true;
    customer.deletedAt = new Date();
    await customer.save();

    await AuditService.record({
      action: 'customer.deactivate',
      actorUserId,
      entityType: 'Customer',
      entityId: customerId,
      metadata: { before: { isDeleted: false }, after: { isDeleted: true } },
    });
  },
};
