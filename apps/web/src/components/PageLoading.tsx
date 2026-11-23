import { cn } from './ui';

export function PageLoading({
  fullScreen = false,
  label = 'Memuat halaman…',
}: {
  fullScreen?: boolean;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full items-center justify-center',
        fullScreen ? 'min-h-screen bg-sand-50' : 'min-h-[55vh]',
      )}
    >
      <span className="flex items-center gap-3 text-sm font-semibold text-ink-500">
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700"
        />
        {label}
      </span>
    </div>
  );
}
