import type { Decimal } from 'decimal.js';
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { FinancialEngineService } from '../financial-engine/service.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { toDisplayString } from '../../services/money.js';
import { ExtractService } from './extract.service.js';
import type { ExtractAttrs } from './extract.model.js';
import {
  cancelExtractSchema,
  createExtractSchema,
  listExtractsQuerySchema,
  previewTotalsSchema,
  updateExtractSchema,
} from './extract.validation.js';

/** `customerId`/`projectId` are always populated before this runs — see ExtractService. */
type PopulatedExtract = Omit<ExtractAttrs, 'customerId' | 'projectId'> & {
  customerId: { _id: Types.ObjectId; companyName: string };
  projectId: { _id: Types.ObjectId; code: string; name: string };
};

async function toExtractResponse(extract: PopulatedExtract, vatRateFraction: Decimal) {
  const totals = await ExtractService.deriveDisplayTotals(extract, vatRateFraction);

  return {
    id: String(extract._id),
    number: extract.number,
    customer: { id: String(extract.customerId._id), companyName: extract.customerId.companyName },
    project: { id: String(extract.projectId._id), code: extract.projectId.code, name: extract.projectId.name },
    contractIds: extract.contractIds.map((id) => String(id)),
    period: extract.period,
    lineItems: extract.lineItems.map((item) => ({
      id: String(item._id),
      type: item.type,
      description: item.description,
      amount: toDisplayString(item.amount),
    })),
    discounts: toDisplayString(extract.discounts),
    vatRateSnapshot: extract.vatRateSnapshot,
    vat: totals ? toDisplayString(totals.vat) : null,
    totalBeforeVat: totals ? toDisplayString(totals.netBeforeVat) : null,
    finalTotal: totals ? toDisplayString(totals.finalTotal) : null,
    status: extract.status,
    collectedAmount: toDisplayString(extract.collectedAmount),
    cancelReason: extract.cancelReason,
    customerNameSnapshot: extract.customerNameSnapshot,
    createdAt: extract.createdAt,
  };
}

export async function listExtracts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listExtractsQuerySchema, req.query);
  const result = await ExtractService.list(query);
  const items = result.items as unknown as PopulatedExtract[];
  // Fetched once for the whole page rather than per row — SystemSetting is a singleton.
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  const data = await Promise.all(items.map((item) => toExtractResponse(item, vatRateFraction)));
  res.status(200).json(successResponse(data, null, result.meta));
}

export async function getExtract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const extract = await ExtractService.getById(id);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  res.status(200).json(successResponse(await toExtractResponse(extract as unknown as PopulatedExtract, vatRateFraction)));
}

export async function createExtract(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createExtractSchema, req.body);
  const extract = await ExtractService.create(input, req.user!.id);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  res.status(201).json(successResponse(await toExtractResponse(extract as unknown as PopulatedExtract, vatRateFraction)));
}

export async function updateExtract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateExtractSchema, req.body);
  const extract = await ExtractService.update(id, input, req.user!.id);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  res.status(200).json(successResponse(await toExtractResponse(extract as unknown as PopulatedExtract, vatRateFraction)));
}

export async function submitExtractForReview(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const extract = await ExtractService.submitReview(id, req.user!.id);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  res.status(200).json(successResponse(await toExtractResponse(extract as unknown as PopulatedExtract, vatRateFraction)));
}

export async function approveExtract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const extract = await ExtractService.approve(id, req.user!.id);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  res.status(200).json(successResponse(await toExtractResponse(extract as unknown as PopulatedExtract, vatRateFraction)));
}

export async function cancelExtract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(cancelExtractSchema, req.body);
  const extract = await ExtractService.cancel(id, input, req.user!.id);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  res.status(200).json(successResponse(await toExtractResponse(extract as unknown as PopulatedExtract, vatRateFraction)));
}

/** TASK-021 Section 12: the wizard's live-preview endpoint. */
export async function previewTotals(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(previewTotalsSchema, req.body);
  const vatRateFraction = await ExtractService.getLiveVatRateFraction();
  const totals = FinancialEngineService.calculateExtractTotals({ ...input, vatRate: vatRateFraction });

  res.status(200).json(
    successResponse({
      totalWork: toDisplayString(totals.totalWork),
      netBeforeVat: toDisplayString(totals.netBeforeVat),
      vat: toDisplayString(totals.vat),
      finalTotal: toDisplayString(totals.finalTotal),
      vatRateUsed: vatRateFraction.toNumber(),
    }),
  );
}
