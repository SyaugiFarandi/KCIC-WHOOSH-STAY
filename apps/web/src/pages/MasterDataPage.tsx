import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  READINESS_STATUSES,
  RESERVATION_STATUSES,
  ROOM_OPERATIONAL_STATUSES,
  type DormitorySummary,
  type EmployeeSummary,
  type FacilitySummary,
  type LocationSummary,
  type MasterDataOption,
  type PaginationMeta,
  type RoomTypeSummary,
} from '@whoosh/shared';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { MasterImportPanel } from '../components/MasterImportPanel';
import { EmployeesPage } from './EmployeesPage';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
  type DataTableColumn,
} from '../components/ui';
import { useListParams } from '../hooks/useListParams';
import { useUrlSyncedSearch } from '../hooks/useUrlSyncedSearch';
import { apiRequest, downloadFile, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime, humanize } from '../lib/format';
import type { Paged } from '../lib/types';

type CategoryKey = 'organisasi' | 'akomodasi' | 'karyawan' | 'fasilitas' | 'operasional';
type SubKey =
  | 'lokasi'
  | 'departemen'
  | 'jabatan'
  | 'stasiun'
  | 'unit-akomodasi'
  | 'gedung'
  | 'kamar'
  | 'tempat-tidur'
  | 'tipe-kamar'
  | 'data-crew'
  | 'status-karyawan'
  | 'fasilitas-kamar'
  | 'status-reservasi'
  | 'status-kamar'
  | 'status-maintenance';

interface BuildingRow {
  id: string;
  code: string;
  name: string;
  status: string;
  dormitoryId: string;
  dormitoryName: string;
  floorCount: number;
  roomCount: number;
}

interface RoomRow {
  id: string;
  roomNumber: string;
  name: string | null;
  status: string;
  housekeepingStatus: string;
  roomTypeName: string;
  buildingName: string;
  dormitoryName: string;
  floorNumber: number;
  bedCount: number;
}

interface BedRow {
  id: string;
  bedCode: string;
  label: string | null;
  status: string;
  housekeepingStatus: string;
  roomNumber: string;
  buildingName: string;
  dormitoryName: string;
}

interface OrganizationResponse {
  departments: MasterDataOption[];
  positions: MasterDataOption[];
  stations: MasterDataOption[];
  employmentStatuses: MasterDataOption[];
  employeeCount: number;
  lastSyncedAt: string | null;
  sourceSystem: string;
  readOnly: boolean;
}

type ListSub = 'lokasi' | 'unit-akomodasi' | 'gedung' | 'kamar' | 'tempat-tidur' | 'tipe-kamar' | 'data-crew' | 'fasilitas-kamar';

const CATEGORY_SUBS: Record<CategoryKey, SubKey[]> = {
  organisasi: ['lokasi', 'departemen', 'jabatan', 'stasiun'],
  akomodasi: ['unit-akomodasi', 'gedung', 'kamar', 'tempat-tidur', 'tipe-kamar'],
  karyawan: ['data-crew', 'status-karyawan'],
  fasilitas: ['fasilitas-kamar'],
  operasional: ['status-reservasi', 'status-kamar', 'status-maintenance'],
};

