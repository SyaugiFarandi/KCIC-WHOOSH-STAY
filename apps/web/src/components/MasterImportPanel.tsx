import type { ImportPreviewRow, MasterImportEntity } from '@whoosh/shared';
import type { DataTableColumn } from './ui';
import {
  ExcelImportPanel,
  importActionColumn,
  importErrorsColumn,
  importRowNumberColumn,
} from './ExcelImportPanel';

const mono = (value: string | null | undefined) => (
  <span className="font-mono text-xs text-ink-800">{value ?? '—'}</span>
);

const locationCell = (row: ImportPreviewRow) => (
  <span className="text-xs text-ink-600">
    {row.data.dormitoryCode ?? '—'} · {row.data.buildingCode ?? '—'} · Lt.{' '}
    {row.data.floorNumber ?? '—'}
  </span>
);

const COLUMNS: Record<MasterImportEntity, Array<DataTableColumn<ImportPreviewRow>>> = {
  dormitories: [
    importRowNumberColumn,
    { key: 'code', header: 'Kode', render: (row) => mono(row.data.code) },
    { key: 'name', header: 'Nama', render: (row) => mono(row.data.name) },
    { key: 'locationCode', header: 'Lokasi', render: (row) => mono(row.data.locationCode) },
    importActionColumn,
    importErrorsColumn,
  ],
  buildings: [
    importRowNumberColumn,
    { key: 'dormitoryCode', header: 'Dormitory', render: (row) => mono(row.data.dormitoryCode) },
    { key: 'code', header: 'Kode', render: (row) => mono(row.data.code) },
    { key: 'name', header: 'Nama', render: (row) => mono(row.data.name) },
    importActionColumn,
    importErrorsColumn,
  ],
  rooms: [
    importRowNumberColumn,
    { key: 'roomNumber', header: 'Kamar', render: (row) => mono(row.data.roomNumber) },
    { key: 'location', header: 'Lokasi', render: locationCell },
    { key: 'roomTypeCode', header: 'Tipe', render: (row) => mono(row.data.roomTypeCode) },
    importActionColumn,
    importErrorsColumn,
  ],
  beds: [
    importRowNumberColumn,
    { key: 'bedCode', header: 'Kode bed', render: (row) => mono(row.data.bedCode) },
    { key: 'roomNumber', header: 'Kamar', render: (row) => mono(row.data.roomNumber) },
    { key: 'location', header: 'Lokasi', render: locationCell },
    importActionColumn,
    importErrorsColumn,
  ],
};

const META: Record<
  MasterImportEntity,
  { label: string; successNoun: string; requiredColumnsHint: string }
> = {
  dormitories: {
    label: 'unit akomodasi',
    successNoun: 'unit akomodasi baru',
    requiredColumnsHint: 'Kolom wajib: code, name.',
  },
  buildings: {
    label: 'gedung',
    successNoun: 'gedung baru',
    requiredColumnsHint: 'Kolom wajib: dormitoryCode, code, name.',
  },
  rooms: {
    label: 'kamar',
    successNoun: 'kamar baru',
    requiredColumnsHint:
      'Kolom wajib: dormitoryCode, buildingCode, floorNumber, roomNumber, roomTypeCode.',
  },
  beds: {
    label: 'tempat tidur',
    successNoun: 'tempat tidur baru',
    requiredColumnsHint:
      'Kolom wajib: dormitoryCode, buildingCode, floorNumber, roomNumber, bedCode.',
  },
};

export function MasterImportPanel({ entity }: { entity: MasterImportEntity }) {
  const meta = META[entity];
  return (
    <ExcelImportPanel
      title={`Impor Excel ${meta.label}`}
      description="Unduh template, unggah file .xlsx (maks. 2 MB, 1000 baris), periksa pratinjau validasi, lalu konfirmasi impor. Data tidak tersimpan sebelum dikonfirmasi."
      entityLabel={meta.label}
      successNoun={meta.successNoun}
      requiredColumnsHint={meta.requiredColumnsHint}
      fileInputId={`master-import-file-${entity}`}
      templatePath={`/api/v1/master-data/import-template?entity=${entity}`}
      templateFilename={`whoosh-stay-${entity}-import-template.xlsx`}
      previewPath={`/api/v1/master-data/import/preview?entity=${entity}`}
      commitPathFor={(batchId) => `/api/v1/master-data/import/${batchId}/commit`}
      batchesPath={`/api/v1/master-data/import/batches?entity=${entity}&pageSize=5`}
      detailPathFor={(batchId) => `/api/v1/master-data/import/batches/${batchId}`}
      batchesQueryKey={['master-data', 'import-batches', entity]}
      invalidateQueryKeys={[['master-data'], ['dormitories']]}
      previewColumns={COLUMNS[entity]}
      confirmDescription="Baris valid akan disimpan permanen ke database dalam satu transaksi. Baris tidak valid dilewati dan tetap tercatat di riwayat. Kode yang sudah ada akan diperbarui sesuai aturan entitas; induk (dormitory/gedung/lantai/kamar) harus sudah ada."
    />
  );
}