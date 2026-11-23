import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  Filter,
  Images,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  AccommodationGallery,
  AccommodationGalleryDormitory,
  AccommodationPhoto,
  AvailabilityResult,
} from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
} from '../components/ui';
import { PhotoLightbox, SafeImage } from '../components/gallery';
import { useIsDemoEnv } from '../auth/AuthProvider';
import { apiRequest, queryString } from '../lib/api';
import { addDaysIso, todayIso } from '../lib/errors';
import { displayName, formatDate, humanize } from '../lib/format';

type SortKey = 'availability' | 'name' | 'station';
type Row = {
  dormitory: AvailabilityResult['dormitories'][number];
  gallery: AccommodationGalleryDormitory | undefined;
  location: string;
};

function demoLabel(value: string) {
  return humanize(value.replace(/^DEMO\s+/i, '').trim());
}

function locationLabel(name: string) {
  return displayName(name).replace(/^Dormitory\s+/i, '').trim();
}

function bedLabel(bed: AvailabilityResult['dormitories'][number]['beds'][number]) {
  return bed.label?.trim() || `${bed.roomNumber} · ${bed.bedCode}`;
}

export function CrewSearchPage() {
  const demoEnv = useIsDemoEnv();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const [checkIn, setCheckIn] = useState(params.get('checkIn') ?? today);
  const [checkOut, setCheckOut] = useState(params.get('checkOut') ?? addDaysIso(today, 1));
  const [applied, setApplied] = useState({
    checkIn: params.get('checkIn') ?? today,
    checkOut: params.get('checkOut') ?? addDaysIso(today, 1),
  });
  const [location, setLocation] = useState(params.get('location') ?? 'ALL');
  const [guests, setGuests] = useState(params.get('guests') ?? '1');
  const [roomType, setRoomType] = useState(params.get('roomType') ?? 'ALL');
  const [facility, setFacility] = useState(params.get('facility') ?? 'ALL');
  const [onlyAvailable, setOnlyAvailable] = useState(params.get('available') === '1');
  const [sort, setSort] = useState<SortKey>((params.get('sort') as SortKey) ?? 'availability');
  const [viewer, setViewer] = useState<{ title: string; photos: AccommodationPhoto[] } | null>(
    null,
  );

  const availability = useQuery({
    queryKey: ['availability', applied],
    queryFn: () => apiRequest<AvailabilityResult>(`/api/v1/availability${queryString(applied)}`),
    staleTime: 15_000,
    retry: false,
  });

  const gallery = useQuery({
    queryKey: ['accommodation', 'gallery'],
    queryFn: () => apiRequest<AccommodationGallery>('/api/v1/accommodation/gallery'),
    staleTime: 60_000,
  });

  const galleryByDormitory = useMemo(
    () => new Map((gallery.data?.items ?? []).map((item) => [item.dormitoryId, item])),
    [gallery.data],
  );
  const galleryItems = gallery.data?.items ?? [];
  const heroItem = galleryItems[2] ?? galleryItems[0] ?? null;

  const dormitories = availability.data?.dormitories ?? [];

  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const dormitory of dormitories) {
      if (dormitory.stationCode) {
        map.set(dormitory.stationCode, locationLabel(dormitory.dormitoryName));
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'));
  }, [dormitories]);

  const roomTypeOptions = useMemo(() => {
    const map = new Map<string, { name: string; capacity: number }>();
    for (const item of gallery.data?.items ?? []) {
      for (const type of item.roomTypes) {
        if (!map.has(type.code)) {
          map.set(type.code, { name: demoLabel(type.name), capacity: type.capacity });
        }
      }
    }
    return [...map.entries()];
  }, [gallery.data]);

  const facilityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of gallery.data?.items ?? []) {
      for (const value of item.facilities) set.add(value);
    }
    return [...set].sort((a, b) => demoLabel(a).localeCompare(demoLabel(b), 'id'));
  }, [gallery.data]);

  const guestCount = Number.parseInt(guests, 10) || 1;

  const rows = useMemo<Row[]>(() => {
    const mapped: Row[] = dormitories.map((dormitory) => {
      const item = galleryByDormitory.get(dormitory.dormitoryId);
      return {
        dormitory,
        gallery: item,
        location: item ? locationLabel(item.name) : locationLabel(dormitory.dormitoryName),
      };
    });

    const filtered = mapped.filter((row) => {
      if (location !== 'ALL' && row.dormitory.stationCode !== location) return false;
      if (onlyAvailable && row.dormitory.availableBeds < 1) return false;
      if (row.dormitory.availableBeds < guestCount) return false;
      if (roomType !== 'ALL') {
        const types = row.gallery?.roomTypes ?? [];
        if (!types.some((type) => type.code === roomType)) return false;
      }
      if (facility !== 'ALL') {
        const facilities = row.gallery?.facilities ?? [];
        if (!facilities.includes(facility)) return false;
      }
      if (guestCount > 1) {
        const capacity = row.gallery?.roomTypes.reduce((max, type) => Math.max(max, type.capacity), 0);
        if (capacity !== undefined && capacity < guestCount) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === 'name') return a.location.localeCompare(b.location, 'id');
      if (sort === 'station') {
        return (a.dormitory.stationCode ?? '').localeCompare(b.dormitory.stationCode ?? '');
      }
      return b.dormitory.availableBeds - a.dormitory.availableBeds;
    });
  }, [dormitories, galleryByDormitory, location, guestCount, roomType, facility, onlyAvailable, sort]);

  const availableCount = rows.filter((row) => row.dormitory.availableBeds > 0).length;
  const activeFilters =
    (location !== 'ALL' ? 1 : 0) +
    (roomType !== 'ALL' ? 1 : 0) +
    (facility !== 'ALL' ? 1 : 0) +
    (onlyAvailable ? 1 : 0) +
    (guestCount > 1 ? 1 : 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (checkOut <= checkIn) return;
    setApplied({ checkIn, checkOut });
    setParams({
      checkIn,
      checkOut,
      ...(location !== 'ALL' ? { location } : {}),
      ...(guests !== '1' ? { guests } : {}),
      ...(roomType !== 'ALL' ? { roomType } : {}),
      ...(facility !== 'ALL' ? { facility } : {}),
      ...(onlyAvailable ? { available: '1' } : {}),
      ...(sort !== 'availability' ? { sort } : {}),
    });
  };

  const resetFilters = () => {
    setLocation('ALL');
    setGuests('1');
    setRoomType('ALL');
    setFacility('ALL');
    setOnlyAvailable(false);
    setSort('availability');
  };

  const datesValid = checkOut > checkIn;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-ink-200/70 bg-sand-100">
        <div
          className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-gold-400/25 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-200/25 blur-3xl"
          aria-hidden
        />
        <div className="relative grid gap-6 px-6 pb-24 pt-8 sm:px-9 sm:pb-28 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:pb-24">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-700">
              Pencarian akomodasi
            </p>
            <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-[1.05] tracking-[-0.03em] text-ink-950 sm:text-5xl">
              Temukan akomodasi kru
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-600">
              Istirahat tepat di sepanjang rute. Bandingkan dormitory dari foto interior, kamar,
              fasilitas, dan ketersediaan tempat tidur yang dihitung dari alokasi aktual.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLocation('ALL')}
                aria-pressed={location === 'ALL'}
                className={
                  location === 'ALL'
                    ? 'rounded-full bg-ink-950 px-3 py-1 text-[11px] font-semibold text-white'
                    : 'rounded-full border border-ink-300/80 bg-white/70 px-3 py-1 text-[11px] font-medium text-ink-600 hover:border-brand-300 hover:text-brand-800'
                }
              >
                Semua lokasi
              </button>
              {locationOptions.slice(0, 5).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocation((current) => (current === code ? 'ALL' : code))}
                  aria-pressed={location === code}
                  className={
                    location === code
                      ? 'rounded-full bg-ink-950 px-3 py-1 text-[11px] font-semibold text-white'
                      : 'rounded-full border border-ink-300/80 bg-white/70 px-3 py-1 text-[11px] font-medium text-ink-600 hover:border-brand-300 hover:text-brand-800'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="relative overflow-hidden rounded-2xl border border-white/70 shadow-[var(--shadow-pop)]">
              {heroItem ? (
                <>
                  <SafeImage
                    src={heroItem.coverPhoto?.url}
                    alt={heroItem.coverPhoto?.caption ?? `Foto ${heroItem.name}`}
                    loading="eager"
                    priority
                    className="h-64 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/65 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5 text-white">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gold-400">
                        Contoh interior
                      </p>
                      <p className="mt-0.5 text-xs font-semibold">
                        {displayName(heroItem.name)}
                      </p>
                    </div>
                    {demoEnv ? (
                      <Badge tone="neutral" className="border-transparent bg-ink-950/55 text-white">
                        DEMO
                      </Badge>
                    ) : null}
                  </div>
                </>
              ) : gallery.isError ? (
                <div className="flex h-64 w-full flex-col items-center justify-center gap-2 bg-ink-100 px-4 text-center">
                  <p className="text-xs text-ink-500">Foto dormitory tidak dapat dimuat.</p>
                  <Button size="sm" variant="secondary" onClick={() => gallery.refetch()}>
                    Coba lagi
                  </Button>
                </div>
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </div>
            <span className="absolute -left-3 top-4 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold text-ink-600 shadow-sm">
              {galleryItems.length || '—'} dormitory berfoto
            </span>
          </div>
        </div>
      </section>

      <div className="relative z-10 -mt-16 px-3 sm:px-5">
        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <form
            onSubmit={submit}
            className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.1fr_1fr_1fr_0.75fr_auto] lg:items-end"
          >
            <Field label="Lokasi">
              <Select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                aria-label="Lokasi dormitory"
              >
                <option value="ALL">Semua lokasi</option>
                {locationOptions.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Check-in">
              <Input
                type="date"
                value={checkIn}
                min={today}
                onChange={(event) => setCheckIn(event.target.value)}
                required
              />
            </Field>
            <Field
              label="Check-out"
              error={!datesValid ? 'Check-out harus setelah check-in' : undefined}
            >
              <Input
                type="date"
                value={checkOut}
                min={addDaysIso(checkIn, 1)}
                onChange={(event) => setCheckOut(event.target.value)}
                required
              />
            </Field>
            <Field label="Tamu">
              <Select
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
                aria-label="Jumlah tamu"
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value} kru
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="submit"
              size="lg"
              disabled={!datesValid}
              className="h-10 w-full lg:w-auto"
            >
              <Search className="h-4 w-4" />
              Cari kamar
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-100 px-4 py-3 text-[11px] text-ink-400 sm:px-5">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Maksimal 14 malam per reservasi
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="h-3.5 w-3.5" />
              Check-out eksklusif
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Kapasitas kamar hingga 4 kru
            </span>
          </div>
        </Card>
      </div>

      {availability.isError ? (
        <ErrorState
          message="Ketersediaan tidak dapat dimuat. Periksa tanggal lalu coba lagi."
          onRetry={() => availability.refetch()}
        />
      ) : null}

      <section aria-labelledby="search-results-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">
              Hasil pencarian
            </p>
            <h2 id="search-results-heading" className="mt-1 text-xl font-bold text-ink-950">
              {availability.isLoading
                ? 'Menghitung ketersediaan…'
                : `${rows.length} dormitory · ${availableCount} tersedia`}
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              {formatDate(applied.checkIn)} – {formatDate(applied.checkOut)} · posisi tempat tidur
              sebenarnya
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11px] font-semibold text-ink-600">
              <Filter className="h-3 w-3" />
              {activeFilters} filter aktif
            </span>
            <Button variant="ghost" size="sm" onClick={resetFilters} type="button">
              Reset
            </Button>
          </div>
        </div>

        <Card className="flex flex-col gap-3 p-3.5 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter
          </span>
          <Select
            value={roomType}
            onChange={(event) => setRoomType(event.target.value)}
            aria-label="Tipe kamar"
            className="mt-0 h-9 w-full text-xs sm:w-auto"
          >
            <option value="ALL">Semua tipe kamar</option>
            {roomTypeOptions.map(([code, type]) => (
              <option key={code} value={code}>
                {type.name}
              </option>
            ))}
          </Select>
          <Select
            value={facility}
            onChange={(event) => setFacility(event.target.value)}
            aria-label="Fasilitas"
            className="mt-0 h-9 w-full text-xs sm:w-auto"
          >
            <option value="ALL">Semua fasilitas</option>
            {facilityOptions.map((value) => (
              <option key={value} value={value}>
                {demoLabel(value)}
              </option>
            ))}
          </Select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-600">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(event) => setOnlyAvailable(event.target.checked)}
              className="h-4 w-4 rounded border-ink-300 accent-brand-700"
            />
            Hanya yang tersedia
          </label>
          <div className="sm:ml-auto">
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Urutkan hasil"
              className="mt-0 h-9 w-full text-xs sm:w-auto"
            >
              <option value="availability">Ketersediaan terbanyak</option>
              <option value="name">Nama lokasi A–Z</option>
              <option value="station">Kode stasiun</option>
            </Select>
          </div>
        </Card>

        {availability.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : availability.isError ? null : dormitories.length === 0 ? (
          <EmptyState
            icon={<BedDouble className="h-5 w-5" />}
            title="Tidak ada dormitory dalam akses Anda"
            description="Hubungi administrator bila Anda memerlukan akses ke dormitory lain."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Belum ada yang cocok"
            description="Coba perluas lokasi, kurangi jumlah tamu, atau hapus filter fasilitas."
            action={
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                Hapus semua filter
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {rows.map(({ dormitory, gallery: item, location: place }) => {
              const available = dormitory.availableBeds > 0;
              const fillPercent = dormitory.totalBeds
                ? Math.round((dormitory.availableBeds / dormitory.totalBeds) * 100)
                : 0;
              const roomTypes = item?.roomTypes ?? [];
              const facilities = item?.facilities ?? [];
              return (
                <Card
                  key={dormitory.dormitoryId}
                  className="group overflow-hidden transition-shadow hover:shadow-xl"
                >
                  <div className="grid md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr]">
                    <div className="relative min-h-[220px] overflow-hidden md:min-h-full">
                      <SafeImage
                        src={item?.coverPhoto?.url}
                        alt={item?.coverPhoto?.caption ?? `Foto ${dormitory.dormitoryName}`}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                        <Badge
                          tone={available ? 'success' : 'danger'}
                          className="border-transparent shadow-sm"
                        >
                          {available ? `${dormitory.availableBeds} tersedia` : 'Penuh'}
                        </Badge>
                        {demoEnv ? (
                          <Badge tone="neutral" className="border-transparent bg-ink-950/55 text-white">
                            DEMO
                          </Badge>
                        ) : null}
                      </div>
                      {item?.photos.length ? (
                        <button
                          type="button"
                          onClick={() =>
                            setViewer({ title: dormitory.dormitoryName, photos: item.photos })
                          }
                          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink-950/65 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur hover:bg-ink-950/80"
                        >
                          <Images className="h-3 w-3" />
                          Lihat {item.photos.length} foto
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-col p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                            <MapPin className="h-3 w-3" />
                            {place || 'Lokasi belum tersedia'}
                          </p>
                          <h3 className="mt-1 text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">
                            {displayName(dormitory.dormitoryName)}
                          </h3>
                          <p className="mt-1 text-[11px] text-ink-400">
                            {dormitory.dormitoryCode} · {item?.roomCount ?? '—'} kamar ·{' '}
                            {dormitory.totalBeds} tempat tidur
                          </p>
                        </div>
                        <div className="min-w-[110px] text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                            Tempat tidur
                          </p>
                          <p className="text-3xl font-bold leading-none text-ink-950">
                            {dormitory.availableBeds}
                            <span className="ml-1 text-sm font-medium text-ink-400">
                              / {dormitory.totalBeds}
                            </span>
                          </p>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                            <div
                              className={available ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-red-500'}
                              style={{ width: `${Math.max(4, fillPercent)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {item?.description ? (
                        <p className="mt-3 line-clamp-2 text-xs leading-5 text-ink-500">
                          {item.description}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {roomTypes.map((type) => (
                          <Badge key={type.code} tone="neutral">
                            {demoLabel(type.name)} · {type.capacity} kru
                          </Badge>
                        ))}
                        {facilities.slice(0, 3).map((value) => (
                          <Badge key={value} tone="info">
                            {demoLabel(value)}
                          </Badge>
                        ))}
                        {facilities.length > 3 ? (
                          <Badge tone="neutral">+{facilities.length - 3}</Badge>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-2 rounded-xl bg-sand-50 px-3.5 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        {dormitory.beds.length ? (
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                              Pilihan posisi
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-ink-700">
                              {dormitory.beds.slice(0, 3).map(bedLabel).join(' · ')}
                              {dormitory.beds.length > 3
                                ? ` · +${dormitory.beds.length - 3} lainnya`
                                : ''}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-500">
                            Tidak ada tempat tidur kosong pada rentang tanggal ini.
                          </p>
                        )}
                        <p className="text-[10px] text-ink-400 sm:text-right">
                          Check-in QR · Maks. 14 malam
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link
                          to={`/crew/dormitories/${dormitory.dormitoryId}?checkIn=${applied.checkIn}&checkOut=${applied.checkOut}`}
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
                        >
                          Lihat detail
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        {available ? (
                          <Link
                            to={`/crew/book?dormitoryId=${dormitory.dormitoryId}&checkIn=${applied.checkIn}&checkOut=${applied.checkOut}`}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Reservasi
                          </Link>
                        ) : (
                          <span className="inline-flex h-10 items-center rounded-xl bg-ink-100 px-4 text-xs font-semibold text-ink-400">
                            Tidak tersedia
                          </span>
                        )}
                        <span className="ml-auto hidden items-center gap-1 text-[10px] text-ink-400 sm:inline-flex">
                          <Check className="h-3 w-3 text-emerald-600" />
                          Ketersediaan real-time
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card className="flex items-start gap-3 p-4">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        <p className="text-[11px] leading-5 text-ink-500">
          Menampilkan dormitory sesuai scope akses Anda untuk {formatDate(applied.checkIn)} –{' '}
          {formatDate(applied.checkOut)}.
          {demoEnv
            ? ' Foto dan label lokasi pada lingkungan DEMO bersifat ilustratif, bukan dokumentasi fasilitas KCIC resmi.'
            : ''}
        </p>
      </Card>

      {viewer ? (
        <PhotoLightbox photos={viewer.photos} title={viewer.title} onClose={() => setViewer(null)} />
      ) : null}
    </div>
  );
}
