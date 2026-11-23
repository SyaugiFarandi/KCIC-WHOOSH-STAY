import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarClock, Clock3, Lock, QrCode, ShieldCheck } from 'lucide-react';
import type { IssuedQrToken, ReservationSummary } from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  Notice,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '../components/ui';
import { apiRequest } from '../lib/api';
import { errorMessage, todayIso } from '../lib/errors';
import { displayName, formatDate, formatDateTime } from '../lib/format';
import type { Paged } from '../lib/types';

export function CrewCheckInPage() {
  const [selected, setSelected] = useState<ReservationSummary | null>(null);
  const [issued, setIssued] = useState<IssuedQrToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reservations = useQuery({
    queryKey: ['reservations', 'check-in'],
    queryFn: () =>
      apiRequest<Paged<ReservationSummary>>(
        '/api/v1/reservations?status=CONFIRMED&pageSize=20',
      ),
    staleTime: 20_000,
  });

  const issue = useMutation({
    mutationFn: (id: string) =>
      apiRequest<IssuedQrToken>(`/api/v1/reservations/${id}/qr`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (token) => setIssued(token),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const openQr = (reservation: ReservationSummary) => {
    setSelected(reservation);
    setIssued(null);
    setError(null);
    issue.mutate(reservation.id);
  };

  const close = () => {
    setSelected(null);
    setIssued(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Check-in"
        title="QR check-in"
        description="Tunjukkan QR kepada petugas front desk saat tiba. QR dibuat dari reservasi terkonfirmasi dan hanya berlaku sekali."
      />

      <section className="hero-charcoal relative overflow-hidden rounded-3xl p-6 text-white sm:p-7">
        <div className="login-pattern absolute inset-0 opacity-10" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold-400">
              Akses cepat
            </p>
            <h2 className="mt-1.5 text-xl font-bold sm:text-2xl">Tunjukkan QR di front desk</h2>
            <p className="mt-1.5 text-xs leading-5 text-white/65">
              QR diterbitkan hanya untuk reservasi terkonfirmasi dan langsung hangus setelah
              dipindai. Jangan membagikan tangkapan layar QR kepada siapa pun.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:max-w-xl">
            {[
              { icon: Lock, title: 'Sekali pakai', text: 'Hangus setelah dipindai' },
              { icon: Clock3, title: 'Kedaluwarsa', text: 'Masa berlaku singkat' },
              { icon: ShieldCheck, title: 'Terverifikasi', text: 'Hanya reservasi aktif' },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
              >
                <item.icon className="h-4 w-4 text-gold-400" />
                <p className="mt-1.5 text-[11px] font-semibold">{item.title}</p>
                <p className="mt-0.5 text-[10px] text-white/50">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {reservations.isError ? (
        <ErrorState
          message="Reservasi terkonfirmasi tidak dapat dimuat."
          onRetry={() => reservations.refetch()}
        />
      ) : null}

      {reservations.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (reservations.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={<QrCode className="h-5 w-5" />}
          title="Belum ada reservasi terkonfirmasi"
          description="QR check-in tersedia setelah reservasi disetujui atau langsung dikonfirmasi."
          action={
            <Link
              to="/crew/reservations"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              Lihat reservasi saya
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reservations.data?.items.map((reservation) => {
            const today = todayIso();
            const inWindow = today >= reservation.checkInDate && today < reservation.checkOutDate;
            return (
              <Card key={reservation.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-ink-900">
                      {reservation.bookingCode}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink-950">
                      {displayName(reservation.dormitoryName)}
                    </p>
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatDate(reservation.checkInDate)} → {formatDate(reservation.checkOutDate)}
                </p>
                {reservation.allocationSummary ? (
                  <p className="mt-1 text-[11px] text-ink-500">
                    Kamar/tempat tidur: {reservation.allocationSummary}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Badge tone={inWindow ? 'success' : 'warning'}>
                    {inWindow ? 'Dalam jendela check-in' : 'Belum memasuki tanggal check-in'}
                  </Badge>
                  <Button size="sm" onClick={() => openQr(reservation)}>
                    <QrCode className="h-4 w-4" />
                    Tampilkan QR
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={close}
        title={selected ? `QR check-in · ${selected.bookingCode}` : 'QR check-in'}
        description="Tunjukkan layar ini kepada petugas front desk."
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {issue.isPending ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Skeleton className="h-48 w-48" />
            <p className="text-xs text-ink-400">Menerbitkan token aman…</p>
          </div>
        ) : issued ? (
          <div className="flex flex-col items-center">
            <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-inner">
              <QRCodeSVG value={issued.token} size={220} marginSize={2} />
            </div>
            <p className="mt-3 text-xs font-semibold text-ink-800">
              {selected ? displayName(selected.dormitoryName) : 'Reservasi terkonfirmasi'}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">
              Berlaku sampai {formatDateTime(issued.expiresAt)}
            </p>
            <Badge tone="warning" className="mt-3">
              Sekali pakai
            </Badge>
            <p className="mt-3 max-w-xs text-center text-[10px] leading-4 text-ink-400">
              Tunjukkan QR langsung dari perangkat Anda. Petugas front desk akan memindai kode; tidak
              ada kode token yang ditampilkan di layar ini.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
