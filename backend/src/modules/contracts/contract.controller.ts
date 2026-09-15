import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { toDisplayString } from '../../services/money.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import type { ContractItemAttrs } from './contract-item.model.js';
import { ContractService } from './contract.service.js';
import type { RentalContractAttrs } from './contract.model.js';
import {
  cancelContractSchema,
  createContractSchema,
  listContractsQuerySchema,
  updateContractSchema,
} from './contract.validation.js';

/** `customerId`/`projectId` are always populated before this runs — see ContractService. */
type PopulatedContract = Omit<RentalContractAttrs, 'customerId' | 'projectId'> & {
  customerId: { _id: Types.ObjectId; code: string; companyName: string };
  projectId: { _id: Types.ObjectId; code: string; name: string };
};

type PopulatedContractItem = Omit<ContractItemAttrs, 'generatorId'> & {
  generatorId: { _id: Types.ObjectId; code: string };
};

function toContractResponse(contract: PopulatedContract, extras: { itemCount?: number; items?: PopulatedContractItem[] } = {}) {
  return {
    id: String(contract._id),
    number: contract.number,
    customer: { id: String(contract.customerId._id), code: contract.customerId.code, companyName: contract.customerId.companyName },
    project: { id: String(contract.projectId._id), code: contract.projectId.code, name: contract.projectId.name },
    startDate: contract.startDate,
    endDate: contract.endDate,
    rentalMethod: contract.rentalMethod,
    status: contract.status,
    insurance: {
      provider: contract.insurance.provider,
      policyNumber: contract.insurance.policyNumber,
      amount: toDisplayString(contract.insurance.amount),
    },
    cancelReason: contract.cancelReason,
    ...(extras.itemCount !== undefined ? { itemCount: extras.itemCount } : {}),
    ...(extras.items
      ? {
          items: extras.items.map((item) => ({
            id: String(item._id),
            generatorId: String(item.generatorId._id),
            generatorCode: item.generatorId.code,
            billingMethod: item.billingMethod,
            unitPrice: toDisplayString(item.unitPrice),
            priceSnapshot: item.priceSnapshot ? toDisplayString(item.priceSnapshot) : null,
          })),
        }
      : {}),
    createdAt: contract.createdAt,
  };
}

export async function listContracts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listContractsQuerySchema, req.query);
  const result = await ContractService.list(query);
  const items = result.items as unknown as PopulatedContract[];
  res.status(200).json(
    successResponse(
      items.map((item) => toContractResponse(item, { itemCount: result.itemCounts[String(item._id)] ?? 0 })),
      null,
      result.meta,
    ),
  );
}

export async function getContract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const { contract, items } = await ContractService.getById(id);
  res.status(200).json(
    successResponse(
      toContractResponse(contract as unknown as PopulatedContract, {
        items: items as unknown as PopulatedContractItem[],
      }),
    ),
  );
}

export async function createContract(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createContractSchema, req.body);
  const contract = await ContractService.create(input, req.user!.id);
  res.status(201).json(successResponse(toContractResponse(contract as unknown as PopulatedContract)));
}

export async function updateContract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateContractSchema, req.body);
  const contract = await ContractService.update(id, input, req.user!.id);
  res.status(200).json(successResponse(toContractResponse(contract as unknown as PopulatedContract)));
}

export async function activateContract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const contract = await ContractService.activate(id, req.user!.id);
  res.status(200).json(successResponse(toContractResponse(contract as unknown as PopulatedContract)));
}

export async function cancelContract(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(cancelContractSchema, req.body);
  const contract = await ContractService.cancel(id, input, req.user!.id);
  res.status(200).json(successResponse(toContractResponse(contract as unknown as PopulatedContract)));
}
