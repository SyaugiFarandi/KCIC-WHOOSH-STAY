import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import type { AccommodationPhoto } from '@whoosh/shared';
import { Badge, cn } from './ui';
import { humanize } from '../lib/format';

export const FALLBACK_PHOTO = '/photos/fallback.svg';

const CATEGORY_LABELS: Record<string, string> = {
  BEDROOM: 'Kamar tidur',
  BED: 'Tempat tidur',
  BATHROOM: 'Kamar mandi',
  WARDROBE: 'Lemari',
  DESK: 'Meja kerja',
  FACILITY: 'Fasilitas',
};

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? humanize(category);
}

export function SafeImage({
  src,
  alt,
  className,
  loading = 'lazy',
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <img
      src={failed || !src ? FALLBACK_PHOTO : src}
      alt={alt}
      loading={loading}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function PhotoLightbox({
  photos,
  startIndex = 0,
  onClose,
  title,
}: {
  photos: AccommodationPhoto[];
  startIndex?: number;
  onClose: () => void;
  title?: string;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, photos.length - 1)));

  const move = useCallback(
    (direction: 1 | -1) => {
      setIndex((current) => {
        if (photos.length === 0) return 0;
        return (current + direction + photos.length) % photos.length;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [move, onClose]);

  const photo = photos[index];

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-ink-950/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Galeri foto ${title}` : 'Galeri foto'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title ?? 'Galeri foto'}</p>
          <p className="text-[11px] text-white/60">
            {photos.length ? `${index + 1} / ${photos.length}` : '0 / 0'}
            {photo ? ` · ${categoryLabel(photo.category)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white"
          aria-label="Tutup galeri"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 sm:px-14"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {photo ? (
          <SafeImage
            src={photo.url}
            alt={photo.caption ?? `Foto ${categoryLabel(photo.category)}`}
            loading="eager"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
        ) : (
          <p className="text-sm text-white/70">Belum ada foto untuk ditampilkan.</p>
        )}
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white/85 backdrop-blur hover:bg-white/20 sm:left-4"
              aria-label="Foto sebelumnya"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white/85 backdrop-blur hover:bg-white/20 sm:right-4"
              aria-label="Foto berikutnya"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      <div className="border-t border-white/10 px-4 py-3 sm:px-6">
        {photo?.caption ? (
          <p className="mb-2 text-xs text-white/75">{photo.caption}</p>
        ) : null}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-slim">
          {photos.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(itemIndex)}
              className={cn(
                'h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-opacity',
                itemIndex === index
                  ? 'border-gold-400 opacity-100'
                  : 'border-transparent opacity-55 hover:opacity-85',
              )}
              aria-label={`Lihat foto ${itemIndex + 1}`}
              aria-current={itemIndex === index}
            >
              <SafeImage src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GalleryHero({
  photo,
  title,
  subtitle,
  badge,
  onOpen,
  photoCount,
  children,
}: {
  photo: AccommodationPhoto | null | undefined;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onOpen: () => void;
  photoCount: number;
  children?: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-ink-900">
      <SafeImage
        src={photo?.url}
        alt={photo?.caption ?? `Foto ${title}`}
        loading="eager"
        priority
        className="h-[300px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] sm:h-[400px] lg:h-[460px]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {photoCount > 0 ? (
            <Badge tone="neutral" className="border-white/25 bg-white/10 text-white">
              <Images className="h-3 w-3" />
              {photoCount} foto
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle ? (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/75 sm:text-sm">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-ink-900 shadow-lg transition-transform hover:scale-[1.02]"
          >
            <Images className="h-4 w-4" />
            Lihat Semua Foto
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PhotoStrip({
  photos,
  onOpen,
  className,
}: {
  photos: AccommodationPhoto[];
  onOpen: (index: number) => void;
  className?: string;
}) {
  if (!photos.length) {
    return (
      <div className="overflow-hidden rounded-xl">
        <SafeImage src={null} alt="Foto belum tersedia" className={cn('h-28 w-full object-cover opacity-70', className)} />
      </div>
    );
  }
  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      {photos.slice(0, 3).map((photo, index) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onOpen(index)}
          className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-ink-100"
          aria-label={`Lihat foto ${photo.caption ?? index + 1}`}
        >
          <SafeImage
            src={photo.thumbnailUrl}
            alt={photo.caption ?? 'Foto akomodasi'}
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
