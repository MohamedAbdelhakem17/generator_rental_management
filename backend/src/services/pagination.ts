import type { FilterQuery, Model, SortOrder } from 'mongoose';

import { ValidationError } from '../utils/AppError.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PaginateOptions {
  page?: number;
  limit?: number;
  /** Mongoose sort syntax, e.g. "createdAt" or "-createdAt". */
  sort?: string;
  /** Allow-list of sortable field names for this module; an unlisted field is a 422, not a raw Mongo cast error. */
  allowedSortFields?: readonly string[];
  /** Admin-only escape hatch to include soft-deleted documents. */
  includeDeleted?: boolean;
  /** TASK-029 export path only: raises the 100-row page cap so an export can pull up to the
   * async-export threshold in one page, without changing any regular list endpoint's cap. */
  maxLimit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function clampLimit(limit?: number, maxLimit: number = MAX_LIMIT): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

function clampPage(page?: number): number {
  if (page === undefined || Number.isNaN(page)) {
    return 1;
  }
  return Math.max(Math.trunc(page), 1);
}

function parseSort(
  sort: string | undefined,
  allowedSortFields?: readonly string[],
): Record<string, SortOrder> | undefined {
  if (!sort) {
    return undefined;
  }

  const direction: SortOrder = sort.startsWith('-') ? -1 : 1;
  const field = sort.startsWith('-') ? sort.slice(1) : sort;

  // TASK-034: fail closed rather than silently accepting an unvalidated sort field — every
  // call site passing `sort` must also declare its allow-list (a caller that forgets this
  // will find out immediately via a thrown error, not a quietly-unvalidated field in prod).
  if (!allowedSortFields || !allowedSortFields.includes(field)) {
    throw new ValidationError('Invalid sort field', [
      { field: 'sort', message: `"${field}" is not a sortable field` },
    ]);
  }

  return { [field]: direction };
}

/**
 * The single shared list-query implementation: every list/report endpoint in the PRD is
 * built on this so pagination, sort validation, and soft-delete filtering behave identically.
 */
export async function paginateQuery<T>(
  model: Model<T>,
  filters: FilterQuery<T> = {},
  options: PaginateOptions = {},
): Promise<PaginatedResult<T>> {
  const page = clampPage(options.page);
  const limit = clampLimit(options.limit, options.maxLimit);
  const sort = parseSort(options.sort, options.allowedSortFields);

  const queryFilters = (
    options.includeDeleted ? filters : { ...filters, isDeleted: { $ne: true } }
  ) as FilterQuery<T>;

  const [items, total] = await Promise.all([
    model
      .find(queryFilters)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    model.countDocuments(queryFilters).exec(),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
