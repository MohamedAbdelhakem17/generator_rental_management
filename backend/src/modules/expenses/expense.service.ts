import { Decimal } from 'decimal.js';

import { AuditService } from '../audit/audit.service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal, toDecimal128, toDisplayString } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { ExpenseModel, type ExpenseAttrs, type ExpenseDocument } from './expense.model.js';
import type { AllocateExpenseInput, CreateExpenseInput, ListExpensesQuery, UpdateExpenseInput } from './expense.validation.js';

const ALLOWED_SORT_FIELDS = ['date', 'amount', 'createdAt'] as const;

async function assertGeneratorExists(generatorId: string): Promise<void> {
  const generator = await GeneratorModel.findOne({ _id: generatorId, isDeleted: { $ne: true } });
  if (!generator) {
    throw new ValidationError('Validation failed', [{ field: 'generatorId', message: 'Generator does not exist' }]);
  }
}

async function assertProjectExists(projectId: string): Promise<void> {
  const project = await ProjectModel.findOne({ _id: projectId, isDeleted: { $ne: true } });
  if (!project) {
    throw new ValidationError('Validation failed', [{ field: 'projectId', message: 'Project does not exist' }]);
  }
}

function parseSplitMode(splits: AllocateExpenseInput['splits']): 'percentage' | 'amount' {
  const hasPercentage = splits.some((split) => split.percentage !== undefined);
  const hasAmount = splits.some((split) => split.amount !== undefined);

  if (hasPercentage && hasAmount) {
    throw new ValidationError('Validation failed', [{ field: 'splits', message: 'Mixing percentage and amount splits is not allowed' }]);
  }

  if (hasPercentage) return 'percentage';
  if (hasAmount) return 'amount';
  throw new ValidationError('Validation failed', [{ field: 'splits', message: 'Each split must include either percentage or amount' }]);
}

