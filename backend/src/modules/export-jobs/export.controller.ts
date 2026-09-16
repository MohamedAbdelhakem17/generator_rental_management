import type { Request, Response } from 'express';

import { ForbiddenError, ValidationError } from '../../utils/AppError.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { EXPORT_REGISTRY, isKnownReportType } from './export-registry.js';
import { ExportService } from './export.service.js';
import { createExportSchema } from './export.validation.js';

export async function createExport(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createExportSchema, req.body);

  if (!isKnownReportType(input.reportType)) {
    throw new ValidationError('Validation failed', [
      { field: 'reportType', message: 'Unknown report type' },
    ]);
  }
  const definition = EXPORT_REGISTRY[input.reportType]!;
  if (!req.user!.permissions.includes(definition.permission)) {
    throw new ForbiddenError('You do not have permission to export this report');
  }

  const result = await ExportService.create({
    reportType: input.reportType,
    format: input.format,
    filters: input.filters,
    requestedBy: req.user!.id,
  });

  if (result.mode === 'sync') {
    res.status(200);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
    return;
  }

  res.status(202).json(successResponse({ jobId: result.jobId, status: 'Processing' }));
}

export async function getExportJob(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const job = await ExportService.getJob(id, req.user!.id);
  res.status(200).json(
    successResponse({
      id: String(job._id),
      reportType: job.reportType,
      format: job.format,
      status: job.status,
      failureReason: job.failureReason,
      expiresAt: job.expiresAt,
    }),
  );
}

export async function downloadExportJob(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const job = await ExportService.getJob(id, req.user!.id);

  if (job.status !== 'Ready' || !job.fileData) {
    throw new ValidationError('Validation failed', [
      { field: 'status', message: 'Export is not ready for download yet' },
    ]);
  }

  const contentType =
    job.format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${job.reportType}.${job.format}"`);
  res.send(job.fileData);
}
