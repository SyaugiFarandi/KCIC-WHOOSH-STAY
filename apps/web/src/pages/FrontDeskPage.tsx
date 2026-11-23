import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  DoorOpen,
  LogOut,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { ReservationDetail, StayRecord } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDateTime } from '../lib/format';

interface ValidateQrResponse {
  valid: boolean;
  canCheckIn: boolean;
  expiresAt: string;
  reservation: ReservationDetail;
}

export function FrontDeskPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [lookupCode, setLookupCode] = useState('');
  const [token, setToken] = useState('');
  const [qrResult, setQrResult] = useState<ValidateQrResponse | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<ReservationDetail | null>(null);
  const [checkoutLookupCode, setCheckoutLookupCode] = useState<string | null>(null);
  const [roomCondition, setRoomCondition] = useState('GOOD');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useQuery({
    queryKey: ['stay', 'lookup', lookupCode],
    queryFn: () =>
      apiRequest<ReservationDetail>(
        `/api/v1/stays/lookup${queryString({ code: lookupCode })}`,
      ),
    enabled: Boolean(lookupCode),
    retry: false,
  });

  const active = useQuery({
    queryKey: ['stays', 'active', 'front-desk'],
    queryFn: () => apiRequest<{ items: StayRecord[] }>('/api/v1/stays/active'),
    staleTime: 15_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['stays'] });
    void queryClient.invalidateQueries({ queryKey: ['stay'] });
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const validateQr = useMutation({
    mutationFn: () =>
      apiRequest<ValidateQrResponse>('/api/v1/stays/validate-qr', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim() }),
      }),
    onSuccess: (result) => {
      setQrResult(result);
      setError(null);
    },
    onError: (mutationError) => {
      setQrResult(null);
      setError(errorMessage(mutationError));
    },
  });

  const checkIn = useMutation({
    mutationFn: (input: { reservationId?: string; token?: string }) =>
      apiRequest<ReservationDetail>('/api/v1/stays/check-in', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (reservation) => {
      setFeedback(`Check-in ${reservation.bookingCode} berhasil.`);
      setQrResult(null);
      setToken('');
      setLookupCode('');
      setCode('');
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const checkOut = useMutation({
    mutationFn: (reservationId: string) =>
      apiRequest<ReservationDetail>('/api/v1/stays/check-out', {
        method: 'POST',
        body: JSON.stringify({ reservationId, roomCondition, notes: notes || undefined }),
      }),
    onSuccess: (reservation) => {
      setFeedback(`Check-out ${reservation.bookingCode} tercatat.`);
      setCheckoutTarget(null);
      setNotes('');
      setRoomCondition('GOOD');
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const reservation = lookup.data ?? qrResult?.reservation ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Front desk"
        title="Check-in & check-out"
        description="Proses check-in melalui QR atau kode booking, dan catat check-out tamu. Semua aksi tercatat pada audit log."
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {hasPermission('stays.check_in') ? (
          <>
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-ink-950">Check-in dengan QR</h2>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-ink-400">
                Tempel token QR dari portal kru. Token diverifikasi hash-nya, masa berlaku, status
                pakai, identitas tamu, dan kesiapan kamar.
              </p>
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (token.trim().length >= 20) validateQr.mutate();
                }}
              >
                <Field label="Token QR">
                  <Textarea
                    rows={3}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Tempel token QR di sini"
                  />
                </Field>
                <Button type="submit" loading={validateQr.isPending} disabled={token.trim().length < 20}>
                  <QrCode className="h-4 w-4" />
                  Validasi QR
                </Button>
              </form>
              {qrResult ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="h-4 w-4" />
                    QR valid · {qrResult.reservation.bookingCode}
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-800/80">
                    {qrResult.canCheckIn
                      ? 'Reservasi berada dalam jendela check-in.'
                      : 'Reservasi di luar jendela check-in atau belum terkonfirmasi.'}
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    loading={checkIn.isPending}
                    disabled={!qrResult.canCheckIn}
                    onClick={() => checkIn.mutate({ token: token.trim() })}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Proses check-in QR
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-ink-950">Check-in dengan kode booking</h2>
              </div>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  setLookupCode(code.trim());
                  setQrResult(null);
                  setError(null);
                  setFeedback(null);
                }}
              >
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="WS-XXXXXX-XXXXXX"
                  className="font-mono"
                  aria-label="Kode booking"
                />
                <Button type="submit" variant="secondary">
                  Cari
                </Button>
              </form>

              {lookup.isError ? (
                <div className="mt-3">
                  <ErrorState message="Reservasi tidak ditemukan atau di luar scope Anda." />
                </div>
              ) : null}

              {reservation ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-ink-100 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs font-bold text-ink-900">
                        {reservation.bookingCode}
                      </p>
                      <StatusBadge status={reservation.status} />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-ink-800">
                      {reservation.employeeName} · {reservation.dormitoryName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {formatDate(reservation.checkInDate)} →{' '}
                      {formatDate(reservation.checkOutDate)}
                    </p>
                    {reservation.allocationSummary ? (
                      <p className="mt-1 text-[11px] text-ink-500">
                        {reservation.allocationSummary}
                      </p>
                    ) : null}
                  </div>
                  {reservation.canCheckIn ? (
                    <Button
                      loading={checkIn.isPending}
                      onClick={() => checkIn.mutate({ reservationId: reservation.id })}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Proses check-in manual
                    </Button>
                  ) : (
                    <p className="text-[11px] text-ink-500">
                      Check-in hanya tersedia untuk reservasi terkonfirmasi pada rentang tanggalnya.
                    </p>
                  )}
                </div>
              ) : null}
            </Card>
          </>
        ) : null}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-bold text-ink-950">Tamu sedang menginap</h2>
          </div>
          <Badge tone="info">{active.data?.items.length ?? 0} reservasi</Badge>
        </div>

        {active.isError ? (
          <div className="p-4">
            <ErrorState message="Data menginap tidak dapat dimuat." onRetry={() => active.refetch()} />
          </div>
        ) : null}

        {active.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (active.data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<DoorOpen className="h-5 w-5" />}
              title="Tidak ada tamu menginap"
              description="Check-in yang diproses akan muncul di daftar ini beserta tombol check-out."
            />
          </div>
        ) : (
          <div className="divide-y divide-ink-50">
            {active.data?.items.map((stay) => (
              <div
                key={stay.reservationId}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-xs font-bold text-ink-900">{stay.bookingCode}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink-800">
                    {stay.employeeName} · {stay.dormitoryName}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {stay.roomBeds} · {formatDate(stay.checkInDate)} → {formatDate(stay.checkOutDate)}
                    {stay.checkedInAt ? ` · in ${formatDateTime(stay.checkedInAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checkoutLookupCode !== null}
                    loading={checkoutLookupCode === stay.bookingCode}
                    onClick={() => {
                      setCheckoutTarget(null);
                      setError(null);
                      setFeedback(null);
                      setCheckoutLookupCode(stay.bookingCode);
                      void lookupByCode(stay.bookingCode)
                        .then(setCheckoutTarget)
                        .catch(() => {
                          setError('Detail reservasi tidak dapat dimuat.');
                        })
                        .finally(() => setCheckoutLookupCode(null));
                    }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Check-out
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(checkoutTarget)}
        onClose={() => setCheckoutTarget(null)}
        title={checkoutTarget ? `Check-out ${checkoutTarget.bookingCode}` : 'Check-out'}
        description="Tamu yang tersisa akan diproses check-out. Bila semua tamu keluar, reservasi menjadi CHECKED_OUT."
      >
        {checkoutTarget ? (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Kru</dt>
                <dd className="mt-0.5 text-xs font-medium text-ink-800">
                  {checkoutTarget.employeeName}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  Kamar
                </dt>
                <dd className="mt-0.5 text-xs font-medium text-ink-800">
                  {checkoutTarget.allocationSummary ?? '—'}
                </dd>
              </div>
            </dl>
            <Field label="Kondisi kamar">
              <Select value={roomCondition} onChange={(event) => setRoomCondition(event.target.value)}>
                <option value="GOOD">Baik</option>
                <option value="NEEDS_ATTENTION">Perlu perhatian</option>
                <option value="DAMAGED">Rusak</option>
              </Select>
            </Field>
            <Field label="Catatan (opsional)">
              <Textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Catatan kondisi kamar atau barang tertinggal"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCheckoutTarget(null)}>
                Batal
              </Button>
              <Button
                loading={checkOut.isPending}
                onClick={() => checkOut.mutate(checkoutTarget.id)}
              >
                <LogOut className="h-4 w-4" />
                Proses check-out
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

async function lookupByCode(code: string): Promise<ReservationDetail> {
  return apiRequest<ReservationDetail>(
    `/api/v1/stays/lookup${queryString({ code })}`,
  );
}
