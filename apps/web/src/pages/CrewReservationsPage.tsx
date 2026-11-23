import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BedDouble,
  CalendarClock,
  Check,
  ChevronRight,
  CircleSlash2,
  Plus,
} from 'lucide-react';
import type { AccommodationGallery, ReservationSummary } from '@whoosh/shared';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
} from '../components/ui';
import { SafeImage } from '../components/gallery';
import { useIsDemoEnv } from '../auth/AuthProvider';
import { apiRequest, queryString } from '../lib/api';
import { displayName, formatDate } from '../lib/format';
import type { Paged } from '../lib/types';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'PENDING_APPROVAL', label: 'Menunggu persetujuan' },
  { value: 'CONFIRMED', label: 'Terkonfirmasi' },
  { value: 'CHECKED_IN', label: 'Sedang menginap' },
  { value: 'CHECKED_OUT', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'NO_SHOW', label: 'No show' },
];

const HISTORY_STATUSES = ['CHECKED_OUT', 'CANCELLED', 'REJECTED', 'NO_SHOW'];

const JOURNEY = ['Diajukan', 'Disetujui', 'Check-in', 'Selesai'] as const;

function journeyStage(status: string) {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 1;
    case 'CONFIRMED':
      return 2;
    case 'CHECKED_IN':
      return 3;
    case 'CHECKED_OUT':
      return 4;
    default:
      return -1;
  }
}

