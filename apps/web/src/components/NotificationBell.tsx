import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { cn } from './ui';

interface NotificationRow {
  id: string;
  eventCode: string;
  title: string;
  body: string;
  readAt: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

interface NotificationEnvelope {
  items: NotificationRow[];
  unread: number;
}

type Filter = 'all' | 'unread';

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));
}

function notificationHref(notification: NotificationRow, scope: 'crew' | 'management'): string | null {
  const type = notification.referenceType?.toUpperCase();
  if (!type) return null;
  if (scope === 'management') {
    switch (type) {
      case 'RESERVATION':
        return '/manage/reservations';
      case 'HOUSEKEEPING_TASK':
      case 'HOUSEKEEPING':
        return '/manage/housekeeping';
      case 'MAINTENANCE_TICKET':
      case 'MAINTENANCE':
        return '/manage/maintenance';
      case 'ROSTER':
      case 'ROSTER_ASSIGNMENT':
        return '/manage/roster';
      default:
        return null;
    }
  }
  switch (type) {
    case 'RESERVATION':
      return notification.referenceId
        ? `/crew/reservations/${notification.referenceId}`
        : '/crew/reservations';
    case 'STAY':
      return '/crew/schedule';
    case 'ROSTER':
    case 'ROSTER_ASSIGNMENT':
      return '/crew/schedule';
    default:
      return '/crew/notifications';
  }
}

export function NotificationBell({
  scope,
  allHref,
}: {
  scope: 'crew' | 'management';
  allHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ['notifications', 'header', filter],
    queryFn: () =>
      apiRequest<NotificationEnvelope>(
        `/api/v1/notifications?pageSize=8${filter === 'unread' ? '&unread=true' : ''}`,
      ),
    refetchInterval: 45_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => apiRequest('/api/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unread = notifications.data?.unread ?? 0;
  const items = notifications.data?.items ?? [];

  const openNotification = (notification: NotificationRow) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    const href = notificationHref(notification, scope);
    setOpen(false);
    if (href) navigate(href);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-ink-200 bg-white/80 text-ink-500 transition-colors hover:border-brand-200 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[9px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Pusat notifikasi"
          tabIndex={-1}
          className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-pop focus:outline-none"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink-950">Notifikasi</p>
              <p className="text-[11px] text-ink-400">{unread} belum dibaca</p>
            </div>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 disabled:text-ink-300"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tandai semua
            </button>
          </div>

          <div className="flex gap-1 border-b border-ink-100 px-3 py-2">
            {(['all', 'unread'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-semibold',
                  filter === value
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-ink-400 hover:text-ink-700',
                )}
              >
                {value === 'all' ? 'Semua' : 'Belum dibaca'}
              </button>
            ))}
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {notifications.isLoading ? (
              <div className="space-y-2 p-3">
                <div className="h-12 animate-pulse rounded-lg bg-ink-100" />
                <div className="h-12 animate-pulse rounded-lg bg-ink-100" />
              </div>
            ) : null}
            {notifications.isError ? (
              <p className="px-4 py-6 text-center text-xs text-red-600">
                Notifikasi tidak dapat dimuat.
              </p>
            ) : null}
            {!notifications.isLoading && !notifications.isError && items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Inbox className="h-5 w-5 text-ink-300" />
                <p className="text-xs text-ink-400">
                  {filter === 'unread' ? 'Tidak ada notifikasi belum dibaca.' : 'Belum ada notifikasi.'}
                </p>
              </div>
            ) : null}
            {items.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className="flex w-full items-start gap-2 border-b border-ink-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-ink-50/60"
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    notification.readAt ? 'bg-transparent' : 'bg-brand-700',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-xs',
                      notification.readAt ? 'font-medium text-ink-600' : 'font-bold text-ink-900',
                    )}
                  >
                    {notification.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-ink-500">
                    {notification.body}
                  </span>
                  <span className="mt-1 block text-[10px] text-ink-400">
                    {relativeTime(notification.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {allHref ? (
            <Link
              to={allHref}
              onClick={() => setOpen(false)}
              className="block border-t border-ink-100 px-4 py-2.5 text-center text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
            >
              Lihat semua notifikasi
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
