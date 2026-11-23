import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BedDouble,
  Building2,
  CalendarDays,
  Gauge,
  List,
  LayoutGrid,
} from 'lucide-react';
import type { CalendarDay, DormitorySummary, OccupancyCalendarResult } from '@whoosh/shared';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  MonthNavigator,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  cn,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { todayIso } from '../lib/errors';
import { longDate, monthLabel, shiftMonth } from '../lib/format';
import type { Paged } from '../lib/types';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function occupancyTone(rate: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (rate >= 90) return 'danger';
  if (rate >= 70) return 'warning';
  if (rate > 0) return 'success';
  return 'neutral';
}

function occupancyBarClass(rate: number): string {
  if (rate >= 90) return 'bg-red-500';
  if (rate >= 70) return 'bg-amber-500';
  if (rate > 0) return 'bg-emerald-500';
  return 'bg-ink-200';
}

export function ManagementCalendarPage() {
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dormitoryId, setDormitoryId] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;

  const dormitories = useQuery({
    queryKey: ['dormitories', 'calendar-filter'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 60_000,
  });

  const calendar = useQuery({
    queryKey: ['calendar', month, dormitoryId],
    queryFn: () =>
      apiRequest<OccupancyCalendarResult>(
        `/api/v1/calendar${queryString({ from, to, dormitoryId: dormitoryId || undefined })}`,
      ),
    staleTime: 20_000,
  });

  const days = calendar.data?.days ?? [];
  const averageOccupancy = days.length
    ? Number((days.reduce((sum, day) => sum + day.occupancyRate, 0) / days.length).toFixed(1))
    : 0;
  const peak = useMemo(
    () =>
      days.reduce<CalendarDay | null>(
        (best, day) => (!best || day.occupancyRate > best.occupancyRate ? day : best),
        null,
      ),
    [days],
  );
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0] ?? null;

  const leadingBlanks = from
    ? (new Date(`${from}T00:00:00.000Z`).getUTCDay() + 6) % 7
    : 0;

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    setMonth(next);
    const nextToday = todayIso();
    setSelectedDate(nextToday.startsWith(next) ? nextToday : `${next}-01`);
  };

  const goToday = () => {
    const now = todayIso();
    setMonth(now.slice(0, 7));
    setSelectedDate(now);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kalender hunian"
        title="Kalender hunian"
        description="Okupansi harian dari alokasi HELD dan ACTIVE, lengkap dengan kedatangan dan keberangkatan dalam scope akun Anda."
        actions={
          <MonthNavigator month={month} onShift={changeMonth} onToday={goToday} />
        }
      />

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-xs">
          <label
            htmlFor="calendar-dormitory"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400"
          >
            Dormitory
          </label>
          <Select
            id="calendar-dormitory"
            value={dormitoryId}
            onChange={(event) => setDormitoryId(event.target.value)}
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
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Mode tampilan kalender"
            className="flex rounded-xl border border-ink-200 bg-white p-0.5"
          >
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
                view === 'grid' ? 'bg-brand-700 text-white' : 'text-ink-500 hover:bg-ink-50',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kalender
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
                view === 'list' ? 'bg-brand-700 text-white' : 'text-ink-500 hover:bg-ink-50',
              )}
            >
              <List className="h-3.5 w-3.5" />
              Daftar
            </button>
          </div>
        </div>
      </Card>

      {calendar.isError ? (
        <ErrorState
          message="Kalender hunian tidak dapat dimuat. Periksa scope akun Anda."
          onRetry={() => calendar.refetch()}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Tempat tidur dalam scope"
          value={calendar.data?.totalBeds ?? '—'}
          hint={dormitoryId ? 'Dormitory terpilih' : 'Seluruh dormitory dalam scope'}
          icon={<BedDouble className="h-5 w-5" />}
          tone="neutral"
        />
        <StatCard
          label="Rata-rata keterisian"
          value={`${averageOccupancy}%`}
          hint={monthLabel(month)}
          icon={<Gauge className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Puncak keterisian"
          value={peak ? `${peak.occupancyRate}%` : '—'}
          hint={peak ? longDate(peak.date) : 'Belum ada data'}
          icon={<CalendarDays className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      {calendar.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : days.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="Belum ada data kalender"
          description="Pilih bulan atau dormitory lain, atau pastikan akun Anda memiliki scope dormitory."
        />
      ) : (
        <>
          <Card className={cn('overflow-hidden', view === 'grid' ? 'hidden md:block' : 'hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink-500">
                <span className="font-semibold uppercase tracking-[0.14em] text-ink-400">Legenda</span>
                <Badge tone="neutral">0%</Badge>
                <Badge tone="success">&lt; 70%</Badge>
                <Badge tone="warning">70–89%</Badge>
                <Badge tone="danger">≥ 90%</Badge>
              </div>
              <span className="text-[10px] text-ink-400">Klik tanggal untuk melihat detail</span>
            </div>
            <table className="w-full table-fixed border-collapse">
              <caption className="sr-only">
                Kalender okupansi harian {monthLabel(month)}
              </caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((weekday) => (
                    <th
                      key={weekday}
                      scope="col"
                      className="border-b border-ink-100 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400"
                    >
                      {weekday}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.ceil((leadingBlanks + days.length) / 7) }).map(
                  (_, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: 7 }).map((__, columnIndex) => {
                        const dayIndex = rowIndex * 7 + columnIndex - leadingBlanks;
                        const day = days[dayIndex];
                        if (!day) {
                          return (
                            <td
                              key={columnIndex}
                              className="border-b border-r border-ink-50 bg-ink-50/20 p-2"
                            />
                          );
                        }
                        const selected = selectedDay?.date === day.date;
                        return (
                          <td key={day.date} className="border-b border-r border-ink-100 p-1 align-top">
                            <button
                              type="button"
                              onClick={() => setSelectedDate(day.date)}
                              aria-pressed={selected}
                              className={cn(
                                'flex h-full w-full flex-col gap-1.5 rounded-lg p-2 text-left transition-colors',
                                selected
                                  ? 'bg-brand-50 ring-2 ring-brand-600'
                                  : 'hover:bg-ink-50',
                              )}
                            >
                              <span className="flex items-center justify-between">
                                <span
                                  className={cn(
                                    'text-xs font-bold',
                                    day.date === today ? 'text-brand-700' : 'text-ink-800',
                                  )}
                                >
                                  {Number(day.date.slice(8, 10))}
                                </span>
                                <span
                                  className={cn(
                                    'rounded-md px-1 py-0.5 text-[9px] font-bold',
                                    day.occupancyRate >= 90
                                      ? 'bg-red-50 text-red-700'
                                      : day.occupancyRate >= 70
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-emerald-50 text-emerald-700',
                                  )}
                                >
                                  {day.occupancyRate}%
                                </span>
                              </span>
                              <span className="h-1 w-full overflow-hidden rounded-full bg-ink-100">
                                <span
                                  className={cn('block h-full rounded-full', occupancyBarClass(day.occupancyRate))}
                                  style={{ width: `${Math.min(100, day.occupancyRate)}%` }}
                                />
                              </span>
                              <span className="flex items-center gap-2 text-[9px] text-ink-400">
                                <span className="inline-flex items-center gap-0.5">
                                  <ArrowDownToLine className="h-2.5 w-2.5" />
                                  {day.arrivals.length}
                                </span>
                                <span className="inline-flex items-center gap-0.5">
                                  <ArrowUpFromLine className="h-2.5 w-2.5" />
                                  {day.departures.length}
                                </span>
                              </span>
                              <span className="sr-only">
                                {longDate(day.date)} — keterisian {day.occupancyRate} persen,{' '}
                                {day.arrivals.length} kedatangan, {day.departures.length} keberangkatan
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </Card>

          <Card className={cn('divide-y divide-ink-100', view === 'grid' ? 'md:hidden' : '')}>
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                aria-pressed={selectedDay?.date === day.date}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                  selectedDay?.date === day.date ? 'bg-brand-50/70' : 'hover:bg-ink-50/60',
                )}
              >
                <div className="w-14 shrink-0 text-center">
                  <p className="text-lg font-bold leading-none text-ink-900">
                    {Number(day.date.slice(8, 10))}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">
                    {WEEKDAYS[(new Date(`${day.date}T00:00:00.000Z`).getUTCDay() + 6) % 7]}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink-700">
                      {day.occupiedBeds}/{day.totalBeds} tempat tidur
                    </span>
                    <Badge tone={occupancyTone(day.occupancyRate)}>{day.occupancyRate}%</Badge>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn('h-full rounded-full', occupancyBarClass(day.occupancyRate))}
                      style={{ width: `${Math.min(100, day.occupancyRate)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownToLine className="h-3 w-3" />
                      {day.arrivals.length} datang
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpFromLine className="h-3 w-3" />
                      {day.departures.length} pulang
                    </span>
                  </p>
                </div>
              </button>
            ))}
          </Card>

          {selectedDay ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
                    Detail tanggal
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-ink-950">{longDate(selectedDay.date)}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={occupancyTone(selectedDay.occupancyRate)}>
                    {selectedDay.occupancyRate}% terisi
                  </Badge>
                  <Badge tone="neutral">{selectedDay.availableBeds} tersedia</Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <EventList
                  icon={<ArrowDownToLine className="h-4 w-4 text-emerald-600" />}
                  title="Kedatangan"
                  events={selectedDay.arrivals}
                />
                <EventList
                  icon={<ArrowUpFromLine className="h-4 w-4 text-amber-600" />}
                  title="Keberangkatan"
                  events={selectedDay.departures}
                />
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function EventList({
  icon,
  title,
  events,
}: {
  icon: ReactNode;
  title: string;
  events: CalendarDay['arrivals'];
}) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-100">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/40 px-3.5 py-2.5">
        {icon}
        <p className="text-xs font-bold text-ink-800">{title}</p>
        <Badge tone="neutral" className="ml-auto">
          {events.length}
        </Badge>
      </div>
      {events.length === 0 ? (
        <p className="px-3.5 py-4 text-xs text-ink-400">Tidak ada {title.toLowerCase()}.</p>
      ) : (
        <ul className="divide-y divide-ink-50">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-bold text-ink-900">{event.bookingCode}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-500">
                  {event.employeeName} · {event.dormitoryName} · {event.guestCount} tamu
                </p>
              </div>
              <StatusBadge status={event.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
