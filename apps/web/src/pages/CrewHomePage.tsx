import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BedDouble,
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  KeyRound,
  LifeBuoy,
  MapPin,
  QrCode,
  Search,
  Sparkles,
} from 'lucide-react';
import { ROLE_LABELS, type NotificationSummary, type ReservationSummary, type StayRecord } from '@whoosh/shared';
import type { AccommodationGallery, AvailabilityResult } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card, EmptyState, ErrorState, Skeleton, StatusBadge } from '../components/ui';
import { SafeImage } from '../components/gallery';
import { apiRequest } from '../lib/api';
import { addDaysIso, todayIso } from '../lib/errors';
import { displayName, formatDate, greeting } from '../lib/format';

interface MySummary {
  upcoming: ReservationSummary | null;
  active: number;
  history: number;
}

function daysUntil(date: string) {
  const today = new Date(`${todayIso()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

function notificationStamp(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(value));
}

export function CrewHomePage() {
  const { me } = useAuth();
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const summaryQuery = useQuery({
    queryKey: ['my', 'summary'],
    queryFn: () => apiRequest<MySummary>('/api/v1/my/summary'),
    staleTime: 30_000,
  });
  const staysQuery = useQuery({
    queryKey: ['stays', 'active'],
    queryFn: () => apiRequest<{ items: StayRecord[] }>('/api/v1/stays/active'),
    staleTime: 20_000,
  });
  const galleryQuery = useQuery({
    queryKey: ['accommodation', 'gallery'],
    queryFn: () => apiRequest<AccommodationGallery>('/api/v1/accommodation/gallery'),
    staleTime: 60_000,
  });
  const exploration = useQuery({
    queryKey: ['availability', { checkIn: today, checkOut: tomorrow }],
    queryFn: () =>
      apiRequest<AvailabilityResult>(
        `/api/v1/availability?checkIn=${today}&checkOut=${tomorrow}`,
      ),
    staleTime: 30_000,
  });
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () =>
      apiRequest<{ items: NotificationSummary[]; unread: number }>(
        '/api/v1/notifications?page=1&pageSize=3',
      ),
    staleTime: 30_000,
  });

  const upcoming = summaryQuery.data?.upcoming ?? null;
  const activeStays = staysQuery.data?.items ?? [];
  const unread = notificationsQuery.data?.unread ?? 0;
  const galleryItems = galleryQuery.data?.items ?? [];
  const galleryByName = new Map(galleryItems.map((item) => [item.name, item]));
  const nextStay = activeStays[0] ?? null;
  const heroPhoto = (upcoming ? galleryByName.get(upcoming.dormitoryName)?.coverPhoto : null) ??
    (nextStay ? galleryByName.get(nextStay.dormitoryName)?.coverPhoto : null) ??
    galleryItems[0]?.coverPhoto ??
    null;
  const availableByDormitory = new Map(
    (exploration.data?.dormitories ?? []).map((item) => [item.dormitoryId, item]),
  );
  const exploreItems = galleryItems.slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="relative min-h-[320px] overflow-hidden rounded-3xl text-white">
        <SafeImage
          src={heroPhoto?.url}
          alt=""
          loading="eager"
          priority
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-ink-950/95 via-ink-900/80 to-ink-800/25"
          aria-hidden
        />
        <div className="login-pattern absolute inset-0 opacity-15" aria-hidden />
        <div className="relative flex h-full flex-col justify-between gap-8 p-6 sm:p-9 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <Badge tone="neutral" className="border-white/20 bg-white/10 text-white/75">
              {me?.session.authMode === 'mock' ? 'Portal Kru · Data DEMO' : 'Portal Kru'}
            </Badge>
            <h1 className="mt-4 text-balance text-3xl font-bold leading-[1.08] tracking-tight sm:text-[42px]">
              {greeting(me?.user.displayName ?? 'Kru')}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-7 text-white/70">
              Cari akomodasi, kelola reservasi, dan siapkan check-in dalam satu tempat.
              {me?.session.authMode === 'mock'
                ? ' Semua data pada lingkungan ini merupakan data DEMO.'
                : ''}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-medium text-white/85">
                <MapPin className="h-3.5 w-3.5 text-gold-400" />
                {me?.user.employeeName ?? 'Profil karyawan belum terhubung'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-medium text-white/85">
                <KeyRound className="h-3.5 w-3.5 text-gold-400" />
                {me?.roles.map((role) => ROLE_LABELS[role.roleCode] ?? role.roleCode).join(' · ') ||
                  'Kru'}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to="/crew/search"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50"
              >
                Cari akomodasi
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/crew/check-in"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
              >
                <QrCode className="h-4 w-4" />
                QR check-in
              </Link>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-ink-950/35 p-4 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-400">
              Status perjalanan
            </p>
            {staysQuery.isLoading || summaryQuery.isLoading ? (
              <Skeleton className="mt-3 h-16 w-full bg-white/10" />
            ) : staysQuery.isError || summaryQuery.isError ? (
              <div className="mt-2.5">
                <p className="text-sm font-semibold text-white/85">
                  Status perjalanan tidak dapat dimuat.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void staysQuery.refetch();
                    void summaryQuery.refetch();
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-gold-400 hover:bg-white/15"
                >
                  Coba lagi
                </button>
              </div>
            ) : activeStays.length ? (
              <div className="mt-2.5">
                <p className="text-2xl font-bold">
                  {activeStays.length} menginap aktif
                </p>
                <p className="mt-1 text-xs text-white/65">
                  {displayName(activeStays[0].dormitoryName)} · kamar {activeStays[0].roomBeds}
                </p>
                <Link
                  to="/crew/check-out"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-500"
                >
                  Informasi check-out
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : upcoming ? (
              <div className="mt-2.5">
                <p className="text-2xl font-bold">
                  {daysUntil(upcoming.checkInDate) === 0
                    ? 'Check-in hari ini'
                    : `${daysUntil(upcoming.checkInDate)} hari lagi`}
                </p>
                <p className="mt-1 text-xs text-white/65">
                  {displayName(upcoming.dormitoryName)} · {formatDate(upcoming.checkInDate)}
                </p>
                <Link
                  to={`/crew/reservations/${upcoming.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-500"
                >
                  Lihat reservasi
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="mt-2.5">
                <p className="text-2xl font-bold">Siap berangkat?</p>
                <p className="mt-1 text-xs text-white/65">
                  Belum ada jadwal menginap aktif atau mendatang.
                </p>
                <Link
                  to="/crew/search"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-500"
                >
                  Temukan tempat tidur
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
                Perjalanan Anda
              </p>
              <h2 className="mt-1 text-lg font-bold text-ink-950">Jadwal menginap</h2>
            </div>
            <Link
              to="/crew/schedule"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
            >
              Semua jadwal
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-ink-100">
            {staysQuery.isLoading || summaryQuery.isLoading ? (
              <div className="p-5">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : staysQuery.isError || summaryQuery.isError ? (
              <div className="p-5">
                <ErrorState
                  message="Jadwal menginap tidak dapat dimuat."
                  onRetry={() => {
                    void staysQuery.refetch();
                    void summaryQuery.refetch();
                  }}
                />
              </div>
            ) : activeStays.length === 0 && !upcoming ? (
              <div className="p-5">
                <EmptyState
                  icon={<BedDouble className="h-5 w-5" />}
                  title="Belum ada jadwal mendatang"
                  description="Cari ketersediaan dormitory dan buat reservasi untuk perjalanan dinas Anda berikutnya."
                  action={
                    <Link
                      to="/crew/search"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Mulai cari kamar
                    </Link>
                  }
                />
              </div>
            ) : null}

            {activeStays.map((stay) => {
              const cover = galleryByName.get(stay.dormitoryName)?.coverPhoto;
              return (
                <div key={stay.reservationId} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:px-6">
                  <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-28">
                    <SafeImage
                      src={cover?.url}
                      alt={cover?.caption ?? `Foto ${stay.dormitoryName}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={stay.status} />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Sedang menginap
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-bold text-ink-900">
                      {displayName(stay.dormitoryName)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      {stay.roomBeds} · {formatDate(stay.checkInDate)} → {formatDate(stay.checkOutDate)}
                    </p>
                  </div>
                  <Link
                    to="/crew/check-out"
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-700 hover:border-ink-300"
                  >
                    Info check-out
                  </Link>
                </div>
              );
            })}

            {upcoming ? (
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:px-6">
                <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-28">
                  <SafeImage
                    src={galleryByName.get(upcoming.dormitoryName)?.coverPhoto?.url}
                    alt={`Foto ${upcoming.dormitoryName}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={upcoming.status} />
                    <span className="font-mono text-[10px] font-semibold text-ink-400">
                      {upcoming.bookingCode}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-bold text-ink-900">
                    {displayName(upcoming.dormitoryName)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {formatDate(upcoming.checkInDate)} → {formatDate(upcoming.checkOutDate)} ·{' '}
                    {upcoming.occupantCount} tamu
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-[10px] font-semibold text-brand-700">
                    {daysUntil(upcoming.checkInDate) === 0
                      ? 'Check-in hari ini'
                      : `${daysUntil(upcoming.checkInDate)} hari lagi`}
                  </span>
                  <Link
                    to={`/crew/reservations/${upcoming.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
                  >
                    Lihat detail
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
                Aktivitas
              </p>
              <h2 className="mt-1 text-lg font-bold text-ink-950">Notifikasi &amp; riwayat</h2>
            </div>
            <Link
              to="/crew/notifications"
              className="relative rounded-xl bg-ink-50 p-2 text-ink-500 hover:text-brand-700"
              aria-label={`Notifikasi, ${unread} belum dibaca`}
            >
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[9px] font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </Link>
          </div>

          <div className="mx-5 flex items-stretch divide-x divide-ink-100 rounded-xl border border-ink-100 sm:mx-6">
            <div className="flex-1 px-4 py-3">
              <p className="text-2xl font-bold leading-none text-ink-950">
                {summaryQuery.data?.active ?? '—'}
              </p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                Aktif
              </p>
            </div>
            <div className="flex-1 px-4 py-3">
              <p className="text-2xl font-bold leading-none text-ink-950">
                {summaryQuery.data?.history ?? '—'}
              </p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                Selesai
              </p>
            </div>
            <Link to="/crew/notifications" className="flex-1 px-4 py-3 hover:bg-brand-50/40">
              <p className="text-2xl font-bold leading-none text-brand-700">{unread}</p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                Belum dibaca
              </p>
            </Link>
          </div>

          <div className="mt-4 flex-1 px-5 pb-2 sm:px-6">
            {notificationsQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : notificationsQuery.isError ? (
              <ErrorState
                message="Notifikasi tidak dapat dimuat."
                onRetry={() => notificationsQuery.refetch()}
              />
            ) : notificationsQuery.data?.items.length ? (
              <ul className="space-y-3">
                {notificationsQuery.data.items.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <span
                      className={
                        item.readAt
                          ? 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-200'
                          : 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600'
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink-800">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-ink-400">
                        {item.body}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-ink-500">
                      {notificationStamp(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-[11px] leading-5 text-ink-500">
                Belum ada notifikasi. Pembaruan reservasi dan check-in akan muncul di sini.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-3 sm:px-6">
            <Link
              to="/crew/history"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Riwayat menginap
            </Link>
            <Link
              to="/crew/notifications"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-500 hover:text-brand-700"
            >
              Semua notifikasi
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      </div>

      <section aria-labelledby="explore-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
              Jelajahi
            </p>
            <h2 id="explore-heading" className="mt-1 text-lg font-bold text-ink-950">
              Dormitory sepanjang rute
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              Ketersediaan untuk {formatDate(today)} – {formatDate(tomorrow)}.
            </p>
            {exploration.isError ? (
              <p className="mt-1 text-xs font-medium text-amber-800">
                Ketersediaan real-time tidak dapat dimuat — menampilkan jumlah tempat tidur.{' '}
                <button
                  type="button"
                  onClick={() => exploration.refetch()}
                  className="font-semibold text-brand-700 underline underline-offset-2"
                >
                  Coba lagi
                </button>
              </p>
            ) : null}
          </div>
          <Link
            to="/crew/search"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700"
          >
            Buka pencarian
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {galleryQuery.isLoading ? (
            <>
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </>
          ) : galleryQuery.isError ? (
            <Card className="p-5 sm:col-span-2 lg:col-span-3">
              <ErrorState
                message="Galeri dormitory tidak dapat dimuat."
                onRetry={() => galleryQuery.refetch()}
              />
            </Card>
          ) : exploreItems.length === 0 ? (
            <Card className="p-5 text-sm text-ink-500 sm:col-span-2 lg:col-span-3">
              Foto dormitory belum tersedia. Hubungi management untuk melengkapi galeri.
            </Card>
          ) : (
            exploreItems.map((item) => {
              const availability = availableByDormitory.get(item.dormitoryId);
              return (
                <Link
                  key={item.dormitoryId}
                  to={`/crew/search?checkIn=${today}&checkOut=${tomorrow}`}
                  className="group relative overflow-hidden rounded-2xl bg-ink-950 text-white shadow-[var(--shadow-card)]"
                >
                  <SafeImage
                    src={item.coverPhoto?.url}
                    alt={item.coverPhoto?.caption ?? `Foto ${item.name}`}
                    className="h-56 w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-400">
                      <MapPin className="h-3 w-3" />
                      {displayName(item.name).replace(/^Dormitory\s+/i, '')}
                    </p>
                    <p className="mt-1 text-base font-bold">{displayName(item.name)}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 text-white/75">
                        <BedDouble className="h-3.5 w-3.5" />
                        {availability
                          ? `${availability.availableBeds} dari ${availability.totalBeds} tersedia`
                          : `${item.bedCount} tempat tidur`}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-white">
                        Cari
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
          <Sparkles className="h-3.5 w-3.5 text-gold-500" />
          Layanan kru
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/crew/reservations" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-brand-800">
            <CalendarClock className="h-4 w-4 text-brand-600" />
            Reservasi saya
          </Link>
          <Link to="/crew/schedule" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-brand-800">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            Jadwal menginap
          </Link>
          <Link to="/crew/check-in" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-brand-800">
            <QrCode className="h-4 w-4 text-brand-600" />
            QR check-in
          </Link>
          <Link to="/crew/history" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-brand-800">
            <ClipboardCheck className="h-4 w-4 text-brand-600" />
            Riwayat
          </Link>
          <Link to="/crew/help" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-brand-800 sm:ml-auto">
            <LifeBuoy className="h-4 w-4 text-brand-600" />
            Bantuan
          </Link>
        </div>
      </Card>

      {me?.session.authMode === 'mock' ? (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Data DEMO / SIMULATED DATA</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">
                Nama dormitory pada lingkungan demo bukan lokasi resmi KCIC. Integrasi SDM dan
                roster masih menggunakan adapter pengembangan dan belum tersinkron dengan sistem
                produksi.
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
