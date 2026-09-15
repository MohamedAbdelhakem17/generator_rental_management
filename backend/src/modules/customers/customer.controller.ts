import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import type { CustomerAttrs, CustomerDocument } from './customer.model.js';
import { CustomerService } from './customer.service.js';
import { createCustomerSchema, listCustomersQuerySchema, updateCustomerSchema } from './customer.validation.js';

function toCustomerResponse(customer: CustomerAttrs | CustomerDocument) {
  return {
    id: String(customer._id),
    code: customer.code,
    companyName: customer.companyName,
    contactPerson: customer.contactPerson,
    phone: customer.phone,
    taxNumber: customer.taxNumber,
    address: customer.address,
    active: customer.active,
    createdAt: customer.createdAt,
  };
}

export async function listCustomers(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listCustomersQuerySchema, req.query);
  const result = await CustomerService.list(query);
  res.status(200).json(successResponse(result.items.map(toCustomerResponse), null, result.meta));
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const customer = await CustomerService.getById(id);
  res.status(200).json(successResponse(toCustomerResponse(customer)));
}

export async function createCustomer(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createCustomerSchema, req.body);
  const customer = await CustomerService.create(input, req.user!.id);
  res.status(201).json(successResponse(toCustomerResponse(customer)));
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateCustomerSchema, req.body);
  const customer = await CustomerService.update(id, input, req.user!.id);
  res.status(200).json(successResponse(toCustomerResponse(customer)));
}

export async function deleteCustomer(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  await CustomerService.softDelete(id, req.user!.id);
  res.status(200).json(successResponse(null));
}