function JourneyBar({ status }: { status: string }) {
  const stage = journeyStage(status);
  if (stage === -1) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
        <CircleSlash2 className="h-3.5 w-3.5" />
        Perjalanan reservasi dihentikan
      </p>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-1.5" aria-label={`Tahap reservasi: ${JOURNEY[stage - 1]}`}>
      {JOURNEY.map((step, index) => {
        const position = index + 1;
        const done = position < stage;
        const current = position === stage;
        return (
          <div key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={
                done
                  ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white'
                  : current
                    ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[9px] font-bold text-white'
                    : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-[9px] font-semibold text-ink-400'
              }
            >
              {done ? <Check className="h-3 w-3" /> : position}
            </span>
            <span
              className={
                current
                  ? 'hidden truncate text-[10px] font-semibold text-ink-900 sm:block'
                  : 'hidden truncate text-[10px] text-ink-400 sm:block'
              }
            >
              {step}
            </span>
            {index < JOURNEY.length - 1 ? (
              <span
                className={
                  done
                    ? 'h-px flex-1 bg-emerald-300'
                    : 'h-px flex-1 bg-ink-200'
                }
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function CrewReservationsPage({ mode = 'all' }: { mode?: 'all' | 'history' }) {
  const demoEnv = useIsDemoEnv();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const effectiveStatus = status || undefined;
  const historyStatuses =
    mode === 'history' && !effectiveStatus ? HISTORY_STATUSES.join(',') : undefined;
  const statusOptions =
    mode === 'history'
      ? STATUS_OPTIONS.filter((option) => !option.value || HISTORY_STATUSES.includes(option.value))
      : STATUS_OPTIONS;
  const reservations = useQuery({
    queryKey: ['reservations', 'mine', { effectiveStatus, historyStatuses, q, page, pageSize, mode }],
    queryFn: () =>
      apiRequest<Paged<ReservationSummary>>(
        `/api/v1/reservations${queryString({
          status: effectiveStatus,
          statuses: historyStatuses,
          q,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const gallery = useQuery({
    queryKey: ['accommodation', 'gallery', 'reservations'],
    queryFn: () => apiRequest<AccommodationGallery>('/api/v1/accommodation/gallery'),
    staleTime: 60_000,
  });

  const covers = new Map(
    (gallery.data?.items ?? []).map((item) => [item.dormitoryId, item.coverPhoto]),
  );
  const items = reservations.data?.items ?? [];
  const hasFilters = Boolean(status || q);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={mode === 'history' ? 'Arsip' : 'Reservasi'}
        title={mode === 'history' ? 'Riwayat menginap' : 'Reservasi saya'}
        description={
          mode === 'history'
            ? 'Arsip perjalanan yang telah selesai, dibatalkan, atau ditolak — lengkap dengan referensi dan status akhir.'
            : 'Pantau setiap tahap perjalanan menginap Anda, dari pengajuan hingga check-in dan check-out.'
        }
        actions={
          <Link
            to="/crew/search"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <Plus className="h-4 w-4" />
            Reservasi baru
          </Link>
        }
      />

      <section className="relative overflow-hidden rounded-2xl border border-ink-200/70 bg-sand-50/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-700">
              Alur reservasi
            </p>
            <h2 className="mt-1.5 text-lg font-bold text-ink-950">
              Satu referensi, empat tahap perjalanan
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Setiap reservasi memiliki kode booking unik. Simpan kode tersebut untuk kebutuhan
              verifikasi di front desk.
            </p>
          </div>
          <ol className="grid flex-1 gap-2 sm:grid-cols-4 sm:gap-3">
            {JOURNEY.map((step, index) => (
              <li
                key={step}
                className="rounded-xl border border-ink-200/70 bg-white/80 px-3 py-2.5"
              >
                <p className="font-mono text-[10px] font-bold text-brand-700">
                  0{index + 1}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-ink-900">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQ(search.trim());
            }}
          >
            <SearchInput
              className="flex-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode booking"
              aria-label="Cari reservasi"
            />
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter status"
              className="sm:w-56"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </form>
          <div className="flex items-center gap-3">
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setStatus('');
                  setQ('');
                  setSearch('');
                  setPage(1);
                }}
                className="text-[11px] font-semibold text-brand-700 hover:text-brand-800"
              >
                Reset filter
              </button>
            ) : null}
            <p className="text-xs text-ink-400">
              {reservations.data ? `${reservations.data.pagination.total} reservasi` : 'Memuat…'}
            </p>
          </div>
        </div>

        {reservations.isError ? (
          <div className="p-4">
            <ErrorState
              message="Reservasi tidak dapat dimuat."
              onRetry={() => reservations.refetch()}
            />
          </div>
        ) : null}

        {reservations.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title={mode === 'history' ? 'Belum ada riwayat' : 'Belum ada reservasi'}
              description={
                mode === 'history'
                  ? 'Reservasi yang selesai, dibatalkan, atau ditolak akan terarsip di sini.'
                  : 'Reservasi yang Anda buat akan tampil di sini beserta status persetujuan dan detail kamar.'
              }
              action={
                <Link
                  to="/crew/search"
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
                >
                  <Plus className="h-4 w-4" />
                  Cari akomodasi
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {items.map((reservation) => {
              const nights = Math.max(
                1,
                Math.round(
                  (new Date(reservation.checkOutDate).getTime() -
                    new Date(reservation.checkInDate).getTime()) /
                    86_400_000,
                ),
              );
              const cover = covers.get(reservation.dormitoryId);
              return (
                <Link
                  key={reservation.id}
                  to={`/crew/reservations/${reservation.id}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/20 sm:flex-row"
                >
                  <div className="relative h-36 w-full shrink-0 sm:h-auto sm:w-36 lg:w-40">
                    <SafeImage
                      src={cover?.url}
                      alt={cover?.caption ?? `Foto ${displayName(reservation.dormitoryName)}`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    {demoEnv ? (
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
                        DEMO
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-[11px] font-bold tracking-wide text-ink-900">
                          {reservation.bookingCode}
                        </p>
                        <span className="flex items-center gap-1.5">
                          {reservation.status === 'PENDING_APPROVAL' &&
                          reservation.approvalStatus === 'PENDING' ? (
                            <Badge tone="warning">Perlu persetujuan</Badge>
                          ) : null}
                          <StatusBadge status={reservation.status} />
                          <ChevronRight className="h-4 w-4 text-ink-300 transition-colors group-hover:text-brand-600" />
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-ink-950">
                        {displayName(reservation.dormitoryName)}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        {formatDate(reservation.checkInDate)} →{' '}
                        {formatDate(reservation.checkOutDate)} · {nights} malam ·{' '}
                        {reservation.occupantCount} tamu
                      </p>
                      {reservation.allocationSummary ? (
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-ink-500">
                          <BedDouble className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                          {reservation.allocationSummary}
                        </p>
                      ) : null}
                    </div>
                    <JourneyBar status={reservation.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {reservations.data ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={reservations.data.pagination.total}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
            fetching={reservations.isFetching}
            itemLabel="reservasi"
          />
        ) : null}
      </Card>

      {demoEnv ? (
        <p className="text-[10px] leading-4 text-ink-400">
          Semua data akomodasi dan reservasi pada lingkungan ini adalah data simulasi (DEMO),
          bukan fasilitas atau operasional KCIC.
        </p>
      ) : null}
    </div>
  );
}
