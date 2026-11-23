import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import {
  RESERVATION_EXCEPTION_SEVERITIES,
  RESERVATION_EXCEPTION_SEVERITY_LABELS,
  RESERVATION_EXCEPTION_STATUSES,
  RESERVATION_EXCEPTION_STATUS_LABELS,
  RESERVATION_EXCEPTION_TYPES,
  RESERVATION_EXCEPTION_TYPE_LABELS,
  type DormitorySummary,
  type ReservationExceptionDetail,
  type ReservationExceptionListResult,
  type ReservationExceptionSeverity,
  type ReservationExceptionStatus,
} from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  Field,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  Textarea,
  type DataTableColumn,
} from '../components/ui';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import type { Paged } from '../lib/types';

const SEVERITY_TONE: Record<ReservationExceptionSeverity, 'danger' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

const STATUS_TONE: Record<ReservationExceptionStatus, 'danger' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'danger',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',
  DISMISSED: 'neutral',
};

export function ManagementExceptionsPage() {
  const { me, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('exceptions.manage');

  const [status, setStatus] = useState<string>('OPEN');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [dormitoryId, setDormitoryId] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const exceptions = useQuery({
    queryKey: [
      'exceptions',
      { status, severity, type, dormitoryId, assignedToMe, search: debouncedSearch, page, pageSize },
    ],
    queryFn: () =>
      apiRequest<ReservationExceptionListResult>(
        `/api/v1/exceptions${queryString({
          status,
          severity,
          type,
          dormitoryId,
          assignedToMe: assignedToMe ? 'true' : undefined,
          q: debouncedSearch.trim() || undefined,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const dormitories = useQuery({
    queryKey: ['dormitories', 'exceptions'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 60_000,
  });

  const selected =
    exceptions.data?.items.find((item) => item.id === selectedId) ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['exceptions'] });
  };

  const assignMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest<ReservationExceptionDetail>(`/api/v1/exceptions/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) => {
      setActionError(null);
      setFeedback(
        updated.assignedTo
          ? `Eksepsi ditugaskan kepada ${updated.assignedTo.displayName}.`
          : 'Penugasan eksepsi dilepas.',
      );
      invalidate();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { status: 'RESOLVED' | 'DISMISSED'; resolutionNote: string };
    }) =>
      apiRequest<ReservationExceptionDetail>(`/api/v1/exceptions/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) => {
      setActionError(null);
      setFeedback(
        updated.status === 'RESOLVED'
          ? 'Eksepsi ditandai selesai.'
          : 'Eksepsi diabaikan dengan catatan.',
      );
      setSelectedId(null);
      setResolutionNote('');
      invalidate();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const counts = exceptions.data?.counts;
  const items = exceptions.data?.items ?? [];
  const openActions = selected?.status === 'OPEN' || selected?.status === 'ACKNOWLEDGED';
  const busy = assignMutation.isPending || resolveMutation.isPending;

  const resetPage = () => setPage(1);

  const columns: Array<DataTableColumn<ReservationExceptionDetail>> = [
    {
      key: 'exception',
      header: 'Eksepsi',
      render: (row) => (
        <div className="min-w-[220px]">
          <p className="font-semibold text-ink-900">{row.title}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {RESERVATION_EXCEPTION_TYPE_LABELS[row.type]}
            {row.bookingCode ? ` · ${row.bookingCode}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'dormitory',
      header: 'Lokasi',
      render: (row) => (
        <div>
          <p className="text-sm text-ink-800">{row.dormitoryName}</p>
          <p className="text-xs text-ink-500">
            {[row.roomLabel, row.bedLabel].filter(Boolean).join(' · ') || row.dormitoryCode}
          </p>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Keparahan',
      render: (row) => (
        <Badge tone={SEVERITY_TONE[row.severity]}>
          {RESERVATION_EXCEPTION_SEVERITY_LABELS[row.severity]}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status]}>
          {RESERVATION_EXCEPTION_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'assignee',
      header: 'Penanggung jawab',
      render: (row) =>
        row.assignedTo ? (
          <span className="text-sm text-ink-800">{row.assignedTo.displayName}</span>
        ) : (
          <span className="text-xs text-ink-400">Belum ditugaskan</span>
        ),
    },
    {
      key: 'detected',
      header: 'Terakhir terdeteksi',
      render: (row) => (
        <div>
          <p className="text-sm text-ink-800">{formatDateTime(row.lastDetectedAt)}</p>
          <p className="text-xs text-ink-500">{row.occurrenceCount}× terdeteksi</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasional"
        title="Pusat Eksepsi Reservasi"
        description="Antrean konflik alokasi, overbooking, dan kegagalan kesiapan kamar yang terdeteksi dari alur reservasi dan check-in."
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Terbuka"
          value={counts ? counts.open : '…'}
          hint="Belum ditangani"
          icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
          tone="warning"
        />
        <StatCard
          label="Ditangani"
          value={counts ? counts.acknowledged : '…'}
          hint="Sudah memiliki penanggung jawab"
          icon={<Clock3 className="h-5 w-5" aria-hidden />}
          tone="brand"
        />
        <StatCard
          label="Kritis terbuka"
          value={counts ? counts.criticalOpen : '…'}
          hint="Prioritas tertinggi"
          icon={<ShieldAlert className="h-5 w-5" aria-hidden />}
          tone="warning"
        />
        <StatCard
          label="Selesai"
          value={counts ? counts.resolved : '…'}
          hint="Ditutup dengan resolusi"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          tone="success"
        />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua status</option>
              {RESERVATION_EXCEPTION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RESERVATION_EXCEPTION_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Keparahan">
            <Select
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua keparahan</option>
              {RESERVATION_EXCEPTION_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {RESERVATION_EXCEPTION_SEVERITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis eksepsi">
            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua jenis</option>
              {RESERVATION_EXCEPTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RESERVATION_EXCEPTION_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dormitory">
            <Select
              value={dormitoryId}
              onChange={(event) => {
                setDormitoryId(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua dormitory</option>
              {(dormitories.data?.items ?? []).map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {dormitory.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            aria-label="Cari eksepsi"
            placeholder="Cari judul, deskripsi, atau kode booking"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            className="w-full sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={assignedToMe}
              onChange={(event) => {
                setAssignedToMe(event.target.checked);
                resetPage();
              }}
            />
            Hanya yang ditugaskan ke saya
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          ariaLabel="Antrean eksepsi reservasi"
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          loading={exceptions.isLoading}
          error={exceptions.isError ? errorMessage(exceptions.error) : null}
          onRetry={() => void exceptions.refetch()}
          onRowClick={(row) => {
            setSelectedId(row.id);
            setActionError(null);
            setResolutionNote('');
          }}
          minWidthClass="min-w-[980px]"
          emptyTitle="Tidak ada eksepsi pada filter ini"
          emptyDescription="Antrean terisi otomatis saat terjadi konflik alokasi, overbooking, atau kegagalan kesiapan kamar. Coba ubah filter atau status."
          footer={
            exceptions.data ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={exceptions.data.pagination.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                fetching={exceptions.isFetching}
                itemLabel="eksepsi"
              />
            ) : null
          }
        />
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => {
          setSelectedId(null);
          setActionError(null);
          setResolutionNote('');
        }}
        title={selected?.title ?? 'Detail eksepsi'}
        description={
          selected
            ? `${RESERVATION_EXCEPTION_TYPE_LABELS[selected.type]} · ${selected.dormitoryName}`
            : undefined
        }
        footer={
          selected && canManage && openActions ? (
            <div className="flex flex-wrap gap-2">
              {selected.assignedTo?.id === me?.user.id ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    assignMutation.mutate({
                      id: selected.id,
                      body: { assignedToUserId: null },
                    })
                  }
                >
                  Lepas penugasan
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    assignMutation.mutate({ id: selected.id, body: { assignToSelf: true } })
                  }
                >
                  Tugaskan ke saya
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={SEVERITY_TONE[selected.severity]}>
                {RESERVATION_EXCEPTION_SEVERITY_LABELS[selected.severity]}
              </Badge>
              <Badge tone={STATUS_TONE[selected.status]}>
                {RESERVATION_EXCEPTION_STATUS_LABELS[selected.status]}
              </Badge>
              <Badge tone="neutral">
                {RESERVATION_EXCEPTION_TYPE_LABELS[selected.type]}
              </Badge>
            </div>

            <p className="text-sm leading-6 text-ink-700">{selected.description}</p>

            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Dormitory
                </dt>
                <dd className="text-ink-800">
                  {selected.dormitoryName} ({selected.dormitoryCode})
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Kode booking
                </dt>
                <dd className="text-ink-800">{selected.bookingCode ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Kamar / tempat tidur
                </dt>
                <dd className="text-ink-800">
                  {[selected.roomLabel, selected.bedLabel].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Jumlah kejadian
                </dt>
                <dd className="text-ink-800">{selected.occurrenceCount}×</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Pertama terdeteksi
                </dt>
                <dd className="text-ink-800">{formatDateTime(selected.detectedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Terakhir terdeteksi
                </dt>
                <dd className="text-ink-800">{formatDateTime(selected.lastDetectedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Penanggung jawab
                </dt>
                <dd className="text-ink-800">
                  {selected.assignedTo?.displayName ?? 'Belum ditugaskan'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Status reservasi
                </dt>
                <dd className="text-ink-800">{selected.reservationStatus ?? '—'}</dd>
              </div>
            </dl>

            {selected.resolvedAt ? (
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 px-3.5 py-3 text-sm">
                <p className="font-semibold text-ink-800">
                  {selected.status === 'DISMISSED' ? 'Diabaikan' : 'Diselesaikan'} oleh{' '}
                  {selected.resolvedBy?.displayName ?? 'pengguna'} pada{' '}
                  {formatDateTime(selected.resolvedAt)}
                </p>
                {selected.resolutionNote ? (
                  <p className="mt-1 text-ink-600">{selected.resolutionNote}</p>
                ) : null}
              </div>
            ) : null}

            {selected.evidence ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Bukti teknis
                </p>
                <pre className="scrollbar-slim mt-1 max-h-56 overflow-auto rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-xs leading-5 text-ink-700">
                  {JSON.stringify(selected.evidence, null, 2)}
                </pre>
              </div>
            ) : null}

            {canManage && openActions ? (
              <div className="space-y-3 border-t border-ink-100 pt-4">
                <p className="text-sm font-semibold text-ink-900">Tindak lanjut</p>
                <Field label="Catatan penyelesaian">
                  <Textarea
                    rows={3}
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    placeholder="Jelaskan tindakan yang diambil minimal 3 karakter."
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy || resolutionNote.trim().length < 3}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: selected.id,
                        body: {
                          status: 'RESOLVED',
                          resolutionNote: resolutionNote.trim(),
                        },
                      })
                    }
                  >
                    Selesaikan
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || resolutionNote.trim().length < 3}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: selected.id,
                        body: {
                          status: 'DISMISSED',
                          resolutionNote: resolutionNote.trim(),
                        },
                      })
                    }
                  >
                    Abaikan
                  </Button>
                </div>
                {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
              </div>
            ) : null}

            {!canManage ? (
              <Notice tone="info">
                Anda dapat melihat antrean ini, tetapi tindak lanjut memerlukan izin
                exceptions.manage.
              </Notice>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
