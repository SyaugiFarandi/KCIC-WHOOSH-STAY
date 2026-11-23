import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, CalendarClock, Info, LogOut, ShieldCheck } from 'lucide-react';
import type { StayRecord } from '@whoosh/shared';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '../components/ui';
import { apiRequest } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';

export function CrewCheckOutPage() {
  const active = useQuery({
    queryKey: ['stays', 'active'],
    queryFn: () => apiRequest<{ items: StayRecord[] }>('/api/v1/stays/active'),
    staleTime: 20_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Check-out"
        title="Informasi check-out"
        description="Ringkasan menginap yang sedang berlangsung. Proses check-out dilakukan oleh petugas front desk."
      />

      {active.isError ? (
        <ErrorState
          message="Data menginap aktif tidak dapat dimuat."
          onRetry={() => active.refetch()}
        />
      ) : null}

      {active.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (active.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={<LogOut className="h-5 w-5" />}
          title="Tidak ada menginap aktif"
          description="Informasi kamar dan waktu check-out akan tampil di sini ketika Anda sudah check-in."
        />
      ) : (
        <div className="space-y-4">
          {active.data?.items.map((stay) => (
            <Card key={stay.reservationId} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                    <BedDouble className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-mono text-xs font-bold text-ink-900">{stay.bookingCode}</p>
                    <p className="mt-1 text-base font-bold text-ink-950">{stay.dormitoryName}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      Kamar/tempat tidur: {stay.roomBeds}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatDate(stay.checkInDate)} → {formatDate(stay.checkOutDate)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={stay.status} />
                  <Badge tone="info">
                    Check-in {stay.checkedInAt ? formatDateTime(stay.checkedInAt) : '—'}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-ink-100 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                    <Info className="h-3.5 w-3.5 text-brand-600" />
                    Sebelum meninggalkan kamar
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-ink-500">
                    <li>Pastikan barang pribadi tidak tertinggal.</li>
                    <li>Matikan lampu dan peralatan elektronik.</li>
                    <li>Laporkan kerusakan kepada petugas bila ada.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-ink-100 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
                    Check-out oleh petugas
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-ink-500">
                    Petugas front desk akan mencatat check-out, mengubah status housekeeping kamar
                    menjadi DIRTY, dan membuat tugas pembersihan otomatis.
                  </p>
                </div>
              </div>

              <Link
                to={`/crew/reservations/${stay.reservationId}`}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
              >
                Lihat detail reservasi
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
