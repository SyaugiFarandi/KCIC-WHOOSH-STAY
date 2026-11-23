import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BedDouble,
  CalendarCheck2,
  Check,
  Eye,
  Hourglass,
  UserRound,
  X,
} from 'lucide-react';
import type {
  AvailabilityResult,
  ReservationDetail,
  ReservationSummary,
  ReservationsSummary,
} from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import {
  Badge,
  Button,
  Card,
  DistributionBar,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { useListParams } from '../hooks/useListParams';
import { useUrlSyncedSearch } from '../hooks/useUrlSyncedSearch';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDateTime, humanize } from '../lib/format';
import type { Paged } from '../lib/types';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'PENDING_APPROVAL', label: 'Menunggu persetujuan' },
  { value: 'CONFIRMED', label: 'Terkonfirmasi' },
  { value: 'CHECKED_IN', label: 'Menginap' },
  { value: 'CHECKED_OUT', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'NO_SHOW', label: 'No show' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING_APPROVAL: 'bg-chart-2',
  CONFIRMED: 'bg-chart-4',
  CHECKED_IN: 'bg-chart-3',
  CHECKED_OUT: 'bg-chart-5',
  CANCELLED: 'bg-chart-6',
  REJECTED: 'bg-chart-1',
  NO_SHOW: 'bg-ink-300',
};

