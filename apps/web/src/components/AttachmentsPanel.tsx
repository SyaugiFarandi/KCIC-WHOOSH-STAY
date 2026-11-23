import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { apiRequest, apiUpload } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Notice } from './ui';

export type AttachmentEntityType =
  | 'MAINTENANCE_TICKET'
  | 'HOUSEKEEPING_TASK'
  | 'RESERVATION'
  | 'OPERATIONAL_DOCUMENT';

interface AttachmentSummary {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  entityType: string;
  entityId: string;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  entityType,
  entityId,
  canUpload,
  title = 'Lampiran',
  description = 'Foto atau PDF, maksimal 5 MB per file.',
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  canUpload?: boolean;
  title?: string;
  description?: string;
}) {
  const { hasPermission, me } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const allowed = canUpload ?? hasPermission('attachments.upload');
  const canDeleteAny = hasPermission('attachments.delete');

  const attachments = useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () =>
      apiRequest<AttachmentSummary[]>(
        `/api/v1/attachments?entityType=${entityType}&entityId=${entityId}`,
      ),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.set('entityType', entityType);
      formData.set('entityId', entityId);
      formData.set('file', file);
      return apiUpload<AttachmentSummary>('/api/v1/attachments', formData);
    },
    onSuccess: (attachment) => {
      setFeedback(`${attachment.originalFilename} berhasil diunggah.`);
      if (inputRef.current) inputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string; deleted: boolean }>(`/api/v1/attachments/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setPendingDelete(null);
      setFeedback('Lampiran dihapus.');
      void queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
    },
  });

  return (
    <section className="rounded-xl border border-ink-100 bg-white p-3.5" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-ink-900">
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            {title}
            {attachments.data?.length ? (
              <Badge tone="neutral">{attachments.data.length}</Badge>
            ) : null}
          </p>
          <p className="mt-0.5 text-[10px] text-ink-400">{description}</p>
        </div>
        {allowed ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              aria-label="Pilih berkas lampiran"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={uploadMutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Unggah
            </Button>
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div className="mt-2" aria-live="polite">
          <Notice tone="success">{feedback}</Notice>
        </div>
      ) : null}
      {uploadMutation.isError || deleteMutation.isError ? (
        <div className="mt-2" role="alert">
          <Notice tone="danger">
            {errorMessage(uploadMutation.error ?? deleteMutation.error)}
          </Notice>
        </div>
      ) : null}

      {attachments.isLoading ? (
        <p className="mt-3 text-[11px] text-ink-400">Memuat lampiran…</p>
      ) : attachments.isError ? (
        <p className="mt-3 text-[11px] text-red-700">Lampiran tidak dapat dimuat.</p>
      ) : attachments.data?.length ? (
        <ul className="mt-3 space-y-1.5">
          {attachments.data.map((attachment) => {
            const isImage = attachment.mimeType.startsWith('image/');
            const canDelete = canDeleteAny || attachment.uploadedBy === me?.user.id;
            return (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 px-2.5 py-2"
              >
                {isImage ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-ink-800">
                    {attachment.originalFilename}
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {formatBytes(attachment.sizeBytes)} · {formatDateTime(attachment.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={attachment.downloadUrl}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800 active:bg-ink-200"
                    aria-label={`Unduh ${attachment.originalFilename}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  {canDelete ? (
                    pendingDelete === attachment.id ? (
                      <span className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          className="h-8 px-2"
                          loading={
                            deleteMutation.isPending && deleteMutation.variables === attachment.id
                          }
                          onClick={() => deleteMutation.mutate(attachment.id)}
                        >
                          Hapus
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => setPendingDelete(null)}
                        >
                          Batal
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-700 active:bg-red-100"
                        aria-label={`Hapus ${attachment.originalFilename}`}
                        onClick={() => setPendingDelete(attachment.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-ink-400">Belum ada lampiran.</p>
      )}
    </section>
  );
}
