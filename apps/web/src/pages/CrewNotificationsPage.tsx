import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Mail, MailOpen } from 'lucide-react';
import type { NotificationSummary, PaginationMeta } from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Pagination,
  Skeleton,
} from '../components/ui';
import { useListParams } from '../hooks/useListParams';
import { useIsDemoEnv } from '../auth/AuthProvider';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime, humanize } from '../lib/format';

interface NotificationList {
  items: NotificationSummary[];
  unread: number;
  pagination: PaginationMeta;
}

export function CrewNotificationsPage() {
  const demoEnv = useIsDemoEnv();
  const params = useListParams({ page: '1', pageSize: '10' });
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const notifications = useQuery({
    queryKey: ['notifications', params.values],
    queryFn: () =>
      apiRequest<NotificationList>(
        `/api/v1/notifications${queryString({
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ read: boolean }>(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: () =>
      apiRequest<{ updated: number }>('/api/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const items = notifications.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifikasi"
        title="Kotak masuk"
        description="Pemberitahuan reservasi, check-in/out, dan pembaruan akomodasi Anda."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={markAll.isPending}
            disabled={(notifications.data?.unread ?? 0) === 0}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-4 w-4" />
            Tandai semua dibaca
          </Button>
        }
      />

      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      <Card>
        {notifications.isError ? (
          <div className="p-4">
            <ErrorState
              message="Notifikasi tidak dapat dimuat."
              onRetry={() => notifications.refetch()}
            />
          </div>
        ) : null}

        {notifications.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell className="h-5 w-5" />}
              title="Belum ada notifikasi"
              description="Pemberitahuan terkait reservasi dan akomodasi akan muncul di sini."
            />
          </div>
        ) : (
          <div className="divide-y divide-ink-50">
            {items.map((item) => (
              <div
                key={item.id}
                className={
                  item.readAt
                    ? 'flex items-start gap-3 px-4 py-4'
                    : 'flex items-start gap-3 bg-brand-50/30 px-4 py-4'
                }
              >
                <span
                  className={
                    item.readAt
                      ? 'rounded-xl bg-ink-100 p-2 text-ink-400'
                      : 'rounded-xl bg-brand-100 p-2 text-brand-700'
                  }
                >
                  {item.readAt ? (
                    <MailOpen className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                    {!item.readAt ? <Badge tone="brand">Baru</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-500">{item.body}</p>
                  <p className="mt-1 text-[10px] text-ink-400">
                    {formatDateTime(item.createdAt)} · {humanize(item.eventCode)}
                  </p>
                </div>
                {!item.readAt ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 px-2 sm:px-3"
                    aria-label="Tandai dibaca"
                    title="Tandai dibaca"
                    onClick={() => markRead.mutate(item.id)}
                    loading={markRead.isPending && markRead.variables === item.id}
                    disabled={markRead.isPending}
                  >
                    <Check className="h-3.5 w-3.5 sm:hidden" />
                    <span className="hidden sm:inline">Tandai dibaca</span>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {notifications.data ? (
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={notifications.data.pagination.total}
            onPageChange={params.setPage}
            onPageSizeChange={params.setPageSize}
            fetching={notifications.isFetching}
            itemLabel="notifikasi"
          />
        ) : null}
      </Card>
      <p className="text-[11px] text-ink-400">
        {demoEnv
          ? 'Pengiriman email/Telegram pada lingkungan demo menggunakan provider MOCK. Status "terkirim" bukan berarti pesan nyata telah dikirim ke saluran eksternal.'
          : 'Status pengiriman mengikuti provider email/Telegram yang dikonfigurasi. Bila provider nonaktif, pesan tidak dikirim ke saluran eksternal.'}
      </p>
    </div>
  );
}