export function ManagementReservationsPage() {
  const { hasPermission, me } = useAuth();
  const queryClient = useQueryClient();
  const params = useListParams({
    q: '',
    status: '',
    from: '',
    to: '',
    page: '1',
    pageSize: '10',
  });
  const { value: search, setValue: setSearch } = useUrlSyncedSearch(
    params.values.q,
    (q) => params.setFilters({ q }),
  );

  const [detailId, setDetailId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ type: 'approve' | 'reject'; reservation: ReservationSummary } | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [allocating, setAllocating] = useState<ReservationSummary | null>(null);
  const [selectedBeds, setSelectedBeds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reservations = useQuery({
    queryKey: ['reservations', 'management', params.values],
    queryFn: () =>
      apiRequest<Paged<ReservationSummary>>(
        `/api/v1/reservations${queryString({
          q: params.values.q,
          status: params.values.status,
          from: params.values.from,
          to: params.values.to,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['reservations', 'summary'],
    queryFn: () => apiRequest<ReservationsSummary>('/api/v1/reservations/summary'),
    staleTime: 30_000,
  });

  const detail = useQuery({
    queryKey: ['reservation', detailId],
    queryFn: () => apiRequest<ReservationDetail>(`/api/v1/reservations/${detailId}`),
    enabled: Boolean(detailId),
  });

  const availability = useQuery({
    queryKey: ['availability', 'allocation', allocating?.id],
    queryFn: () =>
      apiRequest<AvailabilityResult>(
        `/api/v1/availability${queryString({
          checkIn: allocating!.checkInDate,
          checkOut: allocating!.checkOutDate,
          dormitoryId: allocating!.dormitoryId,
        })}`,
      ),
    enabled: Boolean(allocating),
    staleTime: 10_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    void queryClient.invalidateQueries({ queryKey: ['reservation'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) =>
      apiRequest<ReservationDetail>(`/api/v1/reservations/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(decisionNote.trim() ? { comment: decisionNote.trim() } : {}),
      }),
    onSuccess: (updated) => {
      setFeedback(`Reservasi ${updated.bookingCode} disetujui.`);
      closeDecision();
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      apiRequest<ReservationDetail>(`/api/v1/reservations/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: decisionNote.trim() }),
      }),
    onSuccess: (updated) => {
      setFeedback(`Reservasi ${updated.bookingCode} ditolak.`);
      closeDecision();
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const allocate = useMutation({
    mutationFn: (reservation: ReservationSummary) =>
      apiRequest<ReservationDetail>(`/api/v1/reservations/${reservation.id}/allocate`, {
        method: 'POST',
        body: JSON.stringify({ bedIds: selectedBeds }),
      }),
    onSuccess: (updated) => {
      setFeedback(`Alokasi tempat tidur untuk ${updated.bookingCode} tersimpan.`);
      setAllocating(null);
      setSelectedBeds([]);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const closeDecision = () => {
    setDecision(null);
    setDecisionNote('');
    setError(null);
  };

  const openAllocate = (reservation: ReservationSummary) => {
    setAllocating(reservation);
    setSelectedBeds([]);
    setError(null);
    setFeedback(null);
  };

  const toggleBed = (bedId: string, max: number) => {
    setSelectedBeds((current) => {
      if (current.includes(bedId)) return current.filter((id) => id !== bedId);
      if (current.length >= max) return [...current.slice(1), bedId];
      return [...current, bedId];
    });
  };

  const beds = availability.data?.dormitories.flatMap((item) => item.beds) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manajemen reservasi"
        title="Reservasi & persetujuan"
        description="Validasi reservasi kru, tetapkan tempat tidur, dan pantau status reservasi sesuai scope Anda."
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total reservasi"
          value={summary.data?.total ?? '—'}
          hint="Seluruh status, sesuai scope Anda"
          icon={<CalendarCheck2 className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Menunggu persetujuan"
          value={summary.data?.pendingApproval ?? '—'}
          icon={<Hourglass className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Kedatangan hari ini"
          value={summary.data?.arrivingToday ?? '—'}
          icon={<ArrowDownToLine className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Keberangkatan hari ini"
          value={summary.data?.departingToday ?? '—'}
          icon={<ArrowUpFromLine className="h-5 w-5" />}
        />
      </div>

      {summary.data ? (
        <DistributionBar
          title="Distribusi status reservasi"
          items={STATUS_OPTIONS.slice(1).map((option) => ({
            label: option.label,
            value: summary.data.byStatus[option.value] ?? 0,
            colorClass: STATUS_COLORS[option.value] ?? 'bg-ink-300',
          }))}
        />
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              params.setFilters({ q: search.trim() });
            }}
            className="grid gap-2 lg:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_auto]"
          >
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode booking atau nama kru"
              aria-label="Cari reservasi"
            />
            <Select
              value={params.values.status}
              onChange={(event) => params.setFilters({ status: event.target.value })}
              aria-label="Status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={params.values.from}
              onChange={(event) => params.setFilters({ from: event.target.value })}
              aria-label="Dari tanggal"
            />
            <Input
              type="date"
              value={params.values.to}
              onChange={(event) => params.setFilters({ to: event.target.value })}
              aria-label="Sampai tanggal"
            />
            <Button type="submit" variant="secondary">
              Terapkan
            </Button>
          </form>
          <p className="text-xs text-ink-400">
            {reservations.data ? `${reservations.data.pagination.total} reservasi` : 'Memuat…'}
          </p>
        </div>

        {reservations.isError ? (
          <div className="p-4">
            <ErrorState
              message="Daftar reservasi tidak dapat dimuat."
              onRetry={() => reservations.refetch()}
            />
          </div>
        ) : null}

        <div className="divide-y divide-ink-50">
          {reservations.isLoading
            ? Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="px-4 py-4">
                  <Skeleton className="h-9 w-full" />
                </div>
              ))
            : reservations.data?.items.map((reservation) => {
                const canApprove =
                  reservation.status === 'PENDING_APPROVAL' &&
                  reservation.approvalStatus === 'PENDING' &&
                  hasPermission('reservations.approve');
                const canAllocate =
                  ['PENDING_APPROVAL', 'CONFIRMED'].includes(reservation.status) &&
                  !reservation.allocationSummary &&
                  hasPermission('allocations.execute');
                return (
                  <div
                    key={reservation.id}
                    className="px-4 py-3 transition-colors hover:bg-ink-50/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-mono text-xs font-bold text-ink-900">
                          {reservation.bookingCode}
                        </p>
                        <StatusBadge status={reservation.status} />
                        <p className="text-[11px] text-ink-400">
                          {reservation.dormitoryName} · {humanize(reservation.source)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailId(reservation.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detail
                        </Button>
                        {canApprove ? (
                          <>
                            <Button
                              size="sm"
                              variant="subtle"
                              onClick={() => {
                                setDecision({ type: 'approve', reservation });
                                setDecisionNote('');
                                setError(null);
                              }}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Setujui
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setDecision({ type: 'reject', reservation });
                                setDecisionNote('');
                                setError(null);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Tolak
                            </Button>
                          </>
                        ) : null}
                        {canAllocate ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="whitespace-nowrap"
                            onClick={() => openAllocate(reservation)}
                          >
                            <BedDouble className="h-3.5 w-3.5" />
                            Alokasi
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-700">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sand-200 text-ink-600">
                          <UserRound className="h-3 w-3" />
                        </span>
                        <span className="truncate font-semibold">
                          {reservation.employeeName}
                        </span>
                      </span>
                      <span className="whitespace-nowrap">
                        {formatDate(reservation.checkInDate)} →{' '}
                        {formatDate(reservation.checkOutDate)}
                      </span>
                      <span className="whitespace-nowrap">{reservation.occupantCount} tamu</span>
                      <span
                        className={
                          reservation.allocationSummary ? 'text-ink-500' : 'text-amber-700'
                        }
                      >
                        {reservation.allocationSummary ?? 'Belum dialokasikan'}
                      </span>
                    </div>
                  </div>
                );
              })}
        </div>

        {reservations.data && reservations.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<CalendarCheck2 className="h-5 w-5" />}
              title="Tidak ada reservasi"
              description="Ubah filter atau kata kunci pencarian untuk melihat reservasi lain."
            />
          </div>
        ) : null}

        {reservations.data ? (
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={reservations.data.pagination.total}
            onPageChange={params.setPage}
            onPageSizeChange={params.setPageSize}
            fetching={reservations.isFetching}
            itemLabel="reservasi"
          />
        ) : null}
      </Card>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail.data ? `Reservasi ${detail.data.bookingCode}` : 'Detail reservasi'}
        size="lg"
      >
        {detail.isError ? <ErrorState message="Detail reservasi tidak dapat dimuat." /> : null}
        {detail.isLoading || !detail.data ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.data.status} />
              <Badge tone={detail.data.approvalStatus === 'PENDING' ? 'warning' : 'neutral'}>
                Approval: {humanize(detail.data.approvalStatus)}
              </Badge>
              <Badge tone="info">{humanize(detail.data.source)}</Badge>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Kru" value={detail.data.employeeName} />
              <DetailItem label="Dormitory" value={detail.data.dormitoryName} />
              <DetailItem label="Check-in" value={formatDate(detail.data.checkInDate)} />
              <DetailItem label="Check-out" value={formatDate(detail.data.checkOutDate)} />
              <DetailItem label="Tamu" value={`${detail.data.occupantCount} kru`} />
              <DetailItem label="Dibuat" value={formatDateTime(detail.data.createdAt)} />
              {detail.data.purpose ? (
                <DetailItem label="Keperluan" value={detail.data.purpose} wide />
              ) : null}
            </dl>

            <div>
              <p className="text-xs font-bold text-ink-900">Tamu</p>
              <div className="mt-2 space-y-1.5">
                {detail.data.guests.map((guest) => (
                  <div
                    key={guest.id}
                    className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-ink-800">{guest.employeeName}</span>
                    <Badge tone={guest.guestRole === 'PRIMARY' ? 'brand' : 'neutral'}>
                      {guest.guestRole === 'PRIMARY' ? 'Utama' : humanize(guest.guestRole)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-ink-900">Alokasi</p>
              {detail.data.allocations.length ? (
                <div className="mt-2 space-y-1.5">
                  {detail.data.allocations.map((allocation) => (
                    <div
                      key={allocation.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-ink-800">
                        {allocation.roomNumber}/{allocation.bedCode} · {allocation.buildingName}
                      </span>
                      <StatusBadge status={allocation.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-700">Belum ada alokasi tempat tidur.</p>
              )}
            </div>

            <AttachmentsPanel
              entityType="RESERVATION"
              entityId={detail.data.id}
              canUpload={hasPermission('reservations.update')}
              title="Dokumen reservasi"
              description="Dokumen pendukung reservasi (JPG, PNG, WebP, atau PDF; maksimal 5 MB)."
            />

            <div>
              <p className="text-xs font-bold text-ink-900">Riwayat</p>
              <ol className="mt-2 space-y-2">
                {detail.data.events.map((event) => (
                  <li key={event.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <div>
                      <p className="font-medium text-ink-800">
                        {humanize(event.eventType)}
                        {event.toStatus ? ` → ${humanize(event.toStatus)}` : ''}
                      </p>
                      <p className="text-[10px] text-ink-400">{formatDateTime(event.createdAt)}</p>
                      {event.reason ? (
                        <p className="text-[10px] text-ink-500">{event.reason}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(decision)}
        onClose={closeDecision}
        title={decision?.type === 'approve' ? 'Setujui reservasi' : 'Tolak reservasi'}
        description={decision ? `${decision.reservation.bookingCode} · ${decision.reservation.employeeName}` : undefined}
      >
        <div className="space-y-4">
          <Field
            label={decision?.type === 'approve' ? 'Catatan (opsional)' : 'Alasan penolakan'}
            hint={
              decision?.type === 'approve'
                ? 'Catatan disimpan pada keputusan persetujuan.'
                : 'Minimal 3 karakter. Alasan akan dikirim ke kru.'
            }
          >
            <Textarea
              rows={4}
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder={
                decision?.type === 'approve'
                  ? 'Contoh: disetujui sesuai kuota dinas'
                  : 'Contoh: kuota dormitory pada tanggal tersebut penuh'
              }
            />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDecision}>
              Batal
            </Button>
            {decision?.type === 'approve' ? (
              <Button
                loading={approve.isPending}
                onClick={() => approve.mutate(decision.reservation.id)}
              >
                <Check className="h-4 w-4" />
                Setujui reservasi
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={reject.isPending}
                disabled={decisionNote.trim().length < 3}
                onClick={() => decision && reject.mutate(decision.reservation.id)}
              >
                <X className="h-4 w-4" />
                Tolak reservasi
              </Button>
            )}
          </div>
          {decision && decision.reservation.employeeName === me?.user.employeeName ? (
            <p className="text-[11px] text-amber-700">
              Sistem menolak persetujuan atas reservasi yang Anda buat sendiri.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(allocating)}
        onClose={() => {
          setAllocating(null);
          setSelectedBeds([]);
          setError(null);
        }}
        title="Alokasikan tempat tidur"
        description={
          allocating
            ? `${allocating.bookingCode} · ${formatDate(allocating.checkInDate)} – ${formatDate(allocating.checkOutDate)}`
            : undefined
        }
        size="lg"
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="mt-2 text-xs text-ink-500">
          Pilih {allocating?.occupantCount ?? 1} tempat tidur. Ketersediaan dihitung ulang pada saat
          eksekusi dan dilindungi constraint database terhadap bentrok jadwal.
        </p>
        {availability.isError ? (
          <ErrorState message="Ketersediaan dormitory tidak dapat dimuat." />
        ) : availability.isLoading ? (
          <Skeleton className="mt-4 h-28 w-full" />
        ) : beds.length === 0 ? (
          <Notice tone="warning">Tidak ada tempat tidur tersedia pada rentang tanggal ini.</Notice>
        ) : (
          <div className="mt-4 grid max-h-[320px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {beds.map((bed) => {
              const isSelected = selectedBeds.includes(bed.id);
              return (
                <button
                  key={bed.id}
                  type="button"
                  onClick={() => toggleBed(bed.id, allocating?.occupantCount ?? 1)}
                  aria-pressed={isSelected}
                  className={
                    isSelected
                      ? 'rounded-xl border border-brand-300 bg-brand-50/70 px-3 py-2.5 text-left'
                      : 'rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-left hover:border-ink-300'
                  }
                >
                  <span className="block text-xs font-semibold text-ink-900">
                    {bed.roomNumber}/{bed.bedCode}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-400">
                    {bed.buildingName} lt. {bed.floorNumber}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setAllocating(null);
              setSelectedBeds([]);
            }}
          >
            Batal
          </Button>
          <Button
            loading={allocate.isPending}
            disabled={selectedBeds.length !== (allocating?.occupantCount ?? 1)}
            onClick={() => allocating && allocate.mutate(allocating)}
          >
            <BedDouble className="h-4 w-4" />
            Simpan alokasi
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function DetailItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium text-ink-800">{value}</dd>
    </div>
  );
}
