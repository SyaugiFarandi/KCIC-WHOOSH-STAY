import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { monthLabel } from '../lib/format';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'maroon';
type Size = 'sm' | 'md' | 'lg';

const buttonVariants: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-sm disabled:bg-brand-300',
  maroon:
    'bg-sidebar text-white hover:bg-sidebar-hover active:bg-sidebar-active shadow-sm disabled:bg-sidebar-muted',
  secondary:
    'bg-white text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-50 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 disabled:text-brand-300',
};

const buttonSizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-ink-200/70 bg-white shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

const badgeTones = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  brand: 'bg-brand-50 text-brand-800 border-brand-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<string, keyof typeof badgeTones> = {
  ACTIVE: 'success',
  READY: 'success',
  SUCCEEDED: 'success',
  APPROVED: 'success',
  CONFIRMED: 'success',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  DIRTY: 'warning',
  INSPECTION_REQUIRED: 'warning',
  CLEANING: 'info',
  RUNNING: 'info',
  PARTIAL: 'warning',
  SUSPENDED: 'warning',
  DISABLED: 'danger',
  FAILED: 'danger',
  REJECTED: 'danger',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
  MOCK: 'brand',
  MOCK_DELIVERED: 'info',
  DELIVERED: 'success',
  SENT: 'success',
  QUEUED: 'info',
  CONFIGURED: 'info',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return <Badge tone={statusTone[status] ?? 'neutral'}>{label}</Badge>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-950 md:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MonthNavigator({
  month,
  onShift,
  onToday,
}: {
  month: string;
  onShift: (delta: number) => void;
  onToday: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onShift(-1)}
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[104px] text-center text-sm font-bold capitalize text-ink-900 sm:min-w-[128px]">
        {monthLabel(month)}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onShift(1)}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={onToday}>
        Bulan ini
      </Button>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warning';
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  };
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink-950">{value}</p>
          {hint ? <p className="mt-1 break-words text-xs text-ink-400">{hint}</p> : null}
        </div>
        {icon ? <div className={cn('shrink-0 rounded-xl p-2.5', tones[tone])}>{icon}</div> : null}
      </div>
    </Card>
  );
}

