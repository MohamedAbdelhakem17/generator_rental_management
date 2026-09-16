import { NotFoundError, ValidationError } from '../../utils/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { generateCsv } from '../../services/export/csvGenerator.js';
import { generateExcel } from '../../services/export/excelGenerator.js';
import { EXPORT_REGISTRY, isKnownReportType, type ExportFilters } from './export-registry.js';
import { ExportJobModel, type ExportFormat, type ExportJobDocument } from './export-job.model.js';

/**
 * Section 21: export of financial documents is audited. Scoped to the report types that are
 * "Extracts"/"Statements" per that section's own wording, not every report in the registry.
 */
const AUDITED_REPORT_TYPES = new Set(['revenue', 'customer-statement', 'uncollected-extracts']);

/** FR-003: exports at or under this many rows are generated synchronously. */
export const SYNC_EXPORT_ROW_THRESHOLD = 10_000;
/** Effectively unbounded for this system's scale — the async path re-fetches with no cap. */
const UNBOUNDED_LIMIT = 1_000_000;
const JOB_EXPIRY_HOURS = 24;

export interface ExportRequest {
  reportType: string;
  format: ExportFormat;
  filters: ExportFilters;
  requestedBy: string;
}

export interface SyncExportResult {
  mode: 'sync';
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface AsyncExportResult {
  mode: 'async';
  jobId: string;
}

async function generateFile(
  format: ExportFormat,
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[],
  reportType: string,
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  if (format === 'csv') {
    return {
      buffer: Buffer.from(generateCsv(columns, rows), 'utf-8'),
      contentType: 'text/csv',
      filename: `${reportType}.csv`,
    };
  }
  const excelBuffer = await generateExcel(columns, rows, reportType);
  return {
    buffer: excelBuffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${reportType}.xlsx`,
  };
}

async function processAsyncJob(jobId: string): Promise<void> {
  const job = await ExportJobModel.findById(jobId);
  if (!job) return;

  try {
    const definition = EXPORT_REGISTRY[job.reportType]!;
    const rows = await definition.fetchRows(job.filters as ExportFilters, UNBOUNDED_LIMIT);
    const { buffer } = await generateFile(job.format, definition.columns, rows, job.reportType);
    job.fileData = buffer;
    job.status = 'Ready';
    await job.save();
  } catch (error) {
    job.status = 'Failed';
    job.failureReason = error instanceof Error ? error.message : 'Export generation failed';
    await job.save();
  }
}

export const ExportService = {
  async create(request: ExportRequest): Promise<SyncExportResult | AsyncExportResult> {
    if (!isKnownReportType(request.reportType)) {
      throw new ValidationError('Validation failed', [
        { field: 'reportType', message: 'Unknown report type' },
      ]);
    }
    if (request.format === 'pdf') {
      throw new ValidationError('Validation failed', [
        {
          field: 'format',
          message: 'PDF is generated client-side via the print view, not this endpoint',
        },
      ]);
    }

    const definition = EXPORT_REGISTRY[request.reportType]!;
    const probeRows = await definition.fetchRows(request.filters, SYNC_EXPORT_ROW_THRESHOLD + 1);

    if (AUDITED_REPORT_TYPES.has(request.reportType)) {
      await AuditService.record({
        action: 'export.financial_document',
        actorUserId: request.requestedBy,
        entityType: 'ExportJob',
        entityId: null,
        metadata: { reportType: request.reportType, format: request.format, filters: request.filters },
      });
    }

    if (probeRows.length <= SYNC_EXPORT_ROW_THRESHOLD) {
      const { buffer, contentType, filename } = await generateFile(
        request.format,
        definition.columns,
        probeRows,
        request.reportType,
      );
      return { mode: 'sync', buffer, contentType, filename };
    }

    const job = await ExportJobModel.create({
      requestedBy: request.requestedBy,
      reportType: request.reportType,
      filters: request.filters,
      format: request.format,
      status: 'Processing',
      expiresAt: new Date(Date.now() + JOB_EXPIRY_HOURS * 60 * 60 * 1000),
    });

    // No job queue infra in this system (Constitution: no new infra) — process in-process,
    // off the request's event-loop turn, same as other fire-and-forget jobs in this codebase.
    setImmediate(() => {
      void processAsyncJob(String(job._id));
    });

    return { mode: 'async', jobId: String(job._id) };
  },

  async getJob(jobId: string, requestedBy: string): Promise<ExportJobDocument> {
    const job = await ExportJobModel.findOne({ _id: jobId, requestedBy });
    if (!job) {
      throw new NotFoundError('Export job not found');
    }
    return job;
  },
};
