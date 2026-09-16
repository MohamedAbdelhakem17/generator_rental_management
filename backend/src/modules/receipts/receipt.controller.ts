import type { Request, Response } from 'express';

import { toDisplayString } from '../../services/money.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { ReceiptService } from './receipt.service.js';
import {
  cancelReceiptSchema,
  createReceiptSchema,
  listReceiptsQuerySchema,
} from './receipt.validation.js';

function toReceiptResponse(receipt: {
  _id: { toString(): string };
  customerId: unknown;
  date: Date;
  amount: unknown;
  paymentMethod: string;
  account: string;
  transferNumber: string;
  allocations: Array<{ extractId: unknown; amount: unknown }>;
  status: string;
  cancelReason: string;
  createdAt: Date;
}) {
  return {
    id: String(receipt._id),
    customerId: String(receipt.customerId),
    date: receipt.date,
    amount: toDisplayString(receipt.amount),
    paymentMethod: receipt.paymentMethod,
    account: receipt.account,
    transferNumber: receipt.transferNumber,
    allocations: receipt.allocations.map((item) => ({
      extractId: String(item.extractId),
      amount: toDisplayString(item.amount),
    })),
    status: receipt.status,
    cancelReason: receipt.cancelReason,
    createdAt: receipt.createdAt,
  };
}

export async function listReceipts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listReceiptsQuerySchema, req.query);
  const result = await ReceiptService.list(query);
  res.status(200).json(successResponse(result.items.map(toReceiptResponse), null, result.meta));
}

export async function getReceipt(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const receipt = await ReceiptService.getById(id);
  res.status(200).json(successResponse(toReceiptResponse(receipt as never)));
}

export async function createReceipt(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createReceiptSchema, req.body);
  const receipt = await ReceiptService.create(input, req.user!.id);
  res.status(201).json(successResponse(toReceiptResponse(receipt as never)));
}

export async function cancelReceipt(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(cancelReceiptSchema, req.body);
  const receipt = await ReceiptService.cancel(id, input, req.user!.id);
  res.status(200).json(successResponse(toReceiptResponse(receipt as never)));
}
