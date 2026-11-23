import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart2, FileSpreadsheet } from 'lucide-react';
import type {
  DormitorySummary,
  OccupancyReportRow,
  OperationalReportRow,
  ReportReservationRow,
} from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  cn,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { addDaysIso, errorMessage, todayIso } from '../lib/errors';
import { formatDate, formatDateTime, humanize } from '../lib/format';
import type { Paged } from '../lib/types';
import { useAuth } from '../auth/AuthProvider';

type ReportTab = 'reservations' | 'occupancy' | 'operational';

interface ReservationsReport extends Paged<ReportReservationRow> {
  filters: { from: string; to: string; dormitoryId: string | null };
}

interface OccupancyReport {
  items: OccupancyReportRow[];
  totals: {
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    occupancyRate: number;
  };
  generatedAt: string;
}

interface OperationalReport {
  items: OperationalReportRow[];
  generatedAt: string;
}

const TABS: Array<{ key: ReportTab; label: string }> = [
  { key: 'reservations', label: 'Reservasi' },
  { key: 'occupancy', label: 'Okupansi' },
  { key: 'operational', label: 'Operasional' },
];

const occupancyColumns: Array<DataTableColumn<OccupancyReportRow>> = [
  {
    key: 'dormitory',
    header: 'Dormitory',
    render: (row) => (
      <span className="text-xs font-semibold text-ink-800">{row.dormitoryName}</span>
    ),
  },
  {
    key: 'totalBeds',
    header: 'Total bed',
    render: (row) => <span className="text-xs text-ink-600">{row.totalBeds}</span>,
  },
  {
    key: 'occupiedBeds',
    header: 'Terisi',
    render: (row) => <span className="text-xs text-ink-600">{row.occupiedBeds}</span>,
  },
  {
    key: 'availableBeds',
    header: 'Tersedia',
    render: (row) => <span className="text-xs text-ink-600">{row.availableBeds}</span>,
  },
  {
    key: 'occupancyRate',
    header: 'Okupansi',
    render: (row) => (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${Math.min(100, row.occupancyRate)}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-ink-700">{row.occupancyRate}%</span>
      </div>
    ),
  },
];

const operationalColumns: Array<DataTableColumn<OperationalReportRow>> = [
  {
    key: 'category',
    header: 'Kategori',
    render: (row) => (
      <Badge
        tone={
          row.category === 'RESERVATION'
            ? 'brand'
            : row.category === 'HOUSEKEEPING'
              ? 'info'
              : 'warning'
        }
      >
        {humanize(row.category)}
      </Badge>
    ),
  },
  {
    key: 'label',
    header: 'Status',
    render: (row) => <span className="text-xs font-semibold text-ink-800">{row.label}</span>,
  },
  {
    key: 'value',
    header: 'Jumlah',
    render: (row) => <span className="text-xs text-ink-600">{row.value}</span>,
  },
];

