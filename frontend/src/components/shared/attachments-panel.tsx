'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, File, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { ConfirmDialog } from './confirm-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export type AttachmentEntityType = 'Maintenance' | 'Contract' | 'Extract';

interface AttachmentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Section 13/14: a generic panel reused on Maintenance/Contract/Extract detail pages —
 * upload/list/download/delete, permission-gated server-side (this component just reflects
 * `canWrite` for whether to show the upload control). */
export function AttachmentsPanel({
  entityType,
  entityId,
  canWrite,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  canWrite: boolean;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttachmentRow | null>(null);

  const queryKey = ['attachments', entityType, entityId];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiClient.getPaginated<AttachmentRow>('/api/attachments', { entityType, entityId }, signal),
  });

  async function uploadFile(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      formData.append('file', file);
      await apiClient.uploadFormData('/api/attachments', formData);
      toast.success(t('attachments.uploadSuccessToast'));
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('attachments.uploadFailedToast'));
    } finally {
      setIsUploading(false);
    }
  }

  async function downloadAttachment(attachment: AttachmentRow) {
    try {
      const file = await apiClient.downloadFile(`/api/attachments/${attachment.id}/download`);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('attachments.uploadFailedToast'));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/attachments/${deleteTarget.id}`);
      toast.success(t('attachments.deleteSuccessToast'));
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('attachments.deleteFailedToast'));
      throw error;
    }
  }

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (isError) {
    return <ErrorState title={t('attachments.loadFailedTitle')} onRetry={refetch} />;
  }

  const attachments = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      {canWrite ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void uploadFile(file);
          }}
          className={
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ' +
            (isDragging ? 'border-primary bg-accent/40' : 'border-border hover:bg-muted/40')
          }
        >
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">
            {isUploading ? t('attachments.uploadingToast') : t('attachments.dropzoneLabel')}
          </span>
          <span className="text-xs text-muted-foreground">{t('attachments.allowedTypesNote')}</span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            disabled={isUploading}
            accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadFile(file);
            }}
          />
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <EmptyState title={t('attachments.emptyTitle')} description={t('attachments.emptyDescription')} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <File className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{attachment.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(attachment.fileSize)} · {formatDate(attachment.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('attachments.download')}
                  onClick={() => void downloadAttachment(attachment)}
                >
                  <Download className="size-4" aria-hidden />
                </Button>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('attachments.delete')}
                    onClick={() => setDeleteTarget(attachment)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('attachments.deleteConfirmTitle')}
        description={t('attachments.deleteConfirmDescription')}
        confirmLabel={t('attachments.delete')}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
