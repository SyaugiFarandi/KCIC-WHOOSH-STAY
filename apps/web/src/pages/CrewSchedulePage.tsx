import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BedDouble,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  MapPin,
} from 'lucide-react';
import type { ReservationSummary } from '@whoosh/shared';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  MonthNavigator,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '../components/ui';
import { apiRequest } from '../lib/api';
import { todayIso } from '../lib/errors';
import { displayName, formatDate, longDate, monthLabel, shiftMonth } from '../lib/format';
import type { Paged } from '../lib/types';

const ACTIVE_STATUSES = new Set(['PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN']);

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function CrewSchedulePage() {
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;

  const schedule = useQuery({
    queryKey: ['reservations', 'schedule', month],
    queryFn: () =>
      apiRequest<Paged<ReservationSummary>>(
        `/api/v1/reservations?from=${from}&to=${to}&pageSize=100`,
      ),
    staleTime: 30_000,
  });

  const reservations = (schedule.data?.items ?? [])
    .filter((reservation) => ACTIVE_STATUSES.has(reservation.status))
    .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));
  const upcoming = reservations.filter((reservation) => reservation.checkInDate > today).length;
  const ongoing = reservations.filter(
    (reservation) => reservation.checkInDate <= today && reservation.checkOutDate > today,
  ).length;

  const groups = reservations.reduce<Record<string, ReservationSummary[]>>((acc, reservation) => {
    const list = acc[reservation.checkInDate] ?? [];
    list.push(reservation);
    acc[reservation.checkInDate] = list;
    return acc;
  }, {});

  const [yearNumber, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate();
  const leadingBlanks =
    (new Date(`${from}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const visibleGroups = Object.entries(groups).filter(
    ([date]) => !selectedDate || date === selectedDate,
  );

  const changeMonth = (delta: number) => {
    setMonth((value) => shiftMonth(value, delta));
    setSelectedDate(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jadwal menginap"
        title="Kalender perjalanan"
        description="Rencana menginap Anda pada bulan berjalan. Pilih tanggal pada kalender untuk menyaring agenda."
        actions={
          <MonthNavigator
            month={month}
            onShift={changeMonth}
            onToday={() => {
              setMonth(today.slice(0, 7));
              setSelectedDate(null);
            }}
          />
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 bg-sand-50/60 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <p className="font-mono text-4xl font-black leading-none tracking-tight text-ink-950">
              {String(monthNumber).padStart(2, '0')}
            </p>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
                {monthLabel(month)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-500">
                Klik tanggal berpenanda untuk melihat agenda hari tersebut.
              </p>
            </div>
          </div>
          <dl className="flex items-center divide-x divide-ink-200/70 text-center">
            {[
              { label: 'Reservasi', value: reservations.length, icon: CalendarRange },
              { label: 'Akan datang', value: upcoming, icon: CalendarDays },
              { label: 'Berlangsung', value: ongoing, icon: CalendarCheck2 },
            ].map((metric) => (
              <div key={metric.label} className="px-4 first:pl-0 last:pr-0">
                <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  <metric.icon className="h-3 w-3" />
                  {metric.label}
                </dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink-950">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className="pb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400"
              >
                {day}
              </span>
            ))}
            {Array.from({ length: leadingBlanks }).map((_, index) => (
              <span key={`blank-${index}`} aria-hidden />
            ))}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const date = `${month}-${String(day).padStart(2, '0')}`;
              const count = groups[date]?.length ?? 0;
              const isToday = date === today;
              const isSelected = date === selectedDate;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={count === 0}
                  aria-pressed={isSelected}
                  aria-label={`${longDate(date)}${count ? `, ${count} reservasi` : ', tidak ada reservasi'}`}
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={
                    isSelected
                      ? 'relative flex h-11 flex-col items-center justify-center rounded-lg bg-brand-700 text-white sm:h-12'
                      : isToday
                        ? 'relative flex h-11 flex-col items-center justify-center rounded-lg bg-brand-50 text-ink-950 ring-1 ring-brand-300 sm:h-12'
                        : count > 0
                          ? 'relative flex h-11 flex-col items-center justify-center rounded-lg text-ink-800 hover:bg-ink-50 sm:h-12'
                          : 'relative flex h-11 flex-col items-center justify-center rounded-lg text-ink-300 sm:h-12'
                  }
                >
                  <span className="text-xs font-semibold tabular-nums">{day}</span>
                  {count > 0 ? (
                    <span
                      className={
                        isSelected
                          ? 'mt-0.5 h-1 w-4 rounded-full bg-gold-400'
                          : 'mt-0.5 h-1 w-4 rounded-full bg-brand-500'
                      }
                    />
                  ) : (
                    <span className="mt-0.5 h-1 w-4" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {selectedDate ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-2.5 text-xs">
          <p className="font-semibold text-brand-900">
            Agenda {longDate(selectedDate)}
          </p>
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="font-semibold text-brand-700 hover:text-brand-800"
          >
            Tampilkan semua tanggal
          </button>
        </div>
      ) : null}

      {schedule.isError ? (
        <ErrorState
          message="Jadwal menginap tidak dapat dimuat."
          onRetry={() => schedule.refetch()}
        />
      ) : null}

      {schedule.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : reservations.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-5 w-5" />}
          title="Belum ada jadwal menginap"
          description={`Tidak ada reservasi aktif pada ${monthLabel(month)}.`}
          action={
            <Link
              to="/crew/search"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Cari kamar
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {visibleGroups.map(([date, items]) => (
            <Card key={date} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/40 px-4 py-3">
                <p className="flex items-center gap-2 text-xs font-bold text-ink-900">
                  <CalendarDays className="h-4 w-4 text-brand-600" />
                  {longDate(date)}
                </p>
                <Badge tone="neutral">
                  {items.length} reservasi
                </Badge>
              </div>
              <div className="divide-y divide-ink-100">
                {items.map((reservation) => (
                  <Link
                    key={reservation.id}
                    to={`/crew/reservations/${reservation.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-ink-50/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-ink-900">
                          {reservation.bookingCode}
                        </span>
                        <StatusBadge status={reservation.status} />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                        <MapPin className="h-3.5 w-3.5 text-brand-600" />
                        {displayName(reservation.dormitoryName)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                        <span>
                          {formatDate(reservation.checkInDate)} →{' '}
                          {formatDate(reservation.checkOutDate)}
                        </span>
                        <span>{reservation.occupantCount} tamu</span>
                        {reservation.allocationSummary ? (
                          <span className="inline-flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {reservation.allocationSummary}
                          </span>
                        ) : (
                          <span className="text-amber-700">Belum dialokasikan</span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-brand-700">Lihat detail</span>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