const SUB_META: Record<SubKey, { label: string; description: string; list?: ListSub; exportEntity?: string }> = {
  lokasi: {
    label: 'Lokasi',
    description: 'Master lokasi operasional: Halim, Karawang, Padalarang, Tegalluar, dan Depo 501. Tidak semua lokasi memiliki akomodasi; alamat diisi hanya setelah diverifikasi.',
    list: 'lokasi',
    exportEntity: 'locations',
  },
  departemen: {
    label: 'Departemen',
    description: 'Daftar departemen diturunkan dari data karyawan yang disinkronkan. Sumber eksternal tidak dapat diubah dari aplikasi.',
    exportEntity: 'departments',
  },
  jabatan: {
    label: 'Jabatan',
    description: 'Daftar jabatan diturunkan dari data karyawan. Perubahan mengikuti sumber data SDM.',
    exportEntity: 'positions',
  },
  stasiun: {
    label: 'Stasiun',
    description: 'Kode stasiun asal karyawan yang tercatat pada data impor dan sinkronisasi SDM.',
  },
  'unit-akomodasi': {
    label: 'Unit Akomodasi',
    description: 'Dormitory sebagai unit akomodasi, tertaut ke master lokasi bila tersedia. Perubahan detail unit dilakukan pada menu inventaris.',
    list: 'unit-akomodasi',
    exportEntity: 'dormitories',
  },
  gedung: {
    label: 'Gedung',
    description: 'Gedung dikelola per dormitory. Kode gedung unik di dalam unitnya.',
    list: 'gedung',
    exportEntity: 'buildings',
  },
  kamar: {
    label: 'Kamar',
    description: 'Daftar kamar lintas dormitory. Tambah kamar dan atur fasilitas dilakukan dari menu inventaris.',
    list: 'kamar',
    exportEntity: 'rooms',
  },
  'tempat-tidur': {
    label: 'Tempat Tidur',
    description: 'Daftar bed beserta status operasional dan kesiapan housekeeping.',
    list: 'tempat-tidur',
    exportEntity: 'beds',
  },
  'tipe-kamar': {
    label: 'Tipe Kamar',
    description: 'Tipe kamar dan kapasitas default. Tipe yang masih dipakai kamar aktif tidak dapat dinonaktifkan.',
    list: 'tipe-kamar',
    exportEntity: 'room-types',
  },
  'data-crew': {
    label: 'Data Karyawan',
    description:
      'Data karyawan dikelola langsung di sini: impor Excel terverifikasi, sinkronisasi SDM, pencarian, dan detail karyawan. Menu terpisah Data Karyawan sudah tidak tersedia.',
    list: 'data-crew',
  },
  'status-karyawan': {
    label: 'Status Karyawan',
    description: 'Distribusi status kepegawaian dari data sumber. Nilai status berasal dari integrasi SDM.',
  },
  'fasilitas-kamar': {
    label: 'Fasilitas Kamar',
    description: 'Master fasilitas kamar. Fasilitas nonaktif tidak lagi ditawarkan saat membuat kamar baru.',
    list: 'fasilitas-kamar',
    exportEntity: 'facilities',
  },
  'status-reservasi': {
    label: 'Status Reservasi',
    description: 'Status siklus hidup reservasi didefinisikan pada kode aplikasi dan tidak dapat diubah dari UI.',
  },
  'status-kamar': {
    label: 'Status Kamar',
    description: 'Status operasional kamar dan status kesiapan housekeeping adalah nilai tetap pada alur operasional.',
  },
  'status-maintenance': {
    label: 'Status Maintenance',
    description: 'Status dan prioritas tiket maintenance adalah nilai tetap pada alur operasional.',
  },
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft — belum diajukan',
  PENDING_APPROVAL: 'Menunggu persetujuan',
  CONFIRMED: 'Terkonfirmasi',
  CHECKED_IN: 'Sudah check-in',
  CHECKED_OUT: 'Sudah check-out',
  CANCELLED: 'Dibatalkan',
  REJECTED: 'Ditolak',
  NO_SHOW: 'Tidak hadir',
  EXCEPTION: 'Pengecualian',
  ACTIVE: 'Aktif dan dapat dipakai',
  INACTIVE: 'Nonaktif',
  MAINTENANCE: 'Dalam maintenance',
  BLOCKED: 'Diblokir',
  READY: 'Siap dipakai',
  DIRTY: 'Kotor, menunggu housekeeping',
  CLEANING: 'Sedang dibersihkan',
  INSPECTION_REQUIRED: 'Menunggu inspeksi',
  OPEN: 'Terbuka',
  IN_REVIEW: 'Ditinjau',
  IN_PROGRESS: 'Dikerjakan',
  RESOLVED: 'Selesai, menunggu penutupan',
  CLOSED: 'Ditutup',
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

type EditorKind = 'location' | 'room-type' | 'facility' | 'dormitory' | 'building';

interface EditorState {
  kind: EditorKind;
  row?: Record<string, unknown>;
}

interface ConfirmState {
  kind: EditorKind;
  row: Record<string, unknown>;
  activate: boolean;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? errorMessage(cause) : 'Operasi tidak dapat diselesaikan.';
}

export function MasterDataPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const params = useListParams({
    cat: 'organisasi',
    sub: 'lokasi',
    q: '',
    status: '',
    page: '1',
    pageSize: '15',
  });
  const { value: search, setValue: setSearch } = useUrlSyncedSearch(
    params.values.q,
    (q) => params.setFilters({ q }),
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const category = (params.values.cat as CategoryKey) in CATEGORY_SUBS ? (params.values.cat as CategoryKey) : 'organisasi';
  const categorySubs = CATEGORY_SUBS[category].filter(
    (key) => key !== 'data-crew' || hasPermission('employees.read'),
  );
  const sub = categorySubs.includes(params.values.sub as SubKey)
    ? (params.values.sub as SubKey)
    : categorySubs[0]!;
  const meta = SUB_META[sub];
  const list = sub === 'data-crew' ? null : meta.list;

  const statusFiltered = ['lokasi', 'unit-akomodasi', 'gedung', 'kamar', 'tempat-tidur', 'tipe-kamar', 'fasilitas-kamar'].includes(sub);
  const employeesFiltered = sub === 'data-crew';

  interface ListResponse {
    items: any[];
    pagination: PaginationMeta;
  }

  const listQuery = useQuery<ListResponse | null>({
    queryKey: ['master-data', list, params.values],
    queryFn: async () => {
      const common = queryString({
        q: params.values.q,
        page: params.page,
        pageSize: params.pageSize,
        status: statusFiltered ? params.values.status : undefined,
        employmentStatus: employeesFiltered ? params.values.status : undefined,
      });
      switch (list) {
        case 'lokasi':
          return apiRequest<Paged<LocationSummary>>(`/api/v1/master-data/locations${common}`);
        case 'unit-akomodasi':
          return apiRequest<Paged<DormitorySummary>>(`/api/v1/dormitories${common}`);
        case 'gedung':
          return apiRequest<Paged<BuildingRow>>(`/api/v1/master-data/buildings${common}`);
        case 'kamar':
          return apiRequest<Paged<RoomRow>>(`/api/v1/master-data/rooms${common}`);
        case 'tempat-tidur':
          return apiRequest<Paged<BedRow>>(`/api/v1/master-data/beds${common}`);
        case 'tipe-kamar':
          return apiRequest<Paged<RoomTypeSummary>>(`/api/v1/master-data/room-types${common}`);
        case 'fasilitas-kamar':
          return apiRequest<Paged<FacilitySummary>>(`/api/v1/master-data/facilities${common}`);
        case 'data-crew':
          return apiRequest<Paged<EmployeeSummary>>(`/api/v1/employees${common}`);
        default:
          return null;
      }
    },
    enabled: Boolean(list),
    placeholderData: (previous: ListResponse | null | undefined) => previous,
  });

  const organization = useQuery({
    queryKey: ['master-data', 'organization'],
    queryFn: () => apiRequest<OrganizationResponse>('/api/v1/master-data/organization'),
    enabled: ['departemen', 'jabatan', 'stasiun', 'status-karyawan', 'data-crew'].includes(sub),
    staleTime: 60_000,
  });

  const dormitoryOptions = useQuery({
    queryKey: ['master-data', 'dormitory-options'],
    queryFn: () =>
      apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50&status=ACTIVE'),
    enabled: editor?.kind === 'building',
    staleTime: 60_000,
  });

  const locationOptions = useQuery({
    queryKey: ['master-data', 'location-options'],
    queryFn: () =>
      apiRequest<Paged<LocationSummary>>('/api/v1/master-data/locations?pageSize=100&status=ACTIVE'),
    enabled: editor?.kind === 'dormitory' && hasPermission('locations.read'),
    staleTime: 60_000,
  });

  const rows = listQuery.data?.items ?? [];
  const canCreate =
    (sub === 'tipe-kamar' && hasPermission('rooms.create')) ||
    (sub === 'fasilitas-kamar' && hasPermission('facilities.manage')) ||
    (sub === 'lokasi' && hasPermission('locations.manage')) ||
    (sub === 'unit-akomodasi' && hasPermission('dormitories.create')) ||
    (sub === 'gedung' && hasPermission('buildings.manage'));

  const canEditRow =
    (sub === 'tipe-kamar' && hasPermission('rooms.update')) ||
    (sub === 'fasilitas-kamar' && hasPermission('facilities.manage')) ||
    (sub === 'lokasi' && hasPermission('locations.manage')) ||
    (sub === 'unit-akomodasi' && hasPermission('dormitories.update')) ||
    (sub === 'gedung' && hasPermission('buildings.manage'));

  const importEntity =
    sub === 'unit-akomodasi'
      ? ('dormitories' as const)
      : sub === 'gedung'
        ? ('buildings' as const)
        : sub === 'kamar'
          ? ('rooms' as const)
          : sub === 'tempat-tidur'
            ? ('beds' as const)
            : null;
  const canImport =
    (importEntity === 'dormitories' && hasPermission('dormitories.create')) ||
    (importEntity === 'buildings' && hasPermission('buildings.manage')) ||
    (importEntity === 'rooms' && hasPermission('rooms.create')) ||
    (importEntity === 'beds' && hasPermission('beds.manage'));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['master-data'] });
    void queryClient.invalidateQueries({ queryKey: ['dormitories'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editor) return;
      const editing = Boolean(editor.row);
      switch (editor.kind) {
        case 'location': {
          const body = {
            code: form.code?.trim(),
            name: form.name?.trim(),
            description: form.description?.trim() || undefined,
            address: form.address?.trim() || undefined,
            ...(editing ? { status: form.status || 'ACTIVE' } : {}),
          };
          return editing
            ? apiRequest(`/api/v1/master-data/locations/${editor.row!.id}`, {
                method: 'PATCH',
                body: JSON.stringify(body),
              })
            : apiRequest('/api/v1/master-data/locations', {
                method: 'POST',
                body: JSON.stringify(body),
              });
        }
        case 'room-type': {
          const body = {
            code: form.code?.trim(),
            name: form.name?.trim(),
            description: form.description?.trim() || undefined,
            defaultCapacity: Number(form.defaultCapacity || 2),
            ...(editing ? { status: form.status || 'ACTIVE' } : {}),
          };
          return editing
            ? apiRequest(`/api/v1/master-data/room-types/${editor.row!.id}`, {
                method: 'PATCH',
                body: JSON.stringify(body),
              })
            : apiRequest('/api/v1/master-data/room-types', {
                method: 'POST',
                body: JSON.stringify(body),
              });
        }
        case 'facility': {
          const body = {
            code: form.code?.trim(),
            name: form.name?.trim(),
            description: form.description?.trim() || undefined,
            ...(editing ? { status: form.status || 'ACTIVE' } : {}),
          };
          return editing
            ? apiRequest(`/api/v1/facilities/${editor.row!.id}`, {
                method: 'PATCH',
                body: JSON.stringify(body),
              })
            : apiRequest('/api/v1/facilities', { method: 'POST', body: JSON.stringify(body) });
        }
        case 'dormitory': {
          const body = {
            code: form.code?.trim(),
            name: form.name?.trim(),
            stationCode: form.stationCode?.trim() || undefined,
            address: form.address?.trim() || undefined,
            contactName: form.contactName?.trim() || undefined,
            contactPhone: form.contactPhone?.trim() || undefined,
            ...(form.locationId
              ? { locationId: form.locationId }
              : editing
                ? { locationId: null }
                : {}),
            ...(editing ? { status: form.status || 'ACTIVE' } : {}),
          };
          return editing
            ? apiRequest(`/api/v1/dormitories/${editor.row!.id}`, {
                method: 'PATCH',
                body: JSON.stringify(body),
              })
            : apiRequest('/api/v1/dormitories', { method: 'POST', body: JSON.stringify(body) });
        }
        case 'building': {
          const body = {
            code: form.code?.trim(),
            name: form.name?.trim(),
            ...(editing ? { status: form.status || 'ACTIVE' } : {}),
          };
          return editing
            ? apiRequest(`/api/v1/buildings/${editor.row!.id}`, {
                method: 'PATCH',
                body: JSON.stringify(body),
              })
            : apiRequest(`/api/v1/dormitories/${form.dormitoryId}/buildings`, {
                method: 'POST',
                body: JSON.stringify(body),
              });
        }
      }
    },
    onSuccess: () => {
      setEditor(null);
      setFeedback(editor?.row ? 'Perubahan master data disimpan.' : 'Master data baru ditambahkan.');
      refresh();
    },
    onError: (cause) => setActionError(errorText(cause)),
  });

  const toggle = useMutation({
    mutationFn: async (state: ConfirmState) => {
      const id = String(state.row.id);
      const nextStatus = state.activate ? 'ACTIVE' : 'INACTIVE';
      switch (state.kind) {
        case 'location':
          return apiRequest(`/api/v1/master-data/locations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          });
        case 'room-type':
          return apiRequest(`/api/v1/master-data/room-types/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          });
        case 'facility':
          return apiRequest(`/api/v1/facilities/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          });
        case 'building':
          return apiRequest(`/api/v1/buildings/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          });
        case 'dormitory':
          return apiRequest(
            state.activate
              ? `/api/v1/dormitories/${id}`
              : `/api/v1/dormitories/${id}/deactivate`,
            {
              method: state.activate ? 'PATCH' : 'POST',
              ...(state.activate ? { body: JSON.stringify({ status: 'ACTIVE' }) } : {}),
            },
          );
      }
    },
    onSuccess: (_data, state) => {
      setConfirm(null);
      setFeedback(state.activate ? 'Data diaktifkan.' : 'Data dinonaktifkan.');
      refresh();
    },
    onError: (cause) => setActionError(errorText(cause)),
  });

  const openEditor = (kind: EditorKind, row?: Record<string, unknown>) => {
    setActionError(null);
    setEditor({ kind, row });
    setForm(
      row
        ? Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value === null ? '' : String(value)]),
          )
        : kind === 'room-type'
          ? { defaultCapacity: '2', status: 'ACTIVE' }
          : { status: 'ACTIVE' },
    );
  };

  const handleExport = async () => {
    if (!meta.exportEntity) return;
    setActionError(null);
    try {
      await downloadFile(
        `/api/v1/master-data/export?entity=${meta.exportEntity}`,
        `whoosh-stay-${meta.exportEntity}.xlsx`,
      );
      setFeedback('Export Excel dimulai.');
    } catch (cause) {
      setActionError(errorText(cause));
    }
  };

  const categoryTabs = (Object.keys(CATEGORY_SUBS) as CategoryKey[]).map((key) => ({
    value: key,
    label: humanize(key.toUpperCase()),
  }));
  const subTabs = categorySubs.map((key) => ({ value: key, label: SUB_META[key].label }));

  const statusOptions = useMemo(() => {
    if (sub === 'data-crew') return organization.data?.employmentStatuses ?? [];
    return [
      { value: 'ACTIVE', label: 'Aktif', count: 0 },
      { value: 'INACTIVE', label: 'Nonaktif', count: 0 },
    ];
  }, [organization.data, sub]);

  const total = listQuery.data?.pagination.total;

  const listColumns: Array<DataTableColumn<Record<string, any>>> = list
    ? [
        ...columnsFor(list).map((column) => ({
          key: column.key,
          header: column.header,
          render: (row: Record<string, any>) => (
            <div className="text-xs text-ink-600">{column.render(row)}</div>
          ),
        })),
        {
          key: 'actions',
          header: 'Aksi',
          align: 'right' as const,
          render: (row: Record<string, any>) => (
            <RowActions
              sub={list}
              row={row}
              canEdit={canEditRow}
              onEdit={(record) => openEditor(editorKindFor(list), record)}
              onToggle={(record, activate) =>
                setConfirm({ kind: editorKindFor(list), row: record, activate })
              }
            />
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrasi"
        title="Master data"
        description="Sumber data referensi untuk organisasi, akomodasi, karyawan, fasilitas, dan status operasional. Data yang berasal dari integrasi eksternal bersifat baca-saja."
        actions={
          <>
            {meta.exportEntity && hasPermission('reports.export') ? (
              <Button variant="secondary" onClick={() => void handleExport()}>
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
            ) : null}
            {canCreate ? (
              <Button onClick={() => openEditor(editorKindFor(sub))}>
                <Plus className="h-4 w-4" />
                Tambah data
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-3">
        <Tabs
          ariaLabel="Kategori master data"
          value={category}
          onChange={(next) =>
            params.setFilters({ cat: next, sub: CATEGORY_SUBS[next][0]!, q: '', status: '' })
          }
          items={categoryTabs}
        />
        <div className="flex flex-wrap items-center gap-2">
          {subTabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => params.setFilters({ sub: item.value, q: '', status: '' })}
              className={
                item.value === sub
                  ? 'rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800'
                  : 'rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-500 hover:border-ink-300 hover:text-ink-800'
              }
              aria-current={item.value === sub ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <NoticeLine message={meta.description} />

      {sub === 'data-crew' ? <EmployeesPage embedded /> : null}

      {feedback ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button type="button" className="font-semibold" onClick={() => setFeedback(null)}>
            Tutup
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          <span>{actionError}</span>
          <button type="button" className="font-semibold" onClick={() => setActionError(null)}>
            Tutup
          </button>
        </div>
      ) : null}

      {list ? (
        <Card>
          <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <form
              className="relative w-full lg:max-w-sm"
              onSubmit={(event) => {
                event.preventDefault();
                params.setFilters({ q: search.trim() });
              }}
            >
              <SearchInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kode, nama, atau unit"
                aria-label="Cari master data"
              />
            </form>
            <div className="flex flex-wrap items-center gap-2">
              {statusFiltered || employeesFiltered ? (
                <Select
                  value={params.values.status}
                  onChange={(event) => params.setFilters({ status: event.target.value })}
                  aria-label="Filter status"
                  className="w-auto"
                >
                  <option value="">Semua status</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              <span className="text-xs text-ink-400">
                {total !== undefined ? `${total} data` : 'Memuat…'}
              </span>
            </div>
          </div>

          <DataTable
            columns={listColumns}
            rows={rows}
            rowKey={(row) => String(row.id)}
            ariaLabel={`Tabel master data ${meta.label}`}
            loading={listQuery.isLoading}
            error={listQuery.isError ? errorText(listQuery.error) : null}
            onRetry={() => listQuery.refetch()}
            emptyTitle="Tidak ada data yang cocok"
            emptyDescription="Ubah kata kunci atau filter status, atau tambahkan data baru bila diizinkan."
            emptyIcon={<Search className="h-5 w-5" />}
            rowClassName={() => 'hover:bg-ink-50/40'}
            minWidthClass="min-w-[860px]"
            footer={
              listQuery.data ? (
                <Pagination
                  page={params.page}
                  pageSize={params.pageSize}
                  total={listQuery.data.pagination.total}
                  onPageChange={params.setPage}
                  onPageSizeChange={params.setPageSize}
                  fetching={listQuery.isFetching}
                  itemLabel="data"
                />
              ) : null
            }
          />
        </Card>
      ) : null}

      {importEntity && canImport ? <MasterImportPanel entity={importEntity} /> : null}

      {['departemen', 'jabatan', 'stasiun', 'status-karyawan'].includes(sub) ? (
        <Card>
          {organization.isError ? (
            <div className="p-4">
              <ErrorState
                message="Data organisasi tidak dapat dimuat."
                onRetry={() => organization.refetch()}
              />
            </div>
          ) : null}
          {organization.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}
          {organization.data ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 text-xs text-ink-500">
                <span>
                  {organization.data.employeeCount} karyawan · sumber{' '}
                  <Badge tone="warning">{organization.data.sourceSystem}</Badge>
                </span>
                <span>
                  Sinkron terakhir:{' '}
                  {organization.data.lastSyncedAt
                    ? formatDateTime(organization.data.lastSyncedAt)
                    : '—'}
                </span>
              </div>
              <OptionTable
                title={SUB_META[sub].label}
                items={
                  sub === 'departemen'
                    ? organization.data.departments
                    : sub === 'jabatan'
                      ? organization.data.positions
                      : sub === 'stasiun'
                        ? organization.data.stations
                        : organization.data.employmentStatuses
                }
                emptyMessage="Belum ada data dari sumber karyawan."
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {sub === 'status-reservasi' || sub === 'status-kamar' || sub === 'status-maintenance' ? (
        <Card>
          <CodeStatusTable sub={sub} />
        </Card>
      ) : null}

      {editor ? (
        <EditorModal
          editor={editor}
          form={form}
          setForm={setForm}
          saving={save.isPending}
          error={actionError}
          dormitoryOptions={dormitoryOptions.data?.items ?? []}
          locationOptions={locationOptions.data?.items ?? []}
          onClose={() => {
            setEditor(null);
            setActionError(null);
          }}
          onSave={() => {
            setActionError(null);
            save.mutate();
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={confirm.activate ? 'Aktifkan data?' : 'Nonaktifkan data?'}
          description={`${String(confirm.row.name ?? confirm.row.roomNumber ?? confirm.row.bedCode ?? 'Data')} akan ${confirm.activate ? 'diaktifkan' : 'dinonaktifkan'}. ${
            confirm.activate
              ? 'Data akan tersedia kembali pada pilihan operasional.'
              : 'Data yang masih terhubung dengan transaksi aktif dapat ditolak oleh server.'
          }`}
          confirmLabel={confirm.activate ? 'Aktifkan' : 'Nonaktifkan'}
          tone={confirm.activate ? 'primary' : 'danger'}
          loading={toggle.isPending}
          onConfirm={() => {
            setActionError(null);
            toggle.mutate(confirm);
          }}
        />
      ) : null}

      <p className="px-1 text-[11px] leading-5 text-ink-400">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-brand-600" />
        Setiap perubahan master data divalidasi di server, dibatasi oleh scope akomodasi, dan dicatat
        pada log audit.
      </p>
    </div>
  );
}

function NoticeLine({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white/70 px-4 py-3 text-xs leading-5 text-ink-500">
      {message}
    </div>
  );
}

function editorKindFor(sub: SubKey): EditorKind {
  switch (sub) {
    case 'tipe-kamar':
      return 'room-type';
    case 'fasilitas-kamar':
      return 'facility';
    case 'lokasi':
      return 'location';
    case 'unit-akomodasi':
      return 'dormitory';
    default:
      return 'building';
  }
}

interface ColumnDef {
  key: string;
  header: string;
  render: (row: Record<string, any>) => ReactNode;
}

function columnsFor(sub: ListSub): ColumnDef[] {
  switch (sub) {
    case 'lokasi':
      return [
        { key: 'name', header: 'Lokasi', render: (row) => <PrimaryMetric primary={row.name} secondary={row.code} /> },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'dormitories', header: 'Unit akomodasi', render: (row) => row.dormitoryCount },
        { key: 'address', header: 'Alamat', render: (row) => <span className="max-w-[220px] truncate">{row.address ?? 'Belum diverifikasi'}</span> },
        { key: 'description', header: 'Deskripsi', render: (row) => <span className="line-clamp-2 max-w-[260px]">{row.description ?? '—'}</span> },
      ];
    case 'unit-akomodasi':
      return [
        { key: 'name', header: 'Dormitory', render: (row) => <PrimaryMetric primary={row.name} secondary={`${row.code} · ${row.stationCode ?? 'Tanpa stasiun'}`} /> },
        { key: 'location', header: 'Lokasi', render: (row) => row.locationName ?? '—' },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'buildings', header: 'Gedung', render: (row) => row.buildingCount },
        { key: 'rooms', header: 'Kamar', render: (row) => row.roomCount },
        { key: 'beds', header: 'Bed', render: (row) => row.bedCount },
      ];
    case 'gedung':
      return [
        { key: 'name', header: 'Gedung', render: (row) => <PrimaryMetric primary={row.name} secondary={row.code} /> },
        { key: 'dormitory', header: 'Dormitory', render: (row) => row.dormitoryName },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'floors', header: 'Lantai', render: (row) => row.floorCount },
        { key: 'rooms', header: 'Kamar', render: (row) => row.roomCount },
      ];
    case 'kamar':
      return [
        { key: 'room', header: 'Kamar', render: (row) => <PrimaryMetric primary={`Kamar ${row.roomNumber}`} secondary={row.name ?? '—'} /> },
        { key: 'unit', header: 'Lokasi', render: (row) => `${row.dormitoryName} · ${row.buildingName} · Lt. ${row.floorNumber}` },
        { key: 'type', header: 'Tipe', render: (row) => row.roomTypeName },
        { key: 'beds', header: 'Bed', render: (row) => row.bedCount },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'readiness', header: 'Kesiapan', render: (row) => <StatusBadge status={row.housekeepingStatus} /> },
      ];
    case 'tempat-tidur':
      return [
        { key: 'bed', header: 'Bed', render: (row) => <PrimaryMetric primary={row.bedCode} secondary={row.label ?? 'Tanpa label'} /> },
        { key: 'room', header: 'Kamar', render: (row) => row.roomNumber },
        { key: 'unit', header: 'Lokasi', render: (row) => `${row.dormitoryName} · ${row.buildingName}` },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'readiness', header: 'Kesiapan', render: (row) => <StatusBadge status={row.housekeepingStatus} /> },
      ];
    case 'tipe-kamar':
      return [
        { key: 'name', header: 'Tipe kamar', render: (row) => <PrimaryMetric primary={row.name} secondary={row.code} /> },
        { key: 'capacity', header: 'Kapasitas', render: (row) => `${row.defaultCapacity} orang` },
        { key: 'rooms', header: 'Dipakai', render: (row) => `${row.roomCount} kamar` },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'description', header: 'Deskripsi', render: (row) => <span className="line-clamp-2 max-w-[260px]">{row.description ?? '—'}</span> },
      ];
    case 'fasilitas-kamar':
      return [
        { key: 'name', header: 'Fasilitas', render: (row) => <PrimaryMetric primary={row.name} secondary={row.code} /> },
        { key: 'rooms', header: 'Dipakai', render: (row) => `${row.roomCount} kamar` },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'description', header: 'Deskripsi', render: (row) => <span className="line-clamp-2 max-w-[320px]">{row.description ?? '—'}</span> },
      ];
    case 'data-crew':
      return [
        { key: 'name', header: 'Karyawan', render: (row) => <PrimaryMetric primary={row.fullName} secondary={`${row.employeeCode} · ${row.workEmail ?? 'Email belum tersedia'}`} /> },
        { key: 'department', header: 'Departemen', render: (row) => row.departmentName ?? '—' },
        { key: 'position', header: 'Jabatan', render: (row) => row.positionName ?? '—' },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.employmentStatus} /> },
        { key: 'station', header: 'Stasiun', render: (row) => row.homeStationCode ?? '—' },
        { key: 'synced', header: 'Sinkron', render: (row) => (row.syncedAt ? formatDateTime(row.syncedAt) : '—') },
      ];
  }
}

function PrimaryMetric({ primary, secondary }: { primary: ReactNode; secondary: string }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-ink-900">{primary}</p>
      <p className="max-w-[240px] truncate text-[11px] text-ink-400">{secondary}</p>
    </div>
  );
}

function RowActions({
  sub,
  row,
  canEdit,
  onEdit,
  onToggle,
}: {
  sub: ListSub;
  row: Record<string, any>;
  canEdit: boolean;
  onEdit: (row: Record<string, unknown>) => void;
  onToggle: (row: Record<string, unknown>, activate: boolean) => void;
}) {
  if (sub === 'kamar' || sub === 'tempat-tidur' || sub === 'data-crew') {
    return (
      <div className="flex justify-end">
        <Link
          to={sub === 'data-crew' ? '/manage/employees' : '/manage/inventory'}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
        >
          {sub === 'data-crew' ? 'Data karyawan' : 'Kelola inventaris'}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }
  const isActive = row.status === 'ACTIVE';
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={!canEdit}
        onClick={() => onEdit(row)}
        aria-label={`Edit ${String(row.name ?? 'data')}`}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!canEdit}
        onClick={() => onToggle(row, !isActive)}
        aria-label={isActive ? `Nonaktifkan ${String(row.name ?? 'data')}` : `Aktifkan ${String(row.name ?? 'data')}`}
      >
        <Power className={`h-3.5 w-3.5 ${isActive ? 'text-red-500' : 'text-emerald-600'}`} />
        {isActive ? 'Nonaktifkan' : 'Aktifkan'}
      </Button>
    </div>
  );
}

