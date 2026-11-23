import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarDays,
  Gauge,
  Info,
  RotateCcw,
  Search,
  TrendingUp,
} from 'lucide-react';
import type {
  BedOccupancyStatus,
  DormitoryDetail,
  DormitorySummary,
  OccupancyConfidence,
  OccupancyDormitoryRow,
  OccupancyForecastResult,
  OccupancySummary,
  OccupancyTrendResult,
} from '@whoosh/shared';
import { OCCUPANCY_STATUS_LABELS } from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DistributionBar,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  type DataTableColumn,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { addDaysIso, todayIso } from '../lib/errors';
import { formatDate } from '../lib/format';
import type { Paged } from '../lib/types';

const STATUS_COLORS: Record<BedOccupancyStatus, string> = {
  AVAILABLE: 'bg-emerald-500',
  RESERVED: 'bg-sky-500',
  OCCUPIED: 'bg-brand-600',
  CLEANING: 'bg-amber-500',
  MAINTENANCE: 'bg-ink-400',
  BLOCKED: 'bg-red-500',
};

const CONFIDENCE_TONE: Record<OccupancyConfidence, 'success' | 'warning' | 'danger'> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'danger',
};

const CONFIDENCE_LABEL: Record<OccupancyConfidence, string> = {
  HIGH: 'Keyakinan tinggi',
  MEDIUM: 'Keyakinan sedang',
  LOW: 'Keyakinan rendah',
};

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1)}%`;
}

interface OccupancyFilters {
  date: string;
  dormitoryId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
}

function initialFilters(): OccupancyFilters {
  return { date: todayIso(), dormitoryId: '', buildingId: '', floorId: '', roomId: '' };
}

export function ManagementOccupancyPage() {
  const [form, setForm] = useState<OccupancyFilters>(initialFilters);
  const [applied, setApplied] = useState<OccupancyFilters>(initialFilters);

  const dormitories = useQuery({
    queryKey: ['dormitories', 'occupancy-filter'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 60_000,
  });

  const dormitoryDetail = useQuery({
    queryKey: ['dormitory-detail', 'occupancy-filter', form.dormitoryId],
    queryFn: () => apiRequest<DormitoryDetail>(`/api/v1/dormitories/${form.dormitoryId}`),
    enabled: Boolean(form.dormitoryId),
    staleTime: 60_000,
  });

  const buildings = dormitoryDetail.data?.buildings ?? [];
  const floors = buildings.find((building) => building.id === form.buildingId)?.floors ?? [];
  const rooms = floors.find((floor) => floor.id === form.floorId)?.rooms ?? [];

  const filters = {
    dormitoryId: applied.dormitoryId || undefined,
    buildingId: applied.buildingId || undefined,
    floorId: applied.floorId || undefined,
    roomId: applied.roomId || undefined,
  };

  const summary = useQuery({
    queryKey: ['occupancy', 'summary', applied],
    queryFn: () =>
      apiRequest<OccupancySummary>(
        `/api/v1/occupancy/summary${queryString({ date: applied.date, ...filters })}`,
      ),
    staleTime: 15_000,
  });

  const trend = useQuery({
    queryKey: ['occupancy', 'trend', applied],
    queryFn: () =>
      apiRequest<OccupancyTrendResult>(
        `/api/v1/occupancy/trend${queryString({
          from: addDaysIso(applied.date, -13),
          to: addDaysIso(applied.date, 1),
          ...filters,
        })}`,
      ),
    staleTime: 15_000,
  });

  const forecast = useQuery({
    queryKey: ['occupancy', 'forecast', applied],
    queryFn: () =>
      apiRequest<OccupancyForecastResult>(
        `/api/v1/occupancy/forecast${queryString({
          from: applied.date,
          to: addDaysIso(applied.date, 14),
          ...filters,
        })}`,
      ),
    staleTime: 15_000,
  });

  const data = summary.data;
  const scopeLabel = data
    ? data.scope.level === 'global'
      ? 'Global'
      : data.scope.level === 'building'
        ? `${data.scope.buildingIds.length} building`
        : `${data.scope.dormitoryIds.length} dormitory`
    : 'Sesuai scope akun';

  const outOfServiceTotal = data
    ? data.totals.outOfService.maintenance +
      data.totals.outOfService.blocked +
      data.totals.outOfService.inactive
    : 0;

  const dormitoryColumns: Array<DataTableColumn<OccupancyDormitoryRow>> = [
    {
      key: 'dormitory',
      header: 'Dormitory',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink-900">{row.dormitoryName}</p>
          <p className="text-[11px] text-ink-400">{row.dormitoryCode}</p>
        </div>
      ),
    },
    {
      key: 'capacity',
      header: 'Kapasitas',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.capacity,
    },
    {
      key: 'occupied',
      header: 'Terisi',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.occupied,
    },
    {
      key: 'reserved',
      header: 'Direservasi',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.reserved,
    },
    {
      key: 'available',
      header: 'Tersedia',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (
        <span className={row.available > 0 ? 'font-semibold text-emerald-700' : 'text-ink-400'}>
          {row.available}
        </span>
      ),
    },
    {
      key: 'cleaning',
      header: 'Dibersihkan',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.cleaning,
    },
    {
      key: 'outOfService',
      header: 'Luar layanan',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (
        <span
          title={`Pemeliharaan ${row.outOfService.maintenance}, diblokir ${row.outOfService.blocked}, tidak aktif ${row.outOfService.inactive}`}
        >
          {row.outOfService.maintenance + row.outOfService.blocked + row.outOfService.inactive}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Tingkat hunian',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (
        <span className="font-semibold text-ink-900">{formatRate(row.occupancyRate)}</span>
      ),
    },
  ];

  const trendDays = trend.data?.days ?? [];
  const peakDay = trendDays.reduce<OccupancyTrendResult['days'][number] | null>(
    (peak, day) => (!peak || (day.occupancyRate ?? -1) > (peak.occupancyRate ?? -1) ? day : peak),
    null,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligensi Hunian"
        title="Occupancy Intelligence"
        description="Status per tempat tidur dihitung server-side dengan satu definisi kapasitas. Data dibatasi oleh scope akun."
      />

      <Card className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ ...form });
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end xl:grid-cols-6"
        >
          <Field label="Tanggal">
            <Input
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </Field>
          <Field label="Dormitory">
            <Select
              value={form.dormitoryId}
              onChange={(event) =>
                setForm({
                  ...form,
                  dormitoryId: event.target.value,
                  buildingId: '',
                  floorId: '',
                  roomId: '',
                })
              }
            >
              <option value="">Semua dormitory</option>
              {dormitories.data?.items.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {dormitory.name}
                </option>
              ))}
            </Select>
            {dormitories.isError ? (
              <span className="mt-1 block text-xs text-red-700">
                Daftar dormitory tidak dapat dimuat.{' '}
                <button
                  type="button"
                  onClick={() => dormitories.refetch()}
                  className="font-semibold underline underline-offset-2"
                >
                  Coba lagi
                </button>
              </span>
            ) : null}
          </Field>
          <Field label="Building">
            <Select
              value={form.buildingId}
              disabled={!form.dormitoryId}
              onChange={(event) =>
                setForm({ ...form, buildingId: event.target.value, floorId: '', roomId: '' })
              }
            >
              <option value="">Semua building</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </Select>
            {dormitoryDetail.isError ? (
              <span className="mt-1 block text-xs text-red-700">
                Detail dormitory tidak dapat dimuat.{' '}
                <button
                  type="button"
                  onClick={() => dormitoryDetail.refetch()}
                  className="font-semibold underline underline-offset-2"
                >
                  Coba lagi
                </button>
              </span>
            ) : null}
          </Field>
          <Field label="Lantai">
            <Select
              value={form.floorId}
              disabled={!form.buildingId}
              onChange={(event) => setForm({ ...form, floorId: event.target.value, roomId: '' })}
            >
              <option value="">Semua lantai</option>
              {floors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  Lantai {floor.floorNumber} — {floor.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kamar">
            <Select
              value={form.roomId}
              disabled={!form.floorId}
              onChange={(event) => setForm({ ...form, roomId: event.target.value })}
            >
              <option value="">Semua kamar</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomNumber} — {room.roomTypeName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              <Search className="h-4 w-4" />
              Terapkan
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label="Reset filter"
              onClick={() => {
                const next = initialFilters();
                setForm(next);
                setApplied(next);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>

      {summary.isError ? (
        <ErrorState message="Ringkasan hunian tidak dapat dimuat." onRetry={() => summary.refetch()} />
      ) : null}

      {summary.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Kapasitas"
            value={data.totals.capacity}
            hint={`${scopeLabel} · per ${formatDate(data.asOf)}`}
            icon={<BedDouble className="h-5 w-5" />}
            tone="neutral"
          />
          <StatCard
            label="Terisi"
            value={data.totals.occupied}
            hint={`${data.totals.reserved} direservasi`}
            icon={<Building2 className="h-5 w-5" />}
            tone="brand"
          />
          <StatCard
            label="Tingkat hunian"
            value={formatRate(data.occupancyRate)}
            hint={data.occupancyRate === null ? 'Kapasitas 0 pada scope ini' : 'Terisi / kapasitas'}
            icon={<Gauge className="h-5 w-5" />}
            tone="brand"
          />
          <StatCard
            label="Tersedia"
            value={data.totals.available}
            hint={`${data.totals.cleaning} dibersihkan · ${outOfServiceTotal} luar layanan`}
            icon={<CalendarDays className="h-5 w-5" />}
            tone="success"
          />
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <DistributionBar
            title="Komposisi status tempat tidur"
            items={data.statusBreakdown.map((item) => ({
              label: OCCUPANCY_STATUS_LABELS[item.status],
              value: item.beds,
              colorClass: STATUS_COLORS[item.status],
            }))}
          />
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Kualitas data & formula
              </p>
              <Badge tone="neutral">{scopeLabel}</Badge>
            </div>
            {data.dataQuality.notes.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {data.dataQuality.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-xs leading-5 text-ink-600">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-400">Tidak ada catatan kualitas data.</p>
            )}
            <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-3">
              {data.formulas.map((formula) => (
                <div key={formula.key} className="text-[11px] leading-5">
                  <dt className="inline font-semibold text-ink-700">{formula.label}: </dt>
                  <dd className="inline text-ink-500">{formula.expression}</dd>
                </div>
              ))}
              <div className="text-[11px] leading-5">
                <dt className="inline font-semibold text-ink-700">Luar layanan: </dt>
                <dd className="inline text-ink-500">
                  {data.totals.outOfService.maintenance} pemeliharaan,{' '}
                  {data.totals.outOfService.blocked} diblokir, {data.totals.outOfService.inactive}{' '}
                  tidak aktif, {data.totals.excluded} dikecualikan (building/dormitory nonaktif)
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50/40 px-4 py-3">
          <p className="text-sm font-bold text-ink-950">Hunian per dormitory</p>
          <p className="text-[11px] text-ink-400">
            Luar layanan tidak dihitung ke kapasitas; arahkan kursor untuk rinciannya.
          </p>
        </div>
        <DataTable
          ariaLabel="Hunian per dormitory"
          columns={dormitoryColumns}
          rows={data?.dormitories ?? []}
          rowKey={(row) => row.dormitoryId}
          loading={summary.isLoading}
          error={summary.isError ? 'Data dormitory tidak dapat dimuat.' : null}
          onRetry={() => summary.refetch()}
          emptyTitle="Belum ada dormitory dalam scope"
          emptyDescription="Periksa penugasan scope akun atau filter yang dipilih."
          emptyIcon={<Building2 className="h-6 w-6" />}
          minWidthClass="min-w-[900px]"
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                Tren keterisian
              </p>
              <p className="mt-1 text-sm text-ink-500">14 hari hingga tanggal terpilih.</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-ink-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden />
                Terisi
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden />
                Direservasi
              </span>
            </div>
          </div>
          {trend.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : trend.isError ? (
            <div className="mt-4">
              <ErrorState message="Tren hunian tidak dapat dimuat." onRetry={() => trend.refetch()} />
            </div>
          ) : trendDays.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<TrendingUp className="h-5 w-5" />}
                title="Tren belum tersedia"
                description="Belum ada data harian pada rentang ini."
              />
            </div>
          ) : (
            <>
              <div
                className="mt-4 flex w-full min-w-0 items-end gap-1.5 overflow-x-auto pb-1"
                role="img"
                aria-label={`Tren keterisian ${formatDate(trend.data!.from)} sampai ${formatDate(
                  addDaysIso(trend.data!.to, -1),
                )}. Puncak ${formatDate(peakDay!.date)} sebesar ${formatRate(
                  peakDay!.occupancyRate,
                )}.`}
              >
                {trendDays.map((day) => {
                  const occupiedPct = day.capacity > 0 ? (day.occupied / day.capacity) * 100 : 0;
                  const reservedPct = day.capacity > 0 ? (day.reserved / day.capacity) * 100 : 0;
                  return (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div
                        className="flex h-36 w-full max-w-10 flex-col justify-end overflow-hidden rounded-md bg-ink-100"
                        title={`${formatDate(day.date)}: ${day.occupied} terisi, ${day.reserved} direservasi dari ${day.capacity} (${formatRate(day.occupancyRate)})`}
                      >
                        {day.capacity === 0 ? (
                          <div className="h-1 w-full bg-ink-300" />
                        ) : (
                          <>
                            <div className="w-full bg-sky-500" style={{ height: `${reservedPct}%` }} />
                            <div className="w-full bg-brand-600" style={{ height: `${occupiedPct}%` }} />
                          </>
                        )}
                      </div>
                      <span className="text-[9px] tabular-nums text-ink-400">
                        {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {peakDay ? (
                <p className="mt-2 text-[11px] text-ink-500">
                  Puncak keterisian {formatDate(peakDay.date)}: {formatRate(peakDay.occupancyRate)}.
                </p>
              ) : null}
            </>
          )}
        </Card>

        <Card className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Proyeksi hunian
              </p>
              <p className="mt-1 text-sm text-ink-500">14 hari ke depan dari tanggal terpilih.</p>
            </div>
            {forecast.data ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="info">
                  {forecast.data.basis === 'CONFIRMED_ONLY' ? 'Konfirmasi saja' : 'Termasuk roster'}
                </Badge>
                <Badge tone={CONFIDENCE_TONE[forecast.data.confidence]}>
                  {CONFIDENCE_LABEL[forecast.data.confidence]}
                </Badge>
              </div>
            ) : null}
          </div>
          {forecast.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : forecast.isError ? (
            <div className="mt-4">
              <ErrorState
                message="Proyeksi hunian tidak dapat dimuat."
                onRetry={() => forecast.refetch()}
              />
            </div>
          ) : forecast.data?.status === 'INSUFFICIENT_DATA' ? (
            <div className="mt-4">
              <EmptyState
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Data belum cukup untuk proyeksi"
                description={
                  forecast.data.dataQuality.notes[0] ??
                  'Kapasitas pada scope ini masih 0 sehingga proyeksi tidak dapat dihitung.'
                }
              />
            </div>
          ) : forecast.data ? (
            <div className="mt-3">
              <DataTable
                ariaLabel="Proyeksi hunian 14 hari"
                loading={false}
                minWidthClass="min-w-[560px]"
                columns={[
                  {
                    key: 'date',
                    header: 'Tanggal',
                    render: (day) => (
                      <span className="whitespace-nowrap text-ink-800">{formatDate(day.date)}</span>
                    ),
                  },
                  {
                    key: 'confirmed',
                    header: 'Konfirmasi',
                    align: 'right',
                    className: 'tabular-nums',
                    render: (day) => day.confirmedOccupied,
                  },
                  {
                    key: 'roster',
                    header: 'Sinyal roster',
                    align: 'right',
                    className: 'tabular-nums',
                    render: (day) => day.rosterSignal,
                  },
                  {
                    key: 'projected',
                    header: 'Proyeksi',
                    align: 'right',
                    className: 'tabular-nums',
                    render: (day) => (
                      <span className="font-semibold text-ink-900">
                        {day.projectedDemand ?? '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'rate',
                    header: 'Tingkat',
                    align: 'right',
                    className: 'tabular-nums',
                    render: (day) => formatRate(day.projectedOccupancyRate),
                  },
                  {
                    key: 'flag',
                    header: 'Catatan',
                    render: (day) =>
                      day.overCapacity ? (
                        <Badge tone="danger">Melebihi kapasitas</Badge>
                      ) : (
                        <span className="text-ink-300">—</span>
                      ),
                  },
                ]}
                rows={forecast.data.days}
                rowKey={(day) => day.date}
                emptyTitle="Tidak ada hari dalam rentang"
                emptyDescription="Ubah tanggal untuk melihat proyeksi lain."
              />
              <p className="mt-3 text-[11px] leading-5 text-ink-500">
                Proyeksi berbasis aturan: reservasi terkonfirmasi
                {forecast.data.basis === 'ROSTER_INCLUDED'
                  ? ' ditambah rekomendasi roster yang belum tertaut reservasi'
                  : ' tanpa sinyal roster'}
                . Bukan model statistik. {forecast.data.dataQuality.notes.join(' ')}
              </p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
