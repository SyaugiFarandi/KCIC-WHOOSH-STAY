import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Info,
  KeyRound,
  QrCode,
  XCircle,
} from 'lucide-react';
import type { IssuedQrToken, ReservationDetail } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Modal,
  Notice,
  PageHeader,
  Skeleton,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { apiRequest } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { displayName, formatDate, formatDateTime, humanize } from '../lib/format';

export function CrewReservationDetailPage() {
  const { id = '' } = useParams();
  const { hasPermission } = useAuth();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reservation = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => apiRequest<ReservationDetail>(`/api/v1/reservations/${id}`),
    enabled: Boolean(id),
  });

  const qr = useMutation({
    mutationFn: () =>
      apiRequest<IssuedQrToken>(`/api/v1/reservations/${id}/qr`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const cancel = useMutation({
    mutationFn: () =>
      apiRequest<ReservationDetail>(`/api/v1/reservations/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      setCancelOpen(false);
      setReason('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
      void queryClient.invalidateQueries({ queryKey: ['my', 'summary'] });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  if (reservation.isError) {
    return (
      <ErrorState
        message="Reservasi tidak dapat dimuat atau bukan milik akun Anda."
        onRetry={() => reservation.refetch()}
      />
    );
  }

  if (reservation.isLoading || !reservation.data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const data = reservation.data;
  const justCreated = params.get('created') === '1';

  return (
    <div className="space-y-6">
      <Link
        to="/crew/reservations"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke daftar reservasi
      </Link>

      {justCreated ? (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                  Reservasi terkirim
                </p>
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">
                Kode reservasi
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-ink-950">
                {data.bookingCode}
              </p>
              <p className="mt-3 max-w-lg text-sm leading-6 text-ink-600">
                {data.approvalStatus === 'PENDING'
                  ? 'Reservasi menunggu validasi administrator. Notifikasi akan dikirim setelah keputusan dan alokasi tempat tidur ditetapkan.'
                  : 'Reservasi sudah terkonfirmasi. Siapkan QR check-in sebelum tiba di dormitory.'}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                    Dormitory
                  </dt>
                  <dd className="mt-0.5 text-xs font-semibold text-ink-800">
                    {displayName(data.dormitoryName)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                    Tanggal
                  </dt>
                  <dd className="mt-0.5 text-xs font-semibold text-ink-800">
                    {formatDate(data.checkInDate)} → {formatDate(data.checkOutDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                    Tamu
                  </dt>
                  <dd className="mt-0.5 text-xs font-semibold text-ink-800">
                    {data.occupantCount} kru
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/crew/reservations"
                  className="inline-flex h-9 items-center rounded-xl bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
                >
                  Semua reservasi
                </Link>
                {data.status === 'CONFIRMED' ? (
                  <Link
                    to="/crew/check-in"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-700 hover:border-ink-300"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    Siapkan QR check-in
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="border-t border-ink-100 bg-sand-50 p-6 lg:border-l lg:border-t-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
                Langkah berikutnya
              </p>
              <ol className="mt-3 space-y-3">
                {[
                  { label: 'Reservasi dikirim', done: true },
                  {
                    label: 'Validasi & alokasi tempat tidur',
                    done: data.approvalStatus !== 'PENDING',
                    active: data.approvalStatus === 'PENDING',
                  },
                  {
                    label: 'QR check-in & kedatangan',
                    active: data.status === 'CONFIRMED',
                    done: ['CHECKED_IN', 'CHECKED_OUT'].includes(data.status),
                  },
                ].map((step) => (
                  <li key={step.label} className="flex items-start gap-2.5">
                    <span
                      className={
                        step.done
                          ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700'
                          : step.active
                            ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[9px] font-bold text-white'
                            : 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-[9px] font-bold text-ink-400'
                      }
                    >
                      {step.done ? <CheckCircle2 className="h-3 w-3" /> : step.active ? '•' : ''}
                    </span>
                    <span
                      className={
                        step.done || step.active
                          ? 'text-xs font-semibold text-ink-800'
                          : 'text-xs text-ink-400'
                      }
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[10px] leading-4 text-ink-400">
                Pantau status dan riwayat pada halaman ini. Perubahan tanggal pada reservasi
                terkonfirmasi dilakukan melalui front desk.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <PageHeader
        eyebrow="Detail reservasi"
        title={data.bookingCode}
        description={`${displayName(data.dormitoryName)} · ${formatDate(data.checkInDate)} – ${formatDate(data.checkOutDate)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            {data.status === 'PENDING_APPROVAL' && data.approvalStatus === 'PENDING' ? (
              <Badge tone="warning">Perlu persetujuan</Badge>
            ) : null}
            {data.canCancel ? (
              <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                Batalkan
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink-950">Informasi menginap</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoRow label="Dormitory" value={displayName(data.dormitoryName)} />
              <InfoRow label="Jumlah tamu" value={`${data.occupantCount} kru`} />
              <InfoRow label="Check-in" value={formatDate(data.checkInDate)} />
              <InfoRow label="Check-out" value={formatDate(data.checkOutDate)} />
              <InfoRow label="Sumber" value={humanize(data.source)} />
              <InfoRow label="Dibuat" value={formatDateTime(data.createdAt)} />
              {data.purpose ? <InfoRow label="Keperluan" value={data.purpose} wide /> : null}
              {data.cancellationReason ? (
                <InfoRow label="Alasan pembatalan" value={data.cancellationReason} wide />
              ) : null}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink-950">Alokasi tempat tidur</h2>
            {data.allocations.length ? (
              <div className="mt-3 space-y-2">
                {data.allocations.map((allocation) => (
                  <div
                    key={allocation.id}
                    className="flex flex-col gap-2 rounded-xl border border-ink-100 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-lg bg-brand-50 p-2 text-brand-700">
                        <BedDouble className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink-900">
                          {displayName(allocation.dormitoryName)} · {allocation.roomNumber}/
                          {allocation.bedCode}
                        </p>
                        <p className="text-[11px] text-ink-400">
                          {allocation.buildingName} · {formatDate(allocation.stayStart)} –{' '}
                          {formatDate(allocation.stayEnd)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={allocation.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-800">
                Belum ada alokasi tempat tidur. Administrator akan menetapkan tempat tidur untuk
                reservasi ini.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink-950">Tamu &amp; kehadiran</h2>
            <div className="mt-3 space-y-2">
              {data.guests.map((guest) => {
                const checkin = data.checkins.find((item) => item.employeeId === guest.employeeId);
                const checkout = data.checkouts.find((item) => item.employeeId === guest.employeeId);
                return (
                  <div
                    key={guest.id}
                    className="rounded-xl border border-ink-100 px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-ink-900">{guest.employeeName}</p>
                      <Badge tone={guest.guestRole === 'PRIMARY' ? 'brand' : 'neutral'}>
                        {guest.guestRole === 'PRIMARY' ? 'Utama' : humanize(guest.guestRole)}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400">
                      <span>
                        Check-in: {checkin ? formatDateTime(checkin.checkedInAt) : 'Belum'}
                      </span>
                      <span>
                        Check-out: {checkout ? formatDateTime(checkout.checkedOutAt) : 'Belum'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink-950">Riwayat status</h2>
            <ol className="mt-3 space-y-3">
              {data.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-xs font-semibold text-ink-800">
                      {humanize(event.eventType)}
                      {event.toStatus ? ` → ${humanize(event.toStatus)}` : ''}
                    </p>
                    <p className="text-[11px] text-ink-400">{formatDateTime(event.createdAt)}</p>
                    {event.reason ? (
                      <p className="mt-0.5 text-[11px] text-ink-500">{event.reason}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <AttachmentsPanel
            entityType="RESERVATION"
            entityId={data.id}
            canUpload={hasPermission('reservations.update')}
            title="Dokumen reservasi"
            description="Unggah dokumen pendukung perjalanan dinas Anda (JPG, PNG, WebP, atau PDF; maksimal 5 MB)."
          />
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-ink-950">QR check-in</h2>
            </div>
            {data.status === 'CONFIRMED' ? (
              <>
                <p className="mt-1 text-[11px] leading-5 text-ink-400">
                  Tunjukkan QR kepada petugas front desk saat tiba. QR bersifat rahasia, sekali
                  pakai, dan kedaluwarsa otomatis.
                </p>
                {qr.data ? (
                  <div className="mt-4 flex flex-col items-center rounded-2xl border border-ink-100 bg-white p-4">
                    <div
                      role="img"
                      aria-label={`QR check-in untuk reservasi ${data.bookingCode}`}
                      className="rounded-xl bg-white p-1"
                    >
                      <QRCodeSVG value={qr.data.token} size={196} marginSize={2} />
                    </div>
                    <p className="mt-3 text-[11px] font-semibold text-ink-700">
                      Tunjukkan QR ini kepada petugas front desk
                    </p>
                    <p className="mt-1 text-[10px] text-ink-400">
                      Berlaku sampai {formatDateTime(qr.data.expiresAt)}
                    </p>
                  </div>
                ) : (
                  <Button
                    className="mt-4 w-full"
                    loading={qr.isPending}
                    onClick={() => qr.mutate()}
                  >
                    <KeyRound className="h-4 w-4" />
                    Terbitkan QR check-in
                  </Button>
                )}
                <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5 text-[10px] leading-4 text-ink-400">
                  Menerbitkan QR baru akan membatalkan QR sebelumnya. Check-in hanya dapat dilakukan
                  pada rentang tanggal reservasi.
                </p>
              </>
            ) : data.status === 'CHECKED_IN' ? (
              <Notice tone="info">
                Anda sedang menginap. Lihat informasi check-out pada halaman check-out.
              </Notice>
            ) : (
              <p className="mt-2 rounded-xl bg-ink-50 px-3 py-3 text-xs text-ink-500">
                QR check-in tersedia setelah reservasi berstatus terkonfirmasi.
              </p>
            )}
            <div className="mt-4 space-y-2 text-[11px] text-ink-500">
              <p className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                Check-in dapat diproses pada {formatDate(data.checkInDate)} hingga sehari sebelum{' '}
                {formatDate(data.checkOutDate)}.
              </p>
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                Kamar harus berstatus siap (housekeeping READY) dan tidak diblokir pemeliharaan.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink-950">Bantuan</h2>
            <p className="mt-2 text-[11px] leading-5 text-ink-500">
              Perubahan tanggal atau tamu pada reservasi terkonfirmasi harus melalui front desk.
              Pembatalan mandiri tersedia sampai sehari sebelum check-in.
            </p>
            <Link
              to="/crew/help"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700"
            >
              Buka pusat bantuan
            </Link>
          </Card>
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Batalkan reservasi"
        description={`Reservasi ${data.bookingCode} akan dibatalkan dan alokasi tempat tidur dilepas.`}
      >
        <div className="space-y-4">
          <Field label="Alasan pembatalan" hint="Minimal 3 karakter, maksimal 500 karakter.">
            <Textarea
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: perubahan jadwal dinas"
            />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Kembali
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => cancel.mutate()}
            >
              <XCircle className="h-4 w-4" />
              Batalkan reservasi
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InfoRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink-800">{value}</dd>
    </div>
  );
}
