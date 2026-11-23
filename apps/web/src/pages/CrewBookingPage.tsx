import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BedDouble, Check, CircleAlert, Sparkles } from 'lucide-react';
import type {
  AccommodationGallery,
  AvailabilityResult,
  DormitorySummary,
  ReservationDetail,
} from '@whoosh/shared';
import { SafeImage } from '../components/gallery';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { addDaysIso, errorMessage, todayIso } from '../lib/errors';
import { displayName, formatDate } from '../lib/format';
import type { Paged } from '../lib/types';

function demoLabel(value: string | null | undefined) {
  if (!value) return '—';
  return value.replace(/^DEMO\s+/i, '').trim();
}

export function CrewBookingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayIso();
  const [dormitoryId, setDormitoryId] = useState(params.get('dormitoryId') ?? '');
  const [checkIn, setCheckIn] = useState(params.get('checkIn') ?? today);
  const [checkOut, setCheckOut] = useState(params.get('checkOut') ?? addDaysIso(today, 1));
  const [bedId, setBedId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const dormitories = useQuery({
    queryKey: ['dormitories', 'booking'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 60_000,
  });
  const gallery = useQuery({
    queryKey: ['accommodation', 'gallery', 'booking'],
    queryFn: () => apiRequest<AccommodationGallery>('/api/v1/accommodation/gallery'),
    staleTime: 60_000,
  });

  const datesValid = checkOut > checkIn;
  const availability = useQuery({
    queryKey: ['availability', 'booking', dormitoryId, checkIn, checkOut],
    queryFn: () =>
      apiRequest<AvailabilityResult>(
        `/api/v1/availability${queryString({ checkIn, checkOut, dormitoryId })}`,
      ),
    enabled: Boolean(dormitoryId) && datesValid,
    staleTime: 10_000,
  });

  const beds = useMemo(
    () => availability.data?.dormitories.flatMap((item) => item.beds) ?? [],
    [availability.data],
  );
  const selectedBed = bedId ? beds.find((bed) => bed.id === bedId) : undefined;

  useEffect(() => {
    if (bedId && availability.data && !beds.some((bed) => bed.id === bedId)) {
      setBedId(null);
    }
  }, [bedId, availability.data, beds]);

  const create = useMutation({
    mutationFn: () =>
      apiRequest<ReservationDetail>('/api/v1/reservations', {
        method: 'POST',
        body: JSON.stringify({
          dormitoryId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          occupantCount: 1,
          purpose: purpose.trim() ? purpose.trim() : undefined,
          ...(bedId ? { bedIds: [bedId] } : {}),
          idempotencyKey,
        }),
      }),
    onSuccess: (reservation) => {
      navigate(`/crew/reservations/${reservation.id}?created=1`, { replace: true });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    create.mutate();
  };

  const dormitory = dormitories.data?.items.find((item) => item.id === dormitoryId);
  const dormitoryName = dormitory ? displayName(dormitory.name) : undefined;
  const dormitoryGallery = gallery.data?.items.find((item) => item.dormitoryId === dormitoryId);
  const nights = datesValid
    ? Math.max(
        1,
        Math.round(
          (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000,
        ),
      )
    : 0;
  const currentStep = !dormitoryId || !datesValid ? 1 : bedId ? 3 : 2;

  return (
    <div className="space-y-6">
      <Link
        to="/crew/search"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
      >
        <BedDouble className="h-3.5 w-3.5" />
        Kembali ke pencarian
      </Link>
      <PageHeader
        eyebrow="Reservasi baru"
        title="Ajukan reservasi akomodasi"
        description="Pilih dormitory, rentang tanggal, dan tempat tidur. Reservasi dapat memerlukan persetujuan administrator sesuai kebijakan yang berlaku."
      />

      <ol className="grid gap-2 rounded-2xl border border-ink-200/70 bg-white p-2 shadow-[var(--shadow-card)] sm:grid-cols-3">
        {[
          { step: 1, title: 'Jadwal & dormitory', detail: 'Tujuan dan rentang tanggal' },
          { step: 2, title: 'Pilih tempat tidur', detail: 'Opsional — otomatis bila kosong' },
          { step: 3, title: 'Kirim reservasi', detail: 'Pantau status persetujuan' },
        ].map((item) => {
          const state =
            item.step < currentStep ? 'done' : item.step === currentStep ? 'active' : 'next';
          return (
            <li
              key={item.step}
              className={
                state === 'active'
                  ? 'flex items-center gap-3 rounded-xl bg-brand-50/80 px-3.5 py-3'
                  : 'flex items-center gap-3 rounded-xl px-3.5 py-3'
              }
            >
              <span
                className={
                  state === 'active'
                    ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white'
                    : state === 'done'
                      ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700'
                      : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-500'
                }
              >
                {state === 'done' ? <Check className="h-4 w-4" /> : item.step}
              </span>
              <span className="min-w-0">
                <span
                  className={
                    state === 'next'
                      ? 'block text-xs font-semibold text-ink-500'
                      : 'block text-xs font-semibold text-ink-900'
                  }
                >
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-ink-400">
                  {item.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <Notice tone="danger">
          <span className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </span>
        </Notice>
      ) : null}

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-bold text-ink-950">Detail menginap</h2>
            <Field label="Dormitory">
              <Select
                value={dormitoryId}
                onChange={(event) => {
                  setDormitoryId(event.target.value);
                  setBedId(null);
                }}
                required
              >
                <option value="">Pilih dormitory</option>
                {dormitories.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {displayName(item.name)}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tanggal check-in">
                <Input
                  type="date"
                  value={checkIn}
                  min={today}
                  onChange={(event) => {
                    setCheckIn(event.target.value);
                    setBedId(null);
                  }}
                  required
                />
              </Field>
              <Field
                label="Tanggal check-out"
                error={!datesValid ? 'Check-out harus setelah check-in' : undefined}
              >
                <Input
                  type="date"
                  value={checkOut}
                  min={addDaysIso(checkIn, 1)}
                  onChange={(event) => {
                    setCheckOut(event.target.value);
                    setBedId(null);
                  }}
                  required
                />
              </Field>
            </div>
            <Field
              label="Keperluan (opsional)"
              hint="Contoh: dinas luar kota, standby stasiun, atau kegiatan operasional."
            >
              <Textarea
                rows={3}
                value={purpose}
                maxLength={300}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Jelaskan singkat keperluan menginap"
              />
            </Field>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink-950">Pilih tempat tidur</h2>
                <p className="mt-1 text-[11px] leading-5 text-ink-400">
                  {!dormitoryId
                    ? 'Pilih dormitory dan tanggal untuk melihat tempat tidur yang tersedia.'
                    : availability.isError
                      ? 'Ketersediaan tidak dapat dimuat.'
                      : `${beds.length} tempat tidur tersedia untuk ${formatDate(checkIn)} – ${formatDate(checkOut)}.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={bedId ? 'brand' : 'neutral'}>
                  {bedId ? 'Dipilih manual' : 'Ditetapkan otomatis'}
                </Badge>
                {bedId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBedId(null)}>
                    Otomatis
                  </Button>
                ) : null}
              </div>
            </div>

            {!dormitoryId || !datesValid ? null : availability.isLoading ? (
              <Skeleton className="mt-4 h-24 w-full" />
            ) : availability.isError ? (
              <div className="mt-4">
                <ErrorState
                  message="Ketersediaan tempat tidur tidak dapat dimuat."
                  onRetry={() => availability.refetch()}
                />
              </div>
            ) : beds.length === 0 ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-800">
                Tidak ada tempat tidur tersedia untuk rentang ini. Coba tanggal lain.
              </p>
            ) : (
              <div className="scrollbar-slim mt-4 max-h-[380px] overflow-y-auto pr-1">
                <div className="grid gap-2 sm:grid-cols-2">
                  {beds.map((bed) => (
                    <button
                      key={bed.id}
                      type="button"
                      onClick={() => setBedId(bed.id === bedId ? null : bed.id)}
                      aria-pressed={bedId === bed.id}
                      className={
                        bedId === bed.id
                          ? 'flex items-start gap-2 rounded-xl border border-brand-300 bg-brand-50/70 px-3 py-2.5 text-left'
                          : 'flex items-start gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-left hover:border-ink-300'
                      }
                    >
                      <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-ink-900">
                          {bed.roomNumber}/{bed.bedCode}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-400">
                          {demoLabel(bed.buildingName)} lt. {bed.floorNumber} ·{' '}
                          {demoLabel(bed.roomTypeName)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {dormitoryGallery ? (
            <Card className="overflow-hidden">
              <div className="relative aspect-[16/9]">
                <SafeImage
                  src={dormitoryGallery.coverPhoto?.url}
                  alt={
                    dormitoryGallery.coverPhoto?.caption ??
                    `Foto ${displayName(dormitoryGallery.name)}`
                  }
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400">
                    Pilihan Anda
                  </p>
                  <p className="text-sm font-bold text-white">
                    {displayName(dormitoryGallery.name)}
                  </p>
                  <p className="text-[10px] text-white/70">
                    {dormitoryGallery.roomCount} kamar · {dormitoryGallery.bedCount} tempat tidur
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-bold text-ink-950">Ringkasan</h2>
            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5">
                <dt className="text-ink-400">Dormitory</dt>
                <dd className="text-right font-semibold text-ink-800">
                  {dormitoryName ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5">
                <dt className="text-ink-400">Durasi</dt>
                <dd className="text-right font-semibold text-ink-800">
                  {datesValid ? `${nights} malam` : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5">
                <dt className="text-ink-400">Tanggal</dt>
                <dd className="text-right font-semibold text-ink-800">
                  {formatDate(checkIn)} → {formatDate(checkOut)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5">
                <dt className="text-ink-400">Tamu</dt>
                <dd className="font-semibold text-ink-800">1 kru (diri sendiri)</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-400">Tempat tidur</dt>
                <dd className="text-right font-semibold text-ink-800">
                  {bedId
                    ? selectedBed
                      ? `${selectedBed.roomNumber}/${selectedBed.bedCode}`
                      : 'Tidak tersedia lagi — pilih ulang'
                    : 'Otomatis'}
                </dd>
              </div>
            </dl>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={create.isPending}
              disabled={!dormitoryId || !datesValid}
            >
              <Sparkles className="h-4 w-4" />
              Kirim reservasi
            </Button>
            <p className="text-center text-[10px] leading-4 text-ink-400">
              Setelah dikirim, reservasi dapat berstatus menunggu persetujuan. Anda akan menerima
              notifikasi di portal.
            </p>
          </Card>
        </div>
      </form>
    </div>
  );
}
