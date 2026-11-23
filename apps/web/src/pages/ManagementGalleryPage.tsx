import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  Camera,
  CheckCircle2,
  ImagePlus,
  Images,
  MapPin,
  Star,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  ACCOMMODATION_PHOTO_CATEGORIES,
  type AccommodationGallery,
  type AccommodationPhoto,
  type AccommodationPhotoCategory,
  type DormitoryDetail,
} from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
} from '../components/ui';
import { PhotoLightbox, SafeImage, categoryLabel } from '../components/gallery';
import { apiRequest, apiUpload } from '../lib/api';
import { errorMessage } from '../lib/errors';

const CATEGORY_LABELS: Record<AccommodationPhotoCategory, string> = {
  BEDROOM: 'Kamar (keseluruhan)',
  BED: 'Tempat tidur',
  BATHROOM: 'Kamar mandi',
  WARDROBE: 'Lemari',
  DESK: 'Meja kerja',
  FACILITY: 'Fasilitas umum',
};

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function ManagementGalleryPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDormitoryId, setSelectedDormitoryId] = useState<string | null>(null);
  const [scope, setScope] = useState<string>('dormitory');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<AccommodationPhotoCategory>('BEDROOM');
  const [caption, setCaption] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AccommodationPhoto | null>(null);
  const [viewer, setViewer] = useState<{ photos: AccommodationPhoto[]; index: number } | null>(
    null,
  );

  const gallery = useQuery({
    queryKey: ['accommodation', 'gallery'],
    queryFn: () => apiRequest<AccommodationGallery>('/api/v1/accommodation/gallery'),
    staleTime: 30_000,
  });

  const dormitory = useQuery({
    queryKey: ['dormitory', selectedDormitoryId],
    queryFn: () => apiRequest<DormitoryDetail>(`/api/v1/dormitories/${selectedDormitoryId}`),
    enabled: Boolean(selectedDormitoryId),
  });

  useEffect(() => {
    if (!selectedDormitoryId && gallery.data?.items.length) {
      setSelectedDormitoryId(gallery.data.items[0]!.dormitoryId);
    }
  }, [gallery.data, selectedDormitoryId]);

  const item = gallery.data?.items.find((entry) => entry.dormitoryId === selectedDormitoryId);

  const rooms = useMemo(
    () =>
      (dormitory.data?.buildings ?? []).flatMap((building) =>
        building.floors.flatMap((floor) =>
          floor.rooms.map((room) => ({
            id: room.id,
            roomNumber: room.roomNumber,
            roomTypeName: room.roomTypeName,
            buildingCode: building.code,
            floorNumber: floor.floorNumber,
            status: room.operationalStatus,
          })),
        ),
      ),
    [dormitory.data],
  );

  useEffect(() => {
    setScope('dormitory');
  }, [selectedDormitoryId]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scopedPhotos = useMemo(() => {
    if (!item) return [];
    return item.photos
      .filter((photo) => (scope === 'dormitory' ? !photo.roomId : photo.roomId === scope))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }, [item, scope]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['accommodation', 'gallery'] });

  const resetMessages = () => {
    setFeedback(null);
    setError(null);
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !selectedDormitoryId) throw new Error('Pilih file foto terlebih dahulu.');
      const form = new FormData();
      form.append('file', file);
      form.append('dormitoryId', selectedDormitoryId);
      if (scope !== 'dormitory') form.append('roomId', scope);
      form.append('category', category);
      if (caption.trim()) form.append('caption', caption.trim());
      return apiUpload<AccommodationPhoto>('/api/v1/accommodation/photos', form);
    },
    onMutate: resetMessages,
    onSuccess: () => {
      setFile(null);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback('Foto berhasil diunggah. Pratinjau dan urutan sudah diperbarui.');
      void invalidate();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setCover = useMutation({
    mutationFn: (photo: AccommodationPhoto) =>
      apiRequest(`/api/v1/accommodation/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCover: true }),
      }),
    onMutate: resetMessages,
    onSuccess: () => {
      setFeedback('Cover foto diperbarui.');
      void invalidate();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const move = useMutation({
    mutationFn: async ({ photo, direction }: { photo: AccommodationPhoto; direction: -1 | 1 }) => {
      const ids = scopedPhotos.map((entry) => entry.id);
      const index = ids.indexOf(photo.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return null;
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      return apiRequest('/api/v1/accommodation/photos/reorder', {
        method: 'POST',
        body: JSON.stringify({
          dormitoryId: photo.dormitoryId,
          ...(photo.roomId ? { roomId: photo.roomId } : {}),
          orderedIds: ids,
        }),
      });
    },
    onMutate: resetMessages,
    onSuccess: () => {
      setFeedback('Urutan foto diperbarui.');
      void invalidate();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (photo: AccommodationPhoto) =>
      apiRequest(`/api/v1/accommodation/photos/${photo.id}`, { method: 'DELETE' }),
    onMutate: resetMessages,
    onSuccess: () => {
      setDeleting(null);
      setFeedback('Foto dihapus. Bila foto cover dihapus, cover baru otomatis dipilih.');
      void invalidate();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const busy = upload.isPending || setCover.isPending || move.isPending || remove.isPending;
  const scopeLabel =
    scope === 'dormitory'
      ? 'Foto umum dormitory'
      : `Kamar ${rooms.find((room) => room.id === scope)?.roomNumber ?? ''}`;

  const handleFile = (selected: File | null) => {
    resetMessages();
    if (!selected) {
      setFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Format foto harus JPG, PNG, atau WebP.');
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Ukuran foto maksimal 12 MB.');
      return;
    }
    setFile(selected);
  };

  const openViewer = (photo: AccommodationPhoto) => {
    if (!item) return;
    const photos = item.photos
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    setViewer({ photos, index: Math.max(0, photos.findIndex((entry) => entry.id === photo.id)) });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Media akomodasi"
        title="Galeri foto akomodasi"
        description="Kelola foto interior dormitory dan kamar yang tampil di portal kru: unggah, atur cover, urutkan, dan hapus."
      />

      {gallery.isError ? (
        <ErrorState
          message="Galeri tidak dapat dimuat atau di luar akses Anda."
          onRetry={() => gallery.refetch()}
        />
      ) : null}

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {gallery.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      ) : !gallery.data?.items.length ? (
        <EmptyState
          icon={<Camera className="h-5 w-5" />}
          title="Belum ada dormitory"
          description="Galeri hanya tersedia untuk dormitory dalam scope akses Anda."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-brand-700 px-5 py-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-400">
                  Pilih lokasi
                </p>
                <p className="mt-1 text-sm text-white/75">
                  Tiap dormitory memiliki set foto interior sendiri.
                </p>
              </div>
              <div className="space-y-4 p-5">
                <Field label="Dormitory">
                  <Select
                    value={selectedDormitoryId ?? ''}
                    onChange={(event) => setSelectedDormitoryId(event.target.value)}
                  >
                    {gallery.data.items.map((entry) => (
                      <option key={entry.dormitoryId} value={entry.dormitoryId}>
                        {entry.name} ({entry.code})
                      </option>
                    ))}
                  </Select>
                </Field>
                {item ? (
                  <div className="space-y-2 rounded-xl bg-ink-50/70 px-3.5 py-3 text-[11px] text-ink-500">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {item.stationCode ? `Stasiun ${item.stationCode}` : item.code}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {item.roomCount} kamar · {item.bedCount} tempat tidur
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Images className="h-3.5 w-3.5" />
                      {item.photos.length} foto terunggah
                    </p>
                  </div>
                ) : null}
                <Field
                  label="Kelompok foto"
                  hint="Foto umum tampil sebagai cover dormitory; foto kamar tampil di tipe kamar."
                >
                  <Select value={scope} onChange={(event) => setScope(event.target.value)}>
                    <option value="dormitory">Foto umum dormitory</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Kamar {room.roomNumber} · {room.roomTypeName} · {room.buildingCode} L
                        {room.floorNumber}
                      </option>
                    ))}
                  </Select>
                </Field>
                {scope !== 'dormitory' && item && !scopedPhotos.length ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    Kamar ini belum memiliki foto. Kru akan melihat gambar fallback pada tipe kamar
                    tersebut.
                  </p>
                ) : null}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-brand-700" />
                <h2 className="text-sm font-bold text-ink-950">Unggah foto baru</h2>
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                JPG, PNG, atau WebP hingga 12 MB. Gambar otomatis dikonversi ke WebP dan dibuat
                thumbnail.
              </p>
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!upload.isPending) upload.mutate();
                }}
              >
                <Field label="Berkas foto">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                    className="block w-full cursor-pointer rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-3 py-3 text-xs text-ink-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:bg-ink-50"
                  />
                </Field>
                {file ? (
                  <div className="overflow-hidden rounded-xl border border-ink-100">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Pratinjau foto yang akan diunggah"
                        className="h-36 w-full object-cover"
                      />
                    ) : null}
                    <p className="flex items-center gap-1.5 bg-brand-50 px-3 py-2 text-[11px] text-brand-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                ) : null}
                <Field label="Kategori">
                  <Select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as AccommodationPhotoCategory)
                    }
                  >
                    {ACCOMMODATION_PHOTO_CATEGORIES.map((entry) => (
                      <option key={entry} value={entry}>
                        {CATEGORY_LABELS[entry]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Keterangan (opsional)">
                  <input
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    maxLength={200}
                    placeholder="Contoh: Tempat tidur tunggal dengan lampu baca"
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={!file || busy}>
                  <UploadCloud className="h-4 w-4" />
                  {upload.isPending ? 'Mengunggah…' : `Unggah ke ${scopeLabel.toLowerCase()}`}
                </Button>
              </form>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-ink-950">{scopeLabel}</h2>
                  <p className="mt-1 text-[11px] text-ink-400">
                    Tandai satu foto sebagai cover; urutan mengatur tampilan galeri. Gunakan panah
                    untuk menggeser posisi.
                  </p>
                </div>
                <Badge tone="info">{scopedPhotos.length} foto</Badge>
              </div>

              {!item ? (
                <div className="mt-4">
                  <Skeleton className="h-52 w-full" />
                </div>
              ) : scopedPhotos.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<Images className="h-5 w-5" />}
                    title="Belum ada foto pada kelompok ini"
                    description="Unggah foto interior melalui panel di samping. Foto pertama otomatis menjadi cover."
                  />
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {scopedPhotos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="group overflow-hidden rounded-2xl border border-ink-100 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => openViewer(photo)}
                        className="relative block aspect-[4/3] w-full overflow-hidden bg-ink-100"
                      >
                        <SafeImage
                          src={photo.thumbnailUrl}
                          alt={photo.caption ?? 'Foto akomodasi'}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                          {photo.isCover ? (
                            <Badge tone="success" className="border-transparent shadow-sm">
                              <Star className="h-3 w-3" />
                              Cover
                            </Badge>
                          ) : null}
                          <Badge tone="neutral" className="border-transparent shadow-sm">
                            {categoryLabel(photo.category)}
                          </Badge>
                        </span>
                        <span className="absolute bottom-2 right-2 rounded-full bg-ink-950/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                          {index + 1} / {scopedPhotos.length}
                        </span>
                      </button>
                      <div className="space-y-2.5 p-3">
                        <p className="line-clamp-2 min-h-[2rem] text-[11px] text-ink-500">
                          {photo.caption ?? 'Tanpa keterangan'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!photo.isCover ? (
                            <button
                              type="button"
                              onClick={() => setCover.mutate(photo)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-[10px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-800 disabled:opacity-50"
                            >
                              <Star className="h-3 w-3" />
                              Jadikan cover
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Cover aktif
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => move.mutate({ photo, direction: -1 })}
                            disabled={busy || index === 0}
                            className="rounded-lg border border-ink-200 p-1 text-ink-500 hover:border-brand-300 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Geser foto ${index + 1} ke kiri`}
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move.mutate({ photo, direction: 1 })}
                            disabled={busy || index === scopedPhotos.length - 1}
                            className="rounded-lg border border-ink-200 p-1 text-ink-500 hover:border-brand-300 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Geser foto ${index + 1} ke kanan`}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              resetMessages();
                              setDeleting(photo);
                            }}
                            disabled={busy}
                            className="ml-auto rounded-lg border border-red-200 p-1 text-red-700 hover:bg-red-50 disabled:opacity-40"
                            aria-label={`Hapus foto ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {item ? (
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-brand-700" />
                  <h2 className="text-sm font-bold text-ink-950">Cakupan foto per kamar</h2>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">
                  Tipe kamar tanpa foto akan memakai gambar fallback NETRAL di portal kru.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {rooms.map((room) => {
                    const count = item.photos.filter((photo) => photo.roomId === room.id).length;
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => setScope(room.id)}
                        className={
                          count
                            ? 'flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-left'
                            : 'flex items-center justify-between gap-2 rounded-xl border border-dashed border-ink-200 px-3 py-2 text-left hover:border-brand-300'
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-ink-800">
                            Kamar {room.roomNumber}
                          </span>
                          <span className="block truncate text-[10px] text-ink-400">
                            {room.roomTypeName} · {room.buildingCode} L{room.floorNumber}
                          </span>
                        </span>
                        <span
                          className={
                            count
                              ? 'rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700'
                              : 'rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500'
                          }
                        >
                          {count} foto
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Hapus foto?"
        description="Tindakan ini menghapus foto dari galeri dan penyimpanan objek. Bila foto ini cover, foto berikutnya otomatis dipromosikan."
      >
        <div className="space-y-4">
          {deleting ? (
            <div className="flex gap-3 rounded-xl border border-ink-100 p-3">
              <SafeImage
                src={deleting.thumbnailUrl}
                alt={deleting.caption ?? 'Foto'}
                className="h-16 w-20 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 text-xs text-ink-600">
                <p className="font-semibold text-ink-900">{categoryLabel(deleting.category)}</p>
                <p className="mt-0.5 line-clamp-2">{deleting.caption ?? 'Tanpa keterangan'}</p>
                {deleting.isCover ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">Foto cover aktif</p>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleting(null)}
              disabled={remove.isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => deleting && remove.mutate(deleting)}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {remove.isPending ? 'Menghapus…' : 'Hapus foto'}
            </Button>
          </div>
        </div>
      </Modal>

      {viewer ? (
        <PhotoLightbox
          photos={viewer.photos}
          startIndex={viewer.index}
          title={item?.name}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}
