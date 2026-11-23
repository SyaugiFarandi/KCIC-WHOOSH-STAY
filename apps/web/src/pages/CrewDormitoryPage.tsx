import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  Images,
  Layers,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  AccommodationGallery,
  AccommodationPhoto,
  AvailabilityResult,
  DormitoryDetail,
} from '@whoosh/shared';
import {
  Badge,
  StatusBadge,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../components/ui';
import { GalleryHero, PhotoLightbox, PhotoStrip, SafeImage } from '../components/gallery';
import { apiRequest, queryString } from '../lib/api';
import { addDaysIso, todayIso } from '../lib/errors';
import { displayName, formatDate, humanize } from '../lib/format';

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Pria',
  FEMALE: 'Wanita',
  MIXED: 'Campur',
  UNSPECIFIED: 'Tidak ditentukan',
};

function demoLabel(value: string) {
  return humanize(value.replace(/^DEMO\s+/i, '').trim());
}

function shortDay(date: string) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(
    new Date(`${date}T00:00:00`),
  );
}

export function CrewDormitoryPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const checkIn = params.get('checkIn') ?? todayIso();
  const checkOut = params.get('checkOut') ?? addDaysIso(checkIn, 1);
  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) /
        86_400_000,
    ),
  );
  const [viewer, setViewer] = useState<{ photos: AccommodationPhoto[]; index: number } | null>(
    null,
  );

  const detail = useQuery({
    queryKey: ['dormitory', id],
    queryFn: () => apiRequest<DormitoryDetail>(`/api/v1/dormitories/${id}`),
    enabled: Boolean(id),
  });
  const availability = useQuery({
    queryKey: ['availability', 'dormitory', id, checkIn, checkOut],
    queryFn: () =>
      apiRequest<AvailabilityResult>(
        `/api/v1/availability${queryString({ checkIn, checkOut, dormitoryId: id })}`,
      ),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
  const gallery = useQuery({
    queryKey: ['accommodation', 'gallery', id],
    queryFn: () => apiRequest<AccommodationGallery>(`/api/v1/accommodation/gallery?dormitoryId=${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const calendarDays = useMemo(() => {
    const start = todayIso();
    return Array.from({ length: 7 }, (_, index) => addDaysIso(start, index));
  }, []);
  const calendarQueries = useQueries({
    queries: calendarDays.map((day) => ({
      queryKey: ['availability', 'calendar', id, day],
      queryFn: () =>
        apiRequest<AvailabilityResult>(
          `/api/v1/availability${queryString({
            checkIn: day,
            checkOut: addDaysIso(day, 1),
            dormitoryId: id,
          })}`,
        ),
      enabled: Boolean(id),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const selectDay = (day: string) => {
    setParams({ checkIn: day, checkOut: addDaysIso(day, nights) });
  };

  const galleryItem = gallery.data?.items[0];
  const photos = galleryItem?.photos ?? [];

  const previewPhotos = useMemo(() => {
    const picks: AccommodationPhoto[] = [];
    const seen = new Set<string>();
    for (const category of ['BEDROOM', 'BED', 'BATHROOM', 'DESK', 'WARDROBE', 'FACILITY']) {
      const photo = photos.find((item) => item.category === category);
      if (photo && !seen.has(photo.id)) {
        seen.add(photo.id);
        picks.push(photo);
      }
    }
    for (const photo of photos) {
      if (picks.length >= 8) break;
      if (!seen.has(photo.id)) {
        seen.add(photo.id);
        picks.push(photo);
      }
    }
    return picks.slice(0, 8);
  }, [photos]);

  const availableBedIds = useMemo(
    () =>
      new Set(
        availability.data?.dormitories.flatMap((item) => item.beds.map((bed) => bed.id)) ?? [],
      ),
    [availability.data],
  );
  const dormitoryAvailability = availability.data?.dormitories.find(
    (item) => item.dormitoryId === id,
  );

  if (detail.isError) {
    return (
      <ErrorState
        message="Detail dormitory tidak dapat dimuat atau di luar akses Anda."
        onRetry={() => detail.refetch()}
      />
    );
  }

  const openViewer = (index: number) => setViewer({ photos, index });

  return (
    <div className="space-y-6">
      <Link
        to={`/crew/search?checkIn=${checkIn}&checkOut=${checkOut}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke pencarian
      </Link>

      {detail.isLoading || !detail.data ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <GalleryHero
            photo={galleryItem?.coverPhoto ?? photos[0]}
            title={displayName(detail.data.name)}
            subtitle={detail.data.description ?? 'Akomodasi internal kru Whoosh.'}
            photoCount={photos.length}
            onOpen={() => openViewer(0)}
            badge={
              <Badge
                tone={(dormitoryAvailability?.availableBeds ?? 0) > 0 ? 'success' : 'danger'}
                className="border-transparent shadow-sm"
              >
                {(dormitoryAvailability?.availableBeds ?? 0) > 0
                  ? `${dormitoryAvailability?.availableBeds} tempat tidur tersedia`
                  : 'Penuh pada tanggal ini'}
              </Badge>
            }
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/75">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {displayName(detail.data.name).replace(/^Dormitory\s+/i, '')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BedDouble className="h-3.5 w-3.5" />
                {detail.data.bedCount} tempat tidur
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {detail.data.roomCount} kamar · {detail.data.buildingCount} gedung
              </span>
            </div>
          </GalleryHero>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-ink-950">Kamar &amp; konfigurasi tempat tidur</h2>
                    <p className="mt-1 text-[11px] text-ink-400">
                      Setiap tipe kamar menampilkan foto interior, kapasitas, dan fasilitas yang
                      tersedia.
                    </p>
                  </div>
                  <CalendarDays className="h-4 w-4 text-ink-400" />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {(galleryItem?.roomTypes.length
                    ? galleryItem.roomTypes
                    : [{ code: 'default', name: 'Kamar kru', capacity: 0, photos: [] }]
                  ).map((type) => (
                    <div
                      key={type.code}
                      className="overflow-hidden rounded-2xl border border-ink-100 bg-white"
                    >
                      <PhotoStrip
                        photos={type.photos}
                        onOpen={(index) => {
                          const target = type.photos[index];
                          const globalIndex = target
                            ? Math.max(0, photos.findIndex((photo) => photo.id === target.id))
                            : 0;
                          openViewer(globalIndex);
                        }}
                      />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-ink-900">{demoLabel(type.name)}</p>
                          {type.capacity ? (
                            <Badge tone="brand">
                              <Users className="h-3 w-3" />
                              {type.capacity} kru
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-ink-400">
                          {type.photos.length
                            ? `${type.photos.length} foto interior${type.capacity ? ` · kapasitas ${type.capacity} kru` : ''}`
                            : 'Foto interior belum tersedia'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-bold text-ink-950">Fasilitas akomodasi</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(galleryItem?.facilities.length
                    ? galleryItem.facilities
                    : detail.data.facilities.map((facility) => facility.name)
                  ).map((facility) => (
                    <span
                      key={facility}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {humanize(facility.replace(/^DEMO\s+/, ''))}
                    </span>
                  ))}
                  {!galleryItem?.facilities.length && !detail.data.facilities.length ? (
                    <p className="text-[11px] text-ink-400">Data fasilitas belum tersedia.</p>
                  ) : null}
                </div>
                {detail.data.address ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50/70 px-3 py-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    <div>
                      <p className="text-xs font-semibold text-ink-800">{detail.data.address}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        Kontak: {detail.data.contactName ?? '—'} · {detail.data.contactPhone ?? '—'}
                      </p>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>

            <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
              <Card className="overflow-hidden">
                <div className="bg-brand-900 px-5 py-4 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-400">
                    Rencana menginap
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatDate(checkIn)} – {formatDate(checkOut)}
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
                    <span className="text-xs text-ink-500">Ketersediaan aktual</span>
                    <span className="text-sm font-bold text-brand-700">
                      {availability.isLoading
                        ? 'Memeriksa…'
                        : `${dormitoryAvailability?.availableBeds ?? 0} / ${dormitoryAvailability?.totalBeds ?? detail.data.bedCount}`}
                    </span>
                  </div>
                  <Link
                    to={`/crew/book?dormitoryId=${id}&checkIn=${checkIn}&checkOut=${checkOut}`}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-sm font-bold text-white transition-colors hover:bg-brand-800"
                  >
                    <Sparkles className="h-4 w-4" />
                    Reservasi sekarang
                  </Link>
                  <Link
                    to={`/crew/search?checkIn=${checkIn}&checkOut=${checkOut}`}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-ink-200 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-800"
                  >
                    Ubah tanggal
                  </Link>
                  <p className="text-[10px] leading-4 text-ink-400">
                    Reservasi dikonfirmasi setelah validasi administrator sesuai kebijakan yang
                    berlaku. Check-in memerlukan QR yang diterbitkan dari halaman reservasi.
                  </p>
                </div>
              </Card>

              {photos.length ? (
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">
                      Galeri
                    </h3>
                    <button
                      type="button"
                      onClick={() => openViewer(0)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700"
                    >
                      <Images className="h-3.5 w-3.5" />
                      Lihat semua
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {previewPhotos.map((photo, index) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() =>
                          openViewer(
                            Math.max(
                              0,
                              photos.findIndex((entry) => entry.id === photo.id),
                            ),
                          )
                        }
                        className="aspect-square overflow-hidden rounded-lg bg-ink-100"
                        aria-label={`Lihat foto ${index + 1}`}
                      >
                        <SafeImage
                          src={photo.thumbnailUrl}
                          alt={photo.caption ?? 'Foto akomodasi'}
                          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">
                  Kalender ketersediaan
                </p>
                <h2 className="mt-1 text-sm font-bold text-ink-950">7 hari ke depan</h2>
                <p className="mt-1 text-[11px] text-ink-400">
                  Pilih tanggal untuk memindahkan check-in; durasi {nights} malam dipertahankan.
                </p>
              </div>
              <Badge tone="info">
                <CalendarDays className="h-3 w-3" />
                {formatDate(checkIn)} – {formatDate(checkOut)}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {calendarDays.map((day, index) => {
                const result = calendarQueries[index];
                const entry =
                  result?.data?.dormitories.find((item) => item.dormitoryId === id) ??
                  result?.data?.dormitories[0];
                const selected = day === checkIn;
                const inRange = day > checkIn && day < checkOut;
                const beds = entry?.availableBeds;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    aria-pressed={selected}
                    aria-label={`${formatDate(day)}, ${
                      beds === undefined ? 'memuat ketersediaan' : `${beds} tempat tidur tersedia`
                    }`}
                    className={
                      selected
                        ? 'rounded-xl border border-brand-700 bg-brand-700 px-2 py-2.5 text-center text-white'
                        : inRange
                          ? 'rounded-xl border border-brand-200 bg-brand-50 px-2 py-2.5 text-center text-brand-800'
                          : 'rounded-xl border border-ink-200 bg-white px-2 py-2.5 text-center text-ink-700 hover:border-brand-300 hover:bg-brand-50/40'
                    }
                  >
                    <span
                      className={
                        selected
                          ? 'block text-[9px] font-bold uppercase tracking-[0.14em] text-white/70'
                          : 'block text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400'
                      }
                    >
                      {shortDay(day)}
                    </span>
                    <span className="mt-0.5 block text-xs font-bold">
                      {new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(
                        new Date(`${day}T00:00:00`),
                      )}
                    </span>
                    <span
                      className={
                        result?.isLoading || beds === undefined
                          ? 'mt-1 block text-[10px] text-ink-300'
                          : selected
                            ? 'mt-1 block text-[10px] font-semibold text-white/85'
                            : beds === 0
                              ? 'mt-1 block text-[10px] font-semibold text-red-600'
                              : beds <= 5
                                ? 'mt-1 block text-[10px] font-semibold text-amber-600'
                                : 'mt-1 block text-[10px] font-semibold text-emerald-600'
                      }
                    >
                      {result?.isLoading || beds === undefined ? '…' : `${beds} tersedia`}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-ink-400">
              Angka berasal dari alokasi tempat tidur aktual. Check-out eksklusif; malam check-out
              dapat dipakai tamu berikutnya.
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink-950">Ketersediaan per kamar</h2>
              <Badge tone="info">
                <CalendarDays className="h-3 w-3" />
                {formatDate(checkIn)} – {formatDate(checkOut)}
              </Badge>
            </div>
            <div className="mt-4 space-y-5">
              {detail.data.buildings.map((building) => (
                <div key={building.id} className="overflow-hidden rounded-2xl border border-ink-100">
                  <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-brand-600" />
                      <h3 className="text-sm font-bold text-ink-950">
                        {building.name} ({building.code})
                      </h3>
                    </div>
                    <StatusBadge status={building.status} />
                  </div>

                  {building.floors.map((floor) => (
                    <div key={floor.id} className="border-b border-ink-50 last:border-0">
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <Layers className="h-3.5 w-3.5 text-ink-400" />
                        <p className="text-xs font-semibold text-ink-700">
                          {floor.name && floor.name !== `Lantai ${floor.floorNumber}`
                            ? `Lantai ${floor.floorNumber} · ${floor.name}`
                            : `Lantai ${floor.floorNumber}`}
                        </p>
                      </div>
                      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                        {floor.rooms.map((room) => {
                          const availableCount = room.beds.filter((bed) =>
                            availableBedIds.has(bed.id),
                          ).length;
                          const roomPhotos = photos.filter(
                            (photo) => photo.roomNumber === room.roomNumber,
                          );
                          return (
                            <div key={room.id} className="rounded-xl border border-ink-100 bg-white p-3.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-bold text-ink-900">
                                    Kamar {room.roomNumber}
                                  </p>
                                  <p className="text-[11px] text-ink-400">
                                    {demoLabel(room.roomTypeName)} ·{' '}
                                    {GENDER_LABELS[room.genderPolicy] ?? humanize(room.genderPolicy)}
                                  </p>
                                </div>
                                <Badge
                                  tone={
                                    room.operationalStatus !== 'ACTIVE'
                                      ? 'danger'
                                      : availableCount > 0
                                        ? 'success'
                                        : 'warning'
                                  }
                                >
                                  {room.operationalStatus !== 'ACTIVE'
                                    ? humanize(room.operationalStatus)
                                    : `${availableCount} tersedia`}
                                </Badge>
                              </div>
                              {roomPhotos[0] ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const target = roomPhotos[0];
                                    openViewer(
                                      Math.max(
                                        0,
                                        photos.findIndex((photo) => photo.id === target.id),
                                      ),
                                    );
                                  }}
                                  className="mt-2.5 block h-16 w-full overflow-hidden rounded-lg"
                                  aria-label={`Lihat foto kamar ${room.roomNumber}`}
                                >
                                  <SafeImage
                                    src={roomPhotos[0].thumbnailUrl}
                                    alt={roomPhotos[0].caption ?? `Kamar ${room.roomNumber}`}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ) : null}
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {room.beds.map((bed) => {
                                  const isAvailable =
                                    room.operationalStatus === 'ACTIVE' &&
                                    bed.status === 'ACTIVE' &&
                                    availableBedIds.has(bed.id);
                                  return (
                                    <span
                                      key={bed.id}
                                      title={
                                        isAvailable ? 'Tersedia pada tanggal ini' : 'Tidak tersedia'
                                      }
                                      className={
                                        isAvailable
                                          ? 'inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700'
                                          : 'inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-400'
                                      }
                                    >
                                      <BedDouble className="h-3 w-3" />
                                      {bed.bedCode}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          {detail.data.buildings.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="Belum ada gedung"
              description="Dormitory ini belum memiliki gedung atau kamar aktif."
            />
          ) : null}
        </>
      )}

      {viewer ? (
        <PhotoLightbox
          photos={viewer.photos}
          startIndex={viewer.index}
          title={detail.data ? displayName(detail.data.name) : undefined}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}
