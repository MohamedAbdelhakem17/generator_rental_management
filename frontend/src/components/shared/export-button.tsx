'use client';

import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';

export interface ExportButtonProps {
  reportType: string;
  filters?: object;
  /** Client-side print route (e.g. an Extract or Customer Statement print page). Omit to hide the PDF option. */
  printHref?: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function pollJobUntilReady(jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const job = await apiClient.get<{ status: 'Processing' | 'Ready' | 'Failed'; failureReason: string }>(
      `/api/exports/${jobId}`,
    );
    if (job.status === 'Ready') {
      const file = await apiClient.downloadFile(`/api/exports/${jobId}/download`);
      triggerDownload(file.blob, file.filename);
      return;
    }
    if (job.status === 'Failed') {
      throw new Error(job.failureReason || 'Export generation failed');
    }
  }
  throw new Error('Export is taking longer than expected — check back shortly.');
}

/** Section 6/13: CSV/Excel/PDF export wired to any report or list screen. PDF is generated
 * client-side via the browser's native print-to-PDF (see `printHref`), not this endpoint —
 * that sidesteps the Arabic RTL text-shaping pitfall a server PDF library would hit. */
export function ExportButton({ reportType, filters = {}, printHref }: ExportButtonProps) {
  const { t } = useLocale();
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport(format: 'csv' | 'xlsx') {
    setIsExporting(true);
    try {
      const result = await apiClient.postForFileOrJob('/api/exports', { reportType, format, filters });
      if (result.mode === 'file') {
        triggerDownload(result.blob, result.filename);
      } else {
        toast.info(t('export.preparingToast'));
        await pollJobUntilReady(result.jobId);
        toast.success(t('export.readyToast'));
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('export.failedToast'));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          <Download className="size-4" aria-hidden />
          {t('export.buttonLabel')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void handleExport('csv')}>
          <FileText className="size-4" aria-hidden />
          {t('export.csvOption')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleExport('xlsx')}>
          <FileSpreadsheet className="size-4" aria-hidden />
          {t('export.excelOption')}
        </DropdownMenuItem>
        {printHref ? (
          <DropdownMenuItem onClick={() => window.open(printHref, '_blank', 'noopener,noreferrer')}>
            <Printer className="size-4" aria-hidden />
            {t('export.pdfOption')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