export const ExpenseService = {
  async list(options: ListExpensesQuery): Promise<PaginatedResult<ExpenseAttrs>> {
    const filters: Record<string, unknown> = {};

    if (options.category) filters.category = options.category;
    if (options.generatorId) filters.generatorId = options.generatorId;
    if (options.projectId) filters.projectId = options.projectId;
    if (options.unallocatedOnly) {
      filters.generatorId = null;
      filters.projectId = null;
    }
    if (options.dateFrom || options.dateTo) {
      filters.date = {
        ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
        ...(options.dateTo ? { $lte: options.dateTo } : {}),
      };
    }

    const result = await paginateQuery(ExpenseModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-date',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });

    return result;
  },

  async getById(expenseId: string): Promise<ExpenseDocument> {
    const expense = await ExpenseModel.findById(expenseId);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }
    return expense;
  },

  async create(input: CreateExpenseInput, actorUserId: string): Promise<ExpenseDocument> {
    if (input.generatorId) {
      await assertGeneratorExists(input.generatorId);
    }
    if (input.projectId) {
      await assertProjectExists(input.projectId);
    }
    if (!input.generatorId && !input.projectId) {
      // Unallocated company-level expense is valid as per TASK-024 FR-002.
    }

    const expense = await ExpenseModel.create({
      category: input.category,
      date: input.date,
      amount: toDecimal128(input.amount),
      generatorId: input.generatorId ?? null,
      projectId: input.projectId ?? null,
      description: input.description ?? '',
      status: 'Confirmed',
    });

    await AuditService.record({
      action: 'expense.create',
      actorUserId,
      entityType: 'Expense',
      entityId: String(expense._id),
      metadata: { after: expense.toObject() },
    });

    return expense;
  },

  async update(expenseId: string, input: UpdateExpenseInput, actorUserId: string): Promise<ExpenseDocument> {
    const expense = await ExpenseModel.findById(expenseId);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }
    if (expense.allocatedFrom || (await ExpenseModel.exists({ allocatedFrom: expense._id }))) {
      throw new ConflictError('This expense has already been allocated and cannot be edited');
    }

    if (input.generatorId !== undefined) {
      if (input.generatorId) await assertGeneratorExists(input.generatorId);
      expense.generatorId = input.generatorId ?? null;
    }
    if (input.projectId !== undefined) {
      if (input.projectId) await assertProjectExists(input.projectId);
      expense.projectId = input.projectId ?? null;
    }
    if (input.category !== undefined) expense.category = input.category;
    if (input.date !== undefined) expense.date = input.date;
    if (input.amount !== undefined) expense.amount = toDecimal128(input.amount);
    if (input.description !== undefined) expense.description = input.description ?? '';

    await expense.save();

    await AuditService.record({
      action: 'expense.update',
      actorUserId,
      entityType: 'Expense',
      entityId: String(expense._id),
      metadata: { before: expense.toObject(), after: expense.toObject() },
    });

    return expense;
  },

  async allocate(
    expenseId: string,
    input: AllocateExpenseInput,
    actorUserId: string,
    actorRole: string,
  ): Promise<ExpenseDocument[]> {
    if (actorRole !== 'Admin' && actorRole !== 'Finance Manager') {
      throw new ValidationError('Validation failed', [{ field: 'role', message: 'Only Admin and Finance Manager can allocate expenses' }]);
    }

    const expense = await ExpenseModel.findById(expenseId);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }
    if (expense.allocatedFrom) {
      throw new ConflictError('This allocation is already tied to a parent expense');
    }
    if (await ExpenseModel.exists({ allocatedFrom: expense._id })) {
      throw new ConflictError('This expense has already been allocated and cannot be re-allocated');
    }

    const mode = parseSplitMode(input.splits);
    const total = toDecimal(expense.amount);

    let childEntries: Array<{ generatorId?: string; projectId?: string; amount: Decimal }> = [];
    if (mode === 'percentage') {
      const totalPercent = input.splits.reduce((sum, split) => sum + (split.percentage ?? 0), 0);
      if (Math.abs(totalPercent - 100) > 0.000001) {
        throw new ValidationError('Validation failed', [{ field: 'splits', message: 'Split percentages must total 100%' }]);
      }

      childEntries = input.splits.map((split) => {
        const percentage = split.percentage ?? 0;
        const value = total.times(new Decimal(percentage).dividedBy(100));
        return {
          generatorId: split.generatorId,
          projectId: split.projectId,
          amount: value,
        };
      });
    } else {
      const totalAmount = input.splits.reduce((sum, split) => sum + (split.amount ?? 0), 0);
      if (Math.abs(toDecimal(totalAmount).minus(total).toNumber()) > 0.000001) {
        throw new ValidationError('Validation failed', [{ field: 'splits', message: 'Split amounts must total the original amount' }]);
      }

      childEntries = input.splits.map((split) => ({
        generatorId: split.generatorId,
        projectId: split.projectId,
        amount: new Decimal(split.amount ?? 0),
      }));
    }

    for (const split of childEntries) {
      if (split.generatorId) await assertGeneratorExists(split.generatorId);
      if (split.projectId) await assertProjectExists(split.projectId);
    }

    const created = await Promise.all(
      childEntries.map(async (split) =>
        ExpenseModel.create({
          category: expense.category,
          date: expense.date,
          amount: toDecimal128(split.amount),
          generatorId: split.generatorId ?? null,
          projectId: split.projectId ?? null,
          description: expense.description,
          allocatedFrom: expense._id,
          status: 'Confirmed',
        }),
      ),
    );

    await AuditService.record({
      action: 'expense.allocate',
      actorUserId,
      entityType: 'Expense',
      entityId: String(expense._id),
      metadata: {
        parentExpenseId: String(expense._id),
        splits: created.map((item) => ({
          id: String(item._id),
          amount: item.amount.toString(),
          generatorId: item.generatorId ? String(item.generatorId) : null,
          projectId: item.projectId ? String(item.projectId) : null,
        })),
      },
    });

    return created;
  },
};