export function DistributionBar({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number; colorClass: string }>;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const visible = items.filter((item) => item.value > 0);
  const description = items.map((item) => `${item.label}: ${item.value}`).join(', ');
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{title}</p>
      {total === 0 ? (
        <p className="mt-3 text-xs text-ink-400">Belum ada data.</p>
      ) : (
        <>
          <div
            className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-ink-100"
            role="img"
            aria-label={`${title}: ${description}`}
          >
            {visible.map((item) => (
              <div
                key={item.label}
                className={item.colorClass}
                style={{ width: `${(item.value / total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-600">
                <span className={cn('h-2.5 w-2.5 rounded-full', item.colorClass)} aria-hidden />
                {item.label}
                <span className="font-bold tabular-nums text-ink-900">{item.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-ink-400 shadow-sm">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-ink-100', className)} />;
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const child = isValidElement(children) ? children : null;
  const childProps = (child?.props ?? {}) as { 'aria-describedby'?: string };
  const describedBy =
    [childProps['aria-describedby'], error ? errorId : undefined, hint ? hintId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  const control =
    child === null
      ? children
      : cloneElement(child as ReactElement<Record<string, unknown>>, {
          'aria-describedby': describedBy,
          ...(error ? { 'aria-invalid': true } : {}),
        });
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-700">{label}</span>
      {control}
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="mt-1 block text-xs text-ink-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50',
        className,
      )}
      {...props}
    />
  );
}

export function SkipLink({ target }: { target: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-800 focus:shadow-lg"
    >
      Lewati ke konten
    </a>
  );
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      {/* mt-[3px] = half of Input's mt-1.5, so the icon centers on the field, not the wrapper */}
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 mt-[3px] h-4 w-4 -translate-y-1/2 text-ink-300"
      />
      <Input {...props} className="pl-9" />
    </div>
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}

export function Notice({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  return (
    <div className={cn('rounded-xl border px-3.5 py-2.5 text-xs leading-5', tones[tone])}>
      {children}
    </div>
  );
}

let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = '';

export function lockBodyScroll(): () => void {
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks === 0) document.body.style.overflow = bodyOverflowBeforeLock;
  };
}

function useDialogFocus(
  open: boolean,
  onClose: () => void,
  dialogRef: { current: HTMLDivElement | null },
) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const visible = (element: HTMLElement) => element.offsetParent !== null;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(visible);

    // Prefer a primary form control over the close button so typing does not
    // start next to an accidental dismiss target.
    const initialTarget =
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
        ) ?? [],
      ).find(visible) ?? focusables()[0];
    initialTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const releaseScrollLock = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      releaseScrollLock();
      restoreFocusRef.current?.focus?.();
    };
  }, [open, dialogRef]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus(open, onClose, dialogRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ink-950">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Tutup dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: Array<{ value: T; label: string; count?: number; icon?: ReactNode; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-2xl border border-ink-200 bg-white p-1.5',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        const enabled = items.filter((item) => !item.disabled);
        const index = enabled.findIndex((item) => item.value === value);
        if (index < 0) return;
        const next =
          event.key === 'ArrowRight'
            ? enabled[(index + 1) % enabled.length]
            : enabled[(index - 1 + enabled.length) % enabled.length];
        if (next) {
          event.preventDefault();
          onChange(next.value);
          const target = event.currentTarget.querySelector<HTMLElement>(
            `[data-tab-value="${next.value}"]`,
          );
          target?.focus();
        }
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-tab-value={item.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:text-ink-300',
              selected
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                  selected ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-500',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  fetching = false,
  itemLabel = 'catatan',
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
  fetching?: boolean;
  itemLabel?: string;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  const blocked = disabled || fetching;

  return (
    <nav
      aria-label={`Navigasi halaman ${itemLabel}`}
      className={cn(
        'flex flex-col gap-3 border-t border-ink-100 px-4 py-3 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span aria-live="polite" className="tabular-nums">
          {total === 0
            ? `Tidak ada ${itemLabel}`
            : `Menampilkan ${start}–${end} dari ${total} ${itemLabel}`}
        </span>
        <span className="hidden text-ink-300 sm:inline" aria-hidden>
          ·
        </span>
        <span className="tabular-nums text-ink-400">
          Halaman {currentPage} dari {totalPages}
        </span>
        {fetching ? (
          <span className="inline-flex items-center gap-1 text-ink-400" role="status">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Memuat
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
            Baris
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              disabled={blocked}
              className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700 disabled:cursor-not-allowed disabled:text-ink-400"
              aria-label={`Jumlah ${itemLabel} per halaman`}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || currentPage <= 1}
            onClick={() => onPageChange(1)}
            aria-label="Halaman pertama"
            title="Halaman pertama"
            className="px-2 sm:px-3"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
            <span className="hidden lg:inline">Pertama</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="Halaman sebelumnya"
            title="Halaman sebelumnya"
            className="px-2 sm:px-3"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="hidden md:inline">Sebelumnya</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="Halaman berikutnya"
            title="Halaman berikutnya"
            className="px-2 sm:px-3"
          >
            <span className="hidden md:inline">Berikutnya</span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Halaman terakhir"
            title="Halaman terakhir"
            className="px-2 sm:px-3"
          >
            <span className="hidden lg:inline">Terakhir</span>
            <ChevronsRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} aria-label="Memuat" />;
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50">
      <div className="flex flex-col items-center gap-3 text-ink-500">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
        <span className="text-sm">Memuat Whoosh Stay…</span>
      </div>
    </div>
  );
}

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  ariaLabel,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'Belum ada data',
  emptyDescription = 'Data akan muncul di sini setelah tersedia.',
  emptyIcon,
  footer,
  onRowClick,
  rowClassName,
  minWidthClass = 'min-w-[640px]',
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  ariaLabel: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  minWidthClass?: string;
}) {
  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (error) {
    return (
      <div className="p-4">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div>
      <div className="scrollbar-slim overflow-x-auto">
        <table className={cn('w-full border-collapse text-sm', minWidthClass)}>
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/60">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500',
                    alignClass(column.align),
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-ink-100">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10">
                  <div className="flex flex-col items-center gap-2 text-center">
                    {emptyIcon ? <div className="text-ink-300">{emptyIcon}</div> : null}
                    <p className="text-sm font-semibold text-ink-700">{emptyTitle}</p>
                    <p className="max-w-md text-sm text-ink-500">{emptyDescription}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'border-b border-ink-100 last:border-b-0',
                    onRowClick &&
                      'cursor-pointer hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn('px-4 py-3.5 text-ink-800', alignClass(column.align), column.className)}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus(open, onClose, dialogRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/45 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-bold text-ink-950">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-xs text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Tutup panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-slim flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-ink-100 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  tone = 'danger',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
