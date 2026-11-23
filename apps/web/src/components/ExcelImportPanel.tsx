import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, History, Upload } from 'lucide-react';
import type {
  ImportBatchSummary,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRow,
} from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Modal,
  Notice,
  Skeleton,
  StatusBadge,
} from './ui';
import type { DataTableColumn } from './ui';
import { ApiError, apiRequest, apiUpload, downloadFile } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Paged } from '../lib/types';

export const IMPORT_ACTION_LABEL: Record<ImportPreviewRow['action'], string> = {
  INSERT: 'Baru',
  UPDATE: 'Perbarui',
  INVALID: 'Tidak valid',
};

export const importRowNumberColumn: DataTableColumn<ImportPreviewRow> = {
  key: 'rowNumber',
  header: 'Baris',
  render: (row) => <span className="text-xs text-ink-500">{row.rowNumber}</span>,
};

export const importActionColumn: DataTableColumn<ImportPreviewRow> = {
  key: 'action',
  header: 'Aksi',
  render: (row) => (
    <Badge
      tone={row.action === 'INSERT' ? 'success' : row.action === 'UPDATE' ? 'info' : 'danger'}
    >
      {IMPORT_ACTION_LABEL[row.action]}
    </Badge>
  ),
};

export const importErrorsColumn: DataTableColumn<ImportPreviewRow> = {
  key: 'errors',
  header: 'Kesalahan',
  render: (row) =>
    row.errors.length ? (
      <ul className="space-y-0.5 text-[11px] text-red-600">
        {row.errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    ) : (
      <span className="text-[11px] text-ink-300">—</span>
    ),
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Terjadi kesalahan tak terduga.';
}

export interface ExcelImportPanelProps {
  title: string;
  description: string;
  entityLabel: string;
  successNoun: string;
  requiredColumnsHint: string;
  fileInputId: string;
  templatePath: string;
  templateFilename: string;
  previewPath: string;
  commitPathFor: (batchId: string) => string;
  batchesPath: string;
  detailPathFor: (batchId: string) => string;
  batchesQueryKey: readonly unknown[];
  invalidateQueryKeys: ReadonlyArray<readonly unknown[]>;
  previewColumns: Array<DataTableColumn<ImportPreviewRow>>;
  confirmDescription: string;
  historyEmptyText?: string;
}

export function ExcelImportPanel({
  title,
  description,
  entityLabel,
  successNoun,
  requiredColumnsHint,
  fileInputId,
  templatePath,
  templateFilename,
  previewPath,
  commitPathFor,
  batchesPath,
  detailPathFor,
  batchesQueryKey,
  invalidateQueryKeys,
  previewColumns,
  confirmDescription,
  historyEmptyText = 'Belum ada impor Excel. Mulai dengan mengunduh template resmi.',
}: ExcelImportPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const batches = useQuery({
    queryKey: batchesQueryKey,
    queryFn: () => apiRequest<Paged<ImportBatchSummary>>(batchesPath),
    staleTime: 30_000,
  });

  const invalidate = () => {
    for (const queryKey of invalidateQueryKeys) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (selected: File) => {
      const formData = new FormData();
      formData.append('file', selected);
      return apiUpload<ImportPreview>(previewPath, formData);
    },
    onSuccess: (data) => {
      setPreview(data);
      setUploadError(null);
    },
    onError: (error) => setUploadError(errorMessage(error)),
  });

  const commitMutation = useMutation({
    mutationFn: (batchId: string) =>
      apiRequest<ImportCommitResult>(commitPathFor(batchId), { method: 'POST' }),
    onSuccess: (data) => {
      setResult(data);
      setConfirmOpen(false);
      invalidate();
      void batches.refetch();
    },
  });

  const detailMutation = useMutation({
    mutationFn: (batchId: string) => apiRequest<ImportPreview>(detailPathFor(batchId)),
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
      setUploadError(null);
      setOpen(true);
    },
    onError: (error) => setUploadError(errorMessage(error)),
  });

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeModal = () => {
    setOpen(false);
    reset();
  };

  const validCount = preview?.batch.validCount ?? 0;
  const canCommit = preview?.batch.status === 'PREVIEWED' && validCount > 0 && !result;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 text-brand-600" />
          <div>
            <h2 className="text-sm font-bold text-ink-950">{title}</h2>
            <p className="text-[11px] text-ink-400">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => downloadFile(templatePath, templateFilename)}>
            <Download className="h-4 w-4" />
            Unduh template
          </Button>
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Upload className="h-4 w-4" />
            Impor Excel
          </Button>
        </div>
      </div>

      {uploadError && !open ? (
        <div className="p-4">
          <Notice tone="danger">{uploadError}</Notice>
        </div>
      ) : null}

      <div className="divide-y divide-ink-50">
        <div className="flex items-center gap-2 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <History className="h-3.5 w-3.5" />
          Riwayat impor
        </div>
        {batches.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : null}
        {batches.data?.items.map((batch) => (
          <div
            key={batch.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <StatusBadge status={batch.status} />
              <div>
                <p className="text-xs font-semibold text-ink-800">
                  {batch.fileName} · {formatDateTime(batch.createdAt)}
                </p>
                <p className="text-[11px] text-ink-400">
                  {batch.rowCount} baris · {batch.insertedCount} baru · {batch.updatedCount} diperbarui ·{' '}
                  {batch.invalidCount} tidak valid
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => detailMutation.mutate(batch.id)}
              disabled={detailMutation.isPending}
            >
              Lihat detail
            </Button>
          </div>
        ))}
        {batches.data && batches.data.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-400">{historyEmptyText}</p>
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={closeModal}
        title={result ? 'Impor selesai' : preview ? `Pratinjau impor ${entityLabel}` : title}
        description={
          result
            ? 'Ringkasan hasil impor yang sudah tersimpan di database.'
            : preview
              ? `${preview.batch.fileName} — periksa hasil validasi per baris sebelum konfirmasi.`
              : 'Pilih file .xlsx sesuai template resmi. File divalidasi dulu, belum disimpan.'
        }
        size="lg"
      >
        {result ? (
          <div className="space-y-4">
            <Notice tone="success">
              Impor berhasil: {result.inserted} {successNoun}, {result.updated} diperbarui,{' '}
              {result.batch.invalidCount} baris tidak valid dilewati.
            </Notice>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={reset}>
                Impor file lain
              </Button>
              <Button onClick={closeModal}>Tutup</Button>
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{preview.batch.rowCount} baris</Badge>
              <Badge tone="success">{preview.batch.validCount} valid</Badge>
              <Badge tone="danger">{preview.batch.invalidCount} tidak valid</Badge>
              {preview.batch.status !== 'PREVIEWED' ? (
                <StatusBadge status={preview.batch.status} />
              ) : null}
            </div>
            {commitMutation.isError ? (
              <Notice tone="danger">{errorMessage(commitMutation.error)}</Notice>
            ) : null}
            <DataTable
              columns={previewColumns}
              rows={preview.rows}
              rowKey={(row) => String(row.rowNumber)}
              ariaLabel={`Tabel pratinjau impor ${entityLabel}`}
              emptyTitle="Tidak ada baris"
              emptyDescription="File tidak berisi baris data."
              minWidthClass="min-w-[720px]"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeModal}>
                Batal
              </Button>
              {canCommit ? (
                <Button onClick={() => setConfirmOpen(true)} disabled={commitMutation.isPending}>
                  Konfirmasi impor ({validCount} valid)
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor={fileInputId} className="mb-1 block text-xs font-semibold text-ink-700">
                File Excel (.xlsx)
              </label>
              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-brand-700"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setUploadError(null);
                }}
              />
              <p className="mt-1 text-[11px] text-ink-400">
                Maksimal 2 MB dan 1000 baris. {requiredColumnsHint}
              </p>
            </div>
            {uploadError ? <Notice tone="danger">{uploadError}</Notice> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeModal}>
                Batal
              </Button>
              <Button
                disabled={!file || uploadMutation.isPending}
                onClick={() => file && uploadMutation.mutate(file)}
              >
                {uploadMutation.isPending ? 'Memvalidasi…' : 'Pratinjau'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => preview && commitMutation.mutate(preview.batch.id)}
        title={`Impor ${validCount} baris valid?`}
        description={confirmDescription}
        confirmLabel="Ya, impor sekarang"
        tone="primary"
        loading={commitMutation.isPending}
      />
    </Card>
  );
}