async function downloadReport(
  type: ReportTab,
  format: 'csv' | 'xlsx',
  params: Record<string, string>,
): Promise<void> {
  const response = await fetch(
    `/api/v1/reports/export${queryString({ type, format, ...params })}`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    let message = `Ekspor ${format.toUpperCase()} gagal.`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `whoosh-stay-${type}.${format}`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function ReportsPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: ReportTab =
    rawTab === 'occupancy' || rawTab === 'operational' ? rawTab : 'reservations';
  const setTab = (next: ReportTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };
  useEffect(() => {
    if (rawTab === tab) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  }, [rawTab, tab, searchParams, setSearchParams]);
  const [from, setFrom] = useState(addDaysIso(todayIso(), -29));
  const [to, setTo] = useState(todayIso());
  const [dormitoryId, setDormitoryId] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const dormitories = useQuery({
    queryKey: ['dormitories', 'report-filter'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 5 * 60_000,
  });

  const filters = { from, to, dormitoryId };

  const reservations = useQuery({
    queryKey: ['reports', 'reservations', filters],
    queryFn: () =>
      apiRequest<ReservationsReport>(`/api/v1/reports/reservations${queryString(filters)}`),
    enabled: tab === 'reservations',
  });
  const occupancy = useQuery({
    queryKey: ['reports', 'occupancy', dormitoryId],
    queryFn: () =>
      apiRequest<OccupancyReport>(`/api/v1/reports/occupancy${queryString({ dormitoryId })}`),
    enabled: tab === 'occupancy',
  });
  const operational = useQuery({
    queryKey: ['reports', 'operational', dormitoryId],
    queryFn: () =>
      apiRequest<OperationalReport>(`/api/v1/reports/operational${queryString({ dormitoryId })}`),
    enabled: tab === 'operational',
  });

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    setExportError(null);
    try {
      await downloadReport(tab, format, filters);
    } catch (error) {
      setExportError(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laporan"
        title="Laporan reservasi & operasional"
        description="Laporan dihitung langsung dari basis data sesuai cakupan akses Anda. Ekspor CSV atau XLSX tercatat di audit log."
        actions={
          hasPermission('reports.export') ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport('csv')}
                loading={exporting === 'csv'}
                disabled={exporting !== null}
                aria-label="Ekspor CSV"
                title="Ekspor CSV"
              >
                {exporting === 'csv' ? null : <Download className="h-4 w-4" />}
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport('xlsx')}
                loading={exporting === 'xlsx'}
                disabled={exporting !== null}
                aria-label="Ekspor XLSX"
                title="Ekspor XLSX"
              >
                {exporting === 'xlsx' ? null : <FileSpreadsheet className="h-4 w-4" />}
                XLSX
              </Button>
            </div>
          ) : (
            <Badge tone="neutral">Butuh izin reports.export</Badge>
          )
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr]">
          <Field label="Dari">
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              disabled={tab === 'occupancy'}
            />
          </Field>
          <Field label="Sampai">
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              disabled={tab === 'occupancy'}
            />
          </Field>
          <Field label="Dormitory">
            <Select value={dormitoryId} onChange={(event) => setDormitoryId(event.target.value)}>
              <option value="">Semua dormitory</option>
              {dormitories.data?.items.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {dormitory.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {tab === 'occupancy' ? (
          <p className="mt-3 text-[11px] text-ink-400">
            Laporan okupansi dihitung untuk tanggal hari ini berdasarkan alokasi aktif, bukan rentang
            tanggal.
          </p>
        ) : null}
        {exportError ? (
          <div className="mt-3">
            <Notice tone="danger">{exportError}</Notice>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-pressed={tab === item.key}
            className={cn(
              'rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
              tab === item.key
                ? 'border-brand-300 bg-brand-50 text-brand-800'
                : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'reservations' ? (
        <Card>
          {reservations.isError ? (
            <div className="p-4">
              <ErrorState
                message="Laporan reservasi tidak dapat dimuat."
                onRetry={() => reservations.refetch()}
              />
            </div>
          ) : null}
          {reservations.data ? (
            <p className="border-b border-ink-100 px-4 py-3 text-xs text-ink-500">
              {reservations.data.pagination.total} reservasi pada{' '}
              {formatDate(reservations.data.filters.from)} –{' '}
              {formatDate(reservations.data.filters.to)}
            </p>
          ) : null}
          <div
            className="max-h-[560px] overflow-auto"
            tabIndex={0}
            aria-label="Tabel laporan reservasi"
          >
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-ink-100 bg-white text-[10px] uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3 font-bold">Kode booking</th>
                  <th className="px-4 py-3 font-bold">Kru</th>
                  <th className="px-4 py-3 font-bold">Dormitory</th>
                  <th className="whitespace-nowrap px-4 py-3 font-bold">Check-in</th>
                  <th className="whitespace-nowrap px-4 py-3 font-bold">Check-out</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Sumber</th>
                  <th className="whitespace-nowrap px-4 py-3 font-bold">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {reservations.data?.items.slice(0, 300).map((row) => (
                  <tr key={row.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-semibold text-ink-800">
                      {row.bookingCode}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-700">
                      {row.employeeName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-600">
                      {row.dormitoryName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-600">
                      {formatDate(row.checkInDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-600">
                      {formatDate(row.checkOutDate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[11px] text-ink-500">
                      {humanize(row.source)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[11px] text-ink-500">
                      {formatDateTime(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reservations.data && reservations.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<FileBarChart2 className="h-5 w-5" />}
                title="Tidak ada reservasi"
                description="Tidak ada reservasi pada rentang tanggal dan dormitory yang dipilih."
              />
            </div>
          ) : null}
          {reservations.data && reservations.data.items.length > 300 ? (
            <p className="border-t border-ink-100 px-4 py-3 text-[11px] text-ink-400">
              Menampilkan 300 baris pertama. Gunakan ekspor CSV atau XLSX untuk data lengkap.
            </p>
          ) : null}
        </Card>
      ) : null}

      {tab === 'occupancy' ? (
        <div className="space-y-4">
          {occupancy.isError ? (
            <ErrorState
              message="Laporan okupansi tidak dapat dimuat."
              onRetry={() => occupancy.refetch()}
            />
          ) : null}
          {occupancy.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total bed" value={occupancy.data.totals.totalBeds} tone="brand" />
              <StatCard label="Terisi" value={occupancy.data.totals.occupiedBeds} tone="warning" />
              <StatCard label="Tersedia" value={occupancy.data.totals.availableBeds} tone="success" />
              <StatCard
                label="Tingkat okupansi"
                value={`${occupancy.data.totals.occupancyRate}%`}
                tone="brand"
              />
            </div>
          ) : null}
          <Card>
            <DataTable
              columns={occupancyColumns}
              rows={occupancy.data?.items ?? []}
              rowKey={(row) => row.dormitoryId}
              ariaLabel="Tabel laporan okupansi"
              loading={occupancy.isLoading}
              emptyTitle="Belum ada dormitory"
              emptyDescription="Data okupansi akan muncul setelah dormitory dan bed tersedia."
              emptyIcon={<FileBarChart2 className="h-5 w-5" />}
              minWidthClass="min-w-[640px]"
            />
          </Card>
        </div>
      ) : null}

      {tab === 'operational' ? (
        <Card>
          <DataTable
            columns={operationalColumns}
            rows={operational.data?.items ?? []}
            rowKey={(row) => `${row.category}-${row.label}`}
            ariaLabel="Tabel laporan operasional"
            loading={operational.isLoading}
            error={operational.isError ? 'Laporan operasional tidak dapat dimuat.' : null}
            onRetry={() => operational.refetch()}
            emptyTitle="Belum ada data operasional"
            emptyDescription="Data akan muncul setelah ada reservasi, tugas housekeeping, atau tiket maintenance."
            emptyIcon={<FileBarChart2 className="h-5 w-5" />}
            minWidthClass="min-w-[480px]"
          />
        </Card>
      ) : null}

      {hasPermission('audit.read') || hasPermission('users.read') ? (
        <AttachmentsPanel
          entityType="OPERATIONAL_DOCUMENT"
          entityId="00000000-0000-0000-0000-000000000000"
          canUpload={hasPermission('reports.export') && hasPermission('attachments.upload')}
          title="Dokumen operasional"
          description="Kebijakan, berita acara, dan dokumen operasional bersama (JPG, PNG, WebP, atau PDF; maksimal 5 MB)."
        />
      ) : null}
    </div>
  );
}
