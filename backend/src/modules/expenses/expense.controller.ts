import type { Request, Response } from 'express';

import { toDisplayString, type MoneyInput } from '../../services/money.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { ExpenseService } from './expense.service.js';
import {
  allocateExpenseSchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './expense.validation.js';

function toExpenseResponse(expense: {
  _id: { toString(): string };
  category: string;
  date: Date;
  amount: MoneyInput;
  generatorId?: unknown | null;
  projectId?: unknown | null;
  description: string;
  allocatedFrom?: unknown | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: String(expense._id),
    category: expense.category,
    date: expense.date,
    amount: toDisplayString(expense.amount),
    generatorId: expense.generatorId ? String(expense.generatorId) : null,
    projectId: expense.projectId ? String(expense.projectId) : null,
    description: expense.description,
    allocatedFrom: expense.allocatedFrom ? String(expense.allocatedFrom) : null,
    status: expense.status,
    createdAt: expense.createdAt,
  };
}

export async function listExpenses(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listExpensesQuerySchema, req.query);
  const result = await ExpenseService.list(query);
  res.status(200).json(successResponse(result.items.map(toExpenseResponse), null, result.meta));
}

export async function getExpense(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const expense = await ExpenseService.getById(id);
  res.status(200).json(successResponse(toExpenseResponse(expense as never)));
}

export async function createExpense(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createExpenseSchema, req.body);
  const expense = await ExpenseService.create(input, req.user!.id);
  res.status(201).json(successResponse(toExpenseResponse(expense as never)));
}

export async function updateExpense(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateExpenseSchema, req.body);
  const expense = await ExpenseService.update(id, input, req.user!.id);
  res.status(200).json(successResponse(toExpenseResponse(expense as never)));
}

export async function allocateExpense(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(allocateExpenseSchema, req.body);
  const items = await ExpenseService.allocate(id, input, req.user!.id, req.user!.role);
  res.status(200).json(successResponse(items.map(toExpenseResponse)));
}
