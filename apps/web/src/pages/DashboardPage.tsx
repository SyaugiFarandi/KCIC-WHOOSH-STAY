import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ConciergeBell,
  Database,
  KeyRound,
  LogOut,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import type { OperationsOverview } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { apiRequest } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import type { DashboardOverview } from '../lib/types';

const INTEGRATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif',
  MOCK: 'Adapter mock (uji)',
  CONFIGURED: 'Terkonfigurasi',
  DISABLED: 'Nonaktif',
};

function integrationLabel(status: string | undefined): string {
  if (!status) return '—';
  return INTEGRATION_STATUS_LABELS[status] ?? status;
}

const INTEGRATION_STATUS_HINTS: Record<string, string> = {
  ACTIVE: 'Terhubung ke sistem resmi',
  MOCK: 'Adapter pengembangan untuk pengujian',
  CONFIGURED: 'Terkonfigurasi pada server',
  DISABLED: 'Belum diaktifkan pada konfigurasi server',
};

function integrationHint(status: string | undefined): string {
  if (!status) return 'Status dari konfigurasi server';
  return INTEGRATION_STATUS_HINTS[status] ?? 'Status dari konfigurasi server';
}

export function DashboardPage() {
  const { me, hasPermission } = useAuth();
  const operations = useQuery({
    queryKey: ['dashboard', 'operations'],
    queryFn: () => apiRequest<OperationsOverview>('/api/v1/dashboard/operations'),
    staleTime: 30_000,
  });
  const overview = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => apiRequest<DashboardOverview>('/api/v1/dashboard/overview'),
    staleTime: 30_000,
  });

  const data = operations.data;
  const maxTrend = Math.max(
    1,
    ...(data?.trend.flatMap((point) => [point.arrivals, point.departures]) ?? [1]),
  );
  const occupancyRate = data?.occupancy.occupancyRate ?? 0;
  const openTasks = data
    ? data.housekeeping.pending + data.housekeeping.inProgress + data.maintenance.open
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard operasional"
        title="Ringkasan hari ini"
        description={
          me?.session.authMode === 'mock'
            ? 'Angka berasal langsung dari database operasional. Data pada lingkungan ini adalah DEMO / SIMULATED DATA.'
            : 'Angka berasal langsung dari database operasional.'
        }
      />

      {operations.isError ? (
        <ErrorState
          message="Dashboard operasional tidak dapat dimuat. Periksa scope akses Anda."
          onRetry={() => operations.refetch()}
        />
      ) : null}

      <section className="hero-charcoal relative overflow-hidden rounded-3xl text-white">
        <div className="login-pattern absolute inset-0 opacity-20" aria-hidden />
        <div className="relative grid gap-0 lg:grid-cols-[1.25fr_1fr]">
          <div className="p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-gold-400">
              Okupansi langsung
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="text-6xl font-bold leading-none tracking-[-0.04em] sm:text-7xl">
                {data ? data.occupancy.occupancyRate : '—'}
                <span className="ml-1 align-top text-2xl font-semibold text-white/60 sm:text-3xl">
                  %
                </span>
              </p>
              <p className="pb-1 text-xs leading-5 text-white/60">
                {data
                  ? `${data.occupancy.occupiedBeds} dari ${data.occupancy.totalBeds} tempat tidur terisi`
                  : 'Memuat data…'}
              </p>
            </div>
            <div className="mt-5 h-2.5 w-full max-w-xl overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full w-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-[clip-path] duration-700 motion-reduce:transition-none"
                style={{
                  clipPath: `inset(0 ${100 - Math.min(100, Math.max(occupancyRate, occupancyRate > 0 ? 3 : 0))}% 0 0)`,
                }}
                role="progressbar"
                aria-label="Tingkat okupansi"
                aria-valuenow={occupancyRate}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <dl className="mt-5 grid max-w-xl grid-cols-3 gap-3">
              {[
                { label: 'Tersedia', value: data?.occupancy.availableBeds ?? '—' },
                { label: 'Sedang menginap', value: data?.reservations.checkedIn ?? '—' },
                { label: 'Check-in 7 hari', value: data?.upcomingCheckIns ?? '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/50">{item.label}</dt>
                  <dd className="mt-1 text-lg font-bold">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {hasPermission('reservations.read') ? (
                <Link
                  to="/manage/reservations"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-semibold text-brand-800 hover:bg-brand-50"
                >
                  Tinjau reservasi
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {hasPermission('stays.check_in') ? (
                <Link
                  to="/manage/front-desk"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 text-xs font-semibold text-white/85 hover:bg-white/10"
                >
                  Buka front desk
                </Link>
              ) : null}
              <span className="text-[10px] text-white/40">
                Diperbarui {data ? formatDateTime(data.generatedAt) : '—'}
              </span>
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/10 p-6 backdrop-blur-sm sm:p-8 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">
                Perlu perhatian
              </p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                {data ? `${openTasks} tugas terbuka` : 'Memuat…'}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <SignalRow
                to="/manage/reservations"
                icon={<CalendarCheck2 className="h-4 w-4" />}
                label="Reservasi menunggu persetujuan"
                value={data?.reservations.pending ?? '—'}
                tone={data?.reservations.pending ? 'gold' : 'calm'}
              />
              <SignalRow
                to="/manage/housekeeping"
                icon={<Sparkles className="h-4 w-4" />}
                label="Housekeeping belum selesai"
                value={data ? data.housekeeping.pending + data.housekeeping.inProgress : '—'}
                tone={data?.housekeeping.pending ? 'gold' : 'calm'}
              />
              <SignalRow
                to="/manage/maintenance"
                icon={<Wrench className="h-4 w-4" />}
                label="Tiket maintenance terbuka"
                value={data?.maintenance.open ?? '—'}
                tone={data?.maintenance.open ? 'alert' : 'calm'}
              />
              <SignalRow
                to="/manage/front-desk"
                icon={<CalendarClock className="h-4 w-4" />}
                label="Check-out ≤ 3 hari"
                value={data?.upcomingCheckOuts ?? '—'}
                tone="calm"
                mutedValue
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
                Tren 7 hari
              </p>
              <h2 className="mt-1 text-lg font-bold text-ink-950">Kedatangan &amp; keberangkatan</h2>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-ink-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-brand-600" /> Datang
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-gold-500" /> Pulang
              </span>
            </div>
          </div>

          {operations.isLoading || !data ? (
            <Skeleton className="mt-6 h-44 w-full" />
          ) : (
            <div className="mt-6 flex items-end justify-between gap-2 sm:gap-4">
              {data.trend.map((point) => (
                <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end justify-center gap-1 border-b border-ink-100 pb-0.5">
                    <div
                      className="h-full w-2.5 rounded-t bg-brand-600 transition-[clip-path] duration-500 motion-reduce:transition-none sm:w-3"
                      style={{
                        clipPath: `inset(${100 - Math.max(3, (point.arrivals / maxTrend) * 100)}% 0 0 0)`,
                      }}
                      title={`${point.arrivals} kedatangan`}
                    />
                    <div
                      className="h-full w-2.5 rounded-t bg-gold-500 transition-[clip-path] duration-500 motion-reduce:transition-none sm:w-3"
                      style={{
                        clipPath: `inset(${100 - Math.max(3, (point.departures / maxTrend) * 100)}% 0 0 0)`,
                      }}
                      title={`${point.departures} keberangkatan`}
                    />
                  </div>
                  <span className="text-[9px] font-medium text-ink-400">
                    {formatDate(point.date).slice(0, 6)}
                  </span>
                  <span className="text-[10px] font-semibold text-ink-700">
                    {point.arrivals}/{point.departures}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniStat
              label="Total reservasi"
              value={data?.reservations.total ?? '—'}
              hint={`${data?.reservations.confirmed ?? '—'} terkonfirmasi`}
            />
            <MiniStat
              label="Sedang menginap"
              value={data?.reservations.checkedIn ?? '—'}
              hint={`${data?.upcomingCheckOuts ?? '—'} check-out ≤ 3 hari`}
            />
            <MiniStat
              label="Pembatalan/penolakan"
              value={data?.reservations.cancelled ?? '—'}
              hint="Dibatalkan atau ditolak"
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
                  Status layanan
                </p>
                <h2 className="mt-1 text-lg font-bold text-ink-950">Operasional</h2>
              </div>
              <Activity className="h-5 w-5 text-ink-300" />
            </div>
            <div className="mt-4 space-y-2.5">
              <ServiceRow
                icon={<Sparkles className="h-4 w-4" />}
                label="Housekeeping"
                detail={`${data?.housekeeping.completed ?? '—'} selesai`}
                badge={data ? `${data.housekeeping.pending + data.housekeeping.inProgress} aktif` : '—'}
                tone={(data?.housekeeping.pending ?? 0) > 0 ? 'warning' : 'success'}
              />
              <ServiceRow
                icon={<Wrench className="h-4 w-4" />}
                label="Maintenance"
                detail={`${data?.maintenance.resolved ?? '—'} selesai`}
                badge={data ? `${data.maintenance.open + data.maintenance.inProgress} terbuka` : '—'}
                tone={(data?.maintenance.open ?? 0) > 0 ? 'warning' : 'success'}
              />
              <ServiceRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="Reservasi mendatang"
                detail={`${data?.upcomingCheckIns ?? '—'} check-in 7 hari`}
                badge={`${data?.upcomingCheckOuts ?? '—'} check-out`}
                tone="info"
              />
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
              Akses cepat
            </p>
            <h2 className="mt-1 text-lg font-bold text-ink-950">Tugas operasional</h2>
            <div className="mt-4 space-y-2.5">
              {hasPermission('reservations.read') ? (
                <QuickLink
                  to="/manage/reservations"
                  icon={<CalendarCheck2 className="h-4 w-4" />}
                  title="Reservasi & approval"
                  description="Validasi, alokasikan, dan pantau reservasi"
                />
              ) : null}
              {hasPermission('stays.check_in') ? (
                <QuickLink
                  to="/manage/front-desk"
                  icon={<ConciergeBell className="h-4 w-4" />}
                  title="Front desk"
                  description="Check-in QR dan check-out tamu"
                />
              ) : null}
              {hasPermission('housekeeping.read') ? (
                <QuickLink
                  to="/manage/housekeeping"
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Housekeeping"
                  description="Tugas kebersihan dan kesiapan kamar"
                />
              ) : null}
              {hasPermission('maintenance.read') ? (
                <QuickLink
                  to="/manage/maintenance"
                  icon={<Wrench className="h-4 w-4" />}
                  title="Maintenance"
                  description="Tiket kerusakan dan blokir inventory"
                />
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
                Fondasi
              </p>
              <h2 className="mt-1 text-lg font-bold text-ink-950">Akun &amp; integrasi</h2>
            </div>
            <Database className="h-5 w-5 text-ink-300" />
          </div>
          {overview.isError ? (
            <div className="mt-4">
              <ErrorState message="Ringkasan fondasi tidak dapat dimuat." onRetry={() => overview.refetch()} />
            </div>
          ) : overview.isLoading ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MiniStat label="Pengguna" value={overview.data?.counts.users ?? '—'} hint="Akun terdaftar" />
              <MiniStat
                label="Karyawan"
                value={overview.data?.counts.employees ?? '—'}
                hint="Master karyawan"
              />
              <MiniStat
                label="Sync karyawan"
                value={integrationLabel(overview.data?.integrations.employeeSync)}
                hint={integrationHint(overview.data?.integrations.employeeSync)}
              />
              <MiniStat
                label="Sync roster"
                value={integrationLabel(overview.data?.integrations.rosterSync)}
                hint={integrationHint(overview.data?.integrations.rosterSync)}
              />
            </div>
          )}
          <p className="mt-4 rounded-xl bg-ink-50 px-3.5 py-3 text-[11px] leading-5 text-ink-500">
            Autentikasi saat ini:{' '}
            {me?.session.authMode === 'mock'
              ? 'demo auth (pengembangan) · Tidak ada kredensial KCIC nyata yang digunakan.'
              : me?.session.authMode === 'password'
                ? 'login email/password · Kredensial dikelola lokal oleh administrator.'
                : 'SSO KCIC · Identitas diverifikasi oleh penyedia identitas resmi.'}
          </p>
        </Card>

        <Card className="p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
            Administrasi
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink-950">Pengaturan sistem</h2>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {hasPermission('dormitories.read') ? (
              <QuickLink
                to="/manage/inventory"
                icon={<Building2 className="h-4 w-4" />}
                title="Inventory"
                description="Dormitory, kamar, tempat tidur"
              />
            ) : null}
            {hasPermission('reports.read') ? (
              <QuickLink
                to="/manage/reports"
                icon={<Activity className="h-4 w-4" />}
                title="Laporan"
                description="Reservasi, okupansi, operasional"
              />
            ) : null}
            {hasPermission('users.read') ? (
              <QuickLink
                to="/manage/users"
                icon={<ShieldCheck className="h-4 w-4" />}
                title="Pengguna & peran"
                description="Akun dan penugasan scope"
              />
            ) : null}
            {hasPermission('audit.read') ? (
              <QuickLink
                to="/manage/audit"
                icon={<ScrollText className="h-4 w-4" />}
                title="Log audit"
                description="Jejak aktivitas sensitif"
              />
            ) : null}
            {hasPermission('settings.manage') ? (
              <QuickLink
                to="/manage/settings"
                icon={<KeyRound className="h-4 w-4" />}
                title="Pengaturan"
                description="Kebijakan & konfigurasi"
              />
            ) : null}
            {hasPermission('employees.read') ? (
              <QuickLink
                to="/manage/employees"
                icon={<Users className="h-4 w-4" />}
                title="Karyawan"
                description="Master data & sinkronisasi"
              />
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
            <LogOut className="h-4 w-4" />
          </span>
          <p className="text-[11px] leading-5 text-ink-500">
            Semua aksi sensitif pada portal management dicatat ke audit log. Scope data dibatasi
            sesuai peran dan penugasan; pengguna tanpa GLOBAL hanya melihat data dalam scope-nya.
          </p>
        </div>
        <Link
          to="/manage/audit"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand-700"
        >
          Buka audit log
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    </div>
  );
}

function SignalRow({
  to,
  icon,
  label,
  value,
  tone,
  mutedValue = false,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  value: number | string;
  tone: 'gold' | 'alert' | 'calm';
  mutedValue?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition-colors hover:bg-white/10"
    >
      <span
        className={
          tone === 'alert'
            ? 'rounded-lg bg-brand-400/20 p-1.5 text-brand-200'
            : tone === 'gold'
              ? 'rounded-lg bg-gold-400/15 p-1.5 text-gold-400'
              : 'rounded-lg bg-white/10 p-1.5 text-white/60'
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-xs font-medium text-white/80">{label}</span>
      <span
        className={
          mutedValue
            ? 'text-sm font-bold text-white/50'
            : tone === 'alert'
              ? 'text-sm font-bold text-brand-200'
              : tone === 'gold'
                ? 'text-sm font-bold text-gold-400'
                : 'text-sm font-bold text-white/70'
        }
      >
        {value}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-white/30" />
    </Link>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-ink-100 p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink-950">{value}</p>
      <p className="mt-0.5 text-[10px] text-ink-400">{hint}</p>
    </div>
  );
}

function ServiceRow({
  icon,
  label,
  detail,
  badge,
  tone,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  badge: string;
  tone: 'success' | 'warning' | 'info';
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-100 px-3.5 py-3">
      <span className="rounded-lg bg-ink-50 p-2 text-ink-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink-800">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-400">{detail}</p>
      </div>
      <Badge tone={tone}>{badge}</Badge>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-ink-100 px-3.5 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
    >
      <span className="rounded-lg bg-brand-50 p-2 text-brand-700">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink-800">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-400">{description}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-ink-300 transition-colors group-hover:text-brand-600" />
    </Link>
  );
}
