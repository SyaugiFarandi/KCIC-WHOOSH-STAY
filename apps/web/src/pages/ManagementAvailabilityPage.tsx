import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Building2, CalendarDays, RotateCcw, Search } from 'lucide-react';
import type { AvailabilityResult, DormitorySummary } from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { addDaysIso, todayIso } from '../lib/errors';
import { formatDate } from '../lib/format';
import type { Paged } from '../lib/types';

export function ManagementAvailabilityPage() {
  const today = todayIso();
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDaysIso(today, 1));
  const [dormitoryId, setDormitoryId] = useState('');
  const [applied, setApplied] = useState({ checkIn: today, checkOut: addDaysIso(today, 1), dormitoryId: '' });

  const dormitories = useQuery({
    queryKey: ['dormitories', 'availability-filter'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 60_000,
  });

  const availability = useQuery({
    queryKey: ['availability', 'management', applied],
    queryFn: () =>
      apiRequest<AvailabilityResult>(
        `/api/v1/availability${queryString({
          checkIn: applied.checkIn,
          checkOut: applied.checkOut,
          dormitoryId: applied.dormitoryId || undefined,
        })}`,
      ),
    staleTime: 15_000,
  });

  const valid = checkOut > checkIn;
  const dormitoryItems = availability.data?.dormitories ?? [];
  const totals = dormitoryItems.reduce(
    (acc, item) => ({
      available: acc.available + item.availableBeds,
      total: acc.total + item.totalBeds,
    }),
    { available: 0, total: 0 },
  );
  const occupancyRate = totals.total
    ? (((totals.total - totals.available) / totals.total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ketersediaan"
        title="Ketersediaan real-time"
        description="Perhitungan memakai alokasi HELD dan ACTIVE dengan rentang inklusif check-in dan eksklusif check-out."
      />

      {availability.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Dormitory dalam scope"
            value={dormitoryItems.length}
            hint={dormitories.data ? `dari ${dormitories.data.pagination.total} dormitory` : 'Sesuai scope akun'}
            icon={<Building2 className="h-5 w-5" />}
            tone="neutral"
          />
          <StatCard
            label="Tempat tidur tersedia"
            value={totals.available}
            hint={`dari ${totals.total} tempat tidur`}
            icon={<BedDouble className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Keterisian periode"
            value={`${occupancyRate}%`}
            hint={`${formatDate(availability.data.checkIn)} – ${formatDate(availability.data.checkOut)}`}
            icon={<CalendarDays className="h-5 w-5" />}
            tone="brand"
          />
        </div>
      ) : null}

      <Card className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) setApplied({ checkIn, checkOut, dormitoryId });
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto_auto] lg:items-end"
        >
          <Field label="Check-in">
            <Input
              type="date"
              value={checkIn}
              min={today}
              onChange={(event) => setCheckIn(event.target.value)}
            />
          </Field>
          <Field label="Check-out" error={!valid ? 'Harus setelah check-in' : undefined}>
            <Input
              type="date"
              value={checkOut}
              min={addDaysIso(checkIn, 1)}
              onChange={(event) => setCheckOut(event.target.value)}
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
          <Button type="submit" disabled={!valid} size="lg">
            <Search className="h-4 w-4" />
            Periksa
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={() => {
              const nextCheckIn = todayIso();
              const nextCheckOut = addDaysIso(nextCheckIn, 1);
              setCheckIn(nextCheckIn);
              setCheckOut(nextCheckOut);
              setDormitoryId('');
              setApplied({ checkIn: nextCheckIn, checkOut: nextCheckOut, dormitoryId: '' });
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </form>
      </Card>

      {availability.isError ? (
        <ErrorState
          message="Ketersediaan tidak dapat dimuat."
          onRetry={() => availability.refetch()}
        />
      ) : null}

      {availability.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="space-y-5">
          {availability.data?.dormitories.map((dormitory) => (
            <Card key={dormitory.dormitoryId} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand-600" />
                  <div>
                    <p className="text-sm font-bold text-ink-950">{dormitory.dormitoryName}</p>
                    <p className="text-[11px] text-ink-400">
                      {dormitory.dormitoryCode}
                      {dormitory.stationCode ? ` · ${dormitory.stationCode}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={dormitory.availableBeds > 0 ? 'success' : 'danger'}>
                    {dormitory.availableBeds} tersedia
                  </Badge>
                  <Badge tone="neutral">{dormitory.totalBeds} total</Badge>
                  <span className="flex items-center gap-1 text-[10px] text-ink-400">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(availability.data.checkIn)} –{' '}
                    {formatDate(availability.data.checkOut)}
                  </span>
                </div>
              </div>
              {dormitory.beds.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ink-400">
                  Seluruh tempat tidur terisi pada rentang ini.
                </p>
              ) : (
                <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {dormitory.beds.map((bed) => (
                    <div
                      key={bed.id}
                      className="rounded-xl border border-ink-100 px-3 py-2.5"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
                        <BedDouble className="h-3.5 w-3.5 text-brand-600" />
                        {bed.roomNumber}/{bed.bedCode}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        {bed.buildingName} lt. {bed.floorNumber}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <StatusBadge status={bed.housekeepingStatus} />
                        <Badge tone="neutral">{bed.roomTypeName}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}

          {availability.data && availability.data.dormitories.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="Tidak ada dormitory dalam scope"
              description="Periksa penugasan scope akun Anda atau filter dormitory."
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
