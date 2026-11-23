import type { EmployeeImportPreviewRow } from '@whoosh/shared';
import type { DataTableColumn } from './ui';
import {
  ExcelImportPanel,
  importActionColumn,
  importErrorsColumn,
  importRowNumberColumn,
} from './ExcelImportPanel';

const previewColumns: Array<DataTableColumn<EmployeeImportPreviewRow>> = [
  importRowNumberColumn,
  {
    key: 'employeeCode',
    header: 'Kode',
    render: (row) => (
      <span className="font-mono text-xs text-ink-800">{row.data.employeeCode ?? '—'}</span>
    ),
  },
  {
    key: 'fullName',
    header: 'Nama',
    render: (row) => <span className="text-xs text-ink-800">{row.data.fullName ?? '—'}</span>,
  },
  {
    key: 'employmentStatus',
    header: 'Status',
    render: (row) => (
      <span className="text-xs text-ink-600">{row.data.employmentStatus ?? '—'}</span>
    ),
  },
  importActionColumn,
  importErrorsColumn,
];

export function EmployeeImportPanel() {
  return (
    <ExcelImportPanel
      title="Impor Excel karyawan"
      description="Unduh template, unggah file .xlsx (maks. 2 MB, 1000 baris), periksa pratinjau validasi, lalu konfirmasi impor. Data tidak tersimpan sebelum dikonfirmasi."
      entityLabel="karyawan"
      successNoun="karyawan baru"
      requiredColumnsHint="Kolom wajib: employeeCode, fullName, employmentStatus."
      fileInputId="employee-import-file"
      templatePath="/api/v1/employees/import-template"
      templateFilename="whoosh-stay-employee-import-template.xlsx"
      previewPath="/api/v1/employees/import/preview"
      commitPathFor={(batchId) => `/api/v1/employees/import/${batchId}/commit`}
      batchesPath="/api/v1/employees/import/batches?pageSize=5"
      detailPathFor={(batchId) => `/api/v1/employees/import/batches/${batchId}`}
      batchesQueryKey={['employees', 'import-batches']}
      invalidateQueryKeys={[['employees']]}
      previewColumns={previewColumns}
      confirmDescription="Baris valid akan disimpan permanen ke database dalam satu transaksi. Baris tidak valid dilewati dan tetap tercatat di riwayat. Kode yang sudah ada dari impor sebelumnya akan diperbarui."
    />
  );
}