function OptionTable({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: MasterDataOption[];
  emptyMessage: string;
}) {
  const columns: Array<DataTableColumn<MasterDataOption>> = [
    {
      key: 'code',
      header: 'Kode',
      render: (item) => <span className="font-mono text-[11px] text-ink-500">{item.value}</span>,
    },
    {
      key: 'name',
      header: 'Nama',
      render: (item) => <span className="text-xs font-semibold text-ink-800">{item.label}</span>,
    },
    {
      key: 'count',
      header: 'Jumlah',
      align: 'right',
      render: (item) => <span className="text-xs text-ink-600">{item.count}</span>,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-bold text-ink-950">{title}</h2>
        <Badge tone="neutral">Baca-saja</Badge>
      </div>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(item) => `${item.value}-${item.label}`}
        ariaLabel={`Tabel ${title}`}
        emptyTitle={emptyMessage}
        emptyDescription=""
        minWidthClass="min-w-[440px]"
      />
    </div>
  );
}

function CodeStatusTable({ sub }: { sub: 'status-reservasi' | 'status-kamar' | 'status-maintenance' }) {
  const groups =
    sub === 'status-reservasi'
      ? [{ title: 'Status reservasi', codes: RESERVATION_STATUSES }]
      : sub === 'status-kamar'
        ? [
            { title: 'Status operasional kamar', codes: ROOM_OPERATIONAL_STATUSES },
            { title: 'Status kesiapan housekeeping', codes: READINESS_STATUSES },
          ]
        : [
            { title: 'Status tiket maintenance', codes: MAINTENANCE_STATUSES },
            { title: 'Prioritas maintenance', codes: MAINTENANCE_PRIORITIES },
          ];

  return (
    <div className="divide-y divide-ink-100">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-bold text-ink-950">{groups.map((group) => group.title).join(' · ')}</h2>
        <Badge tone="neutral">Didefinisikan kode</Badge>
      </div>
      {groups.map((group) => (
        <div key={group.title}>
          <p className="bg-ink-50/60 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
            {group.title}
          </p>
          <div className="divide-y divide-ink-50">
            {group.codes.map((code) => (
              <div key={code} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <code className="font-mono text-[11px] text-brand-700">{code}</code>
                <p className="text-xs text-ink-500">{STATUS_LABELS[code] ?? humanize(code)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditorModal({
  editor,
  form,
  setForm,
  saving,
  error,
  dormitoryOptions,
  locationOptions,
  onClose,
  onSave,
}: {
  editor: EditorState;
  form: Record<string, string>;
  setForm: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  saving: boolean;
  error: string | null;
  dormitoryOptions: DormitorySummary[];
  locationOptions: LocationSummary[];
  onClose: () => void;
  onSave: () => void;
}) {
  const editing = Boolean(editor.row);
  const titles: Record<EditorKind, string> = {
    location: 'lokasi',
    'room-type': 'tipe kamar',
    facility: 'fasilitas',
    dormitory: 'dormitory',
    building: 'gedung',
  };
  const update = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${editing ? 'Edit' : 'Tambah'} ${titles[editor.kind]}`}
      description={
        editing
          ? 'Perubahan disimpan ke database dan dicatat pada log audit.'
          : 'Data baru langsung tersedia untuk modul terkait setelah disimpan.'
      }
    >
      <div className="space-y-4">
        {editor.kind === 'building' && !editing ? (
          <Field label="Dormitory *">
            <Select value={form.dormitoryId ?? ''} onChange={(event) => update('dormitoryId', event.target.value)}>
              <option value="">Pilih dormitory</option>
              {dormitoryOptions.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {dormitory.code} — {dormitory.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kode *">
            <Input
              value={form.code ?? ''}
              onChange={(event) => update('code', event.target.value)}
              placeholder="Contoh: DRM-01"
            />
          </Field>
          <Field label="Nama *">
            <Input
              value={form.name ?? ''}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Nama master data"
            />
          </Field>
        </div>

        {editor.kind === 'room-type' ? (
          <Field label="Kapasitas default *" hint="Jumlah bed yang disarankan per kamar (1–30).">
            <Input
              type="number"
              min={1}
              max={30}
              value={form.defaultCapacity ?? '2'}
              onChange={(event) => update('defaultCapacity', event.target.value)}
            />
          </Field>
        ) : null}

        {editor.kind === 'dormitory' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lokasi" hint="Master lokasi operasional. Kosongkan bila belum tertaut.">
              <Select
                value={form.locationId ?? ''}
                onChange={(event) => update('locationId', event.target.value)}
              >
                <option value="">Tanpa lokasi</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kode stasiun">
              <Input
                value={form.stationCode ?? ''}
                onChange={(event) => update('stationCode', event.target.value)}
              />
            </Field>
            <Field label="Alamat">
              <Input
                value={form.address ?? ''}
                onChange={(event) => update('address', event.target.value)}
              />
            </Field>
            <Field label="Nama kontak">
              <Input
                value={form.contactName ?? ''}
                onChange={(event) => update('contactName', event.target.value)}
              />
            </Field>
            <Field label="Telepon kontak">
              <Input
                value={form.contactPhone ?? ''}
                onChange={(event) => update('contactPhone', event.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {editor.kind === 'location' ? (
          <Field label="Alamat" hint="Isi hanya dengan alamat yang sudah diverifikasi tim operasional.">
            <Input
              value={form.address ?? ''}
              onChange={(event) => update('address', event.target.value)}
            />
          </Field>
        ) : null}

        {editor.kind !== 'dormitory' && editor.kind !== 'building' ? (
          <Field label="Deskripsi">
            <Textarea
              rows={3}
              value={form.description ?? ''}
              onChange={(event) => update('description', event.target.value)}
            />
          </Field>
        ) : null}

        {editing ? (
          <Field label="Status">
            <Select value={form.status ?? 'ACTIVE'} onChange={(event) => update('status', event.target.value)}>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </Select>
          </Field>
        ) : null}

        {editor.kind === 'dormitory' && editing ? (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800">
            Menonaktifkan dormitory ditolak bila masih ada reservasi aktif atau alokasi berjalan.
            Gunakan tombol Nonaktif pada tabel.
          </p>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button loading={saving} onClick={onSave}>
            {editing ? 'Simpan perubahan' : 'Tambah data'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
