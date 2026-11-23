import { useQuery } from '@tanstack/react-query';
import { Mail, Send } from 'lucide-react';
import type { PaginationMeta } from '@whoosh/shared';
import {
  Badge,
  Card,
  DataTable,
  Field,
  Notice,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import { useListParams } from '../hooks/useListParams';
import { apiRequest, queryString } from '../lib/api';
import { formatDateTime, humanize } from '../lib/format';

interface DeliveryRow {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  providerMessageId: string | null;
  attemptCount: number;
  sentAt: string | null;
  createdAt: string;
}

interface DeliveriesResponse {
  items: DeliveryRow[];
  pagination: PaginationMeta;
  deliveryMode: string;
}

const columns: Array<DataTableColumn<DeliveryRow>> = [
  {
    key: 'channel',
    header: 'Kanal',
    render: (row) => (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
        {row.channel === 'EMAIL' ? (
          <Mail className="h-3.5 w-3.5 text-ink-300" />
        ) : (
          <Send className="h-3.5 w-3.5 text-ink-300" />
        )}
        {humanize(row.channel)}
      </div>
    ),
  },
  {
    key: 'recipient',
    header: 'Penerima',
    render: (row) => <span className="text-xs text-ink-600">{row.recipient}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'attemptCount',
    header: 'Percobaan',
    render: (row) => <span className="text-xs text-ink-600">{row.attemptCount}</span>,
  },
  {
    key: 'providerMessageId',
    header: 'Provider ID',
    render: (row) => (
      <span className="font-mono text-[10px] text-ink-400">{row.providerMessageId ?? '—'}</span>
    ),
  },
  {
    key: 'sentAt',
    header: 'Dikirim',
    render: (row) => (
      <span className="text-[11px] text-ink-500">
        {row.sentAt ? formatDateTime(row.sentAt) : '—'}
      </span>
    ),
  },
  {
    key: 'createdAt',
    header: 'Dibuat',
    render: (row) => (
      <span className="text-[11px] text-ink-500">{formatDateTime(row.createdAt)}</span>
    ),
  },
];

export function NotificationDeliveriesPage() {
  const params = useListParams({ channel: '', status: '', page: '1', pageSize: '20' });

  const deliveries = useQuery({
    queryKey: ['notification-deliveries', params.values],
    queryFn: () =>
      apiRequest<DeliveriesResponse>(
        `/api/v1/admin/notification-deliveries${queryString({
          channel: params.values.channel,
          status: params.values.status,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const isMockProvider = deliveries.data?.deliveryMode === 'MOCK';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administrasi"
        title="Pengiriman notifikasi"
        description={
          isMockProvider
            ? 'Catatan pengiriman notifikasi melalui provider pengembangan. Status di sini adalah hasil simulasi, bukan pengiriman email/Telegram nyata.'
            : 'Catatan pengiriman notifikasi ke email dan Telegram sesuai konfigurasi provider.'
        }
        actions={
          deliveries.data ? (
            <Badge tone={isMockProvider ? 'warning' : 'info'}>
              Provider: {deliveries.data.deliveryMode}
            </Badge>
          ) : null
        }
      />

      {isMockProvider ? (
        <Notice tone="warning">
          Semua pengiriman pada lingkungan ini menggunakan provider mock. Tidak ada pesan yang benar-benar
          dikirim ke email atau Telegram. Konfigurasi provider nyata belum tersedia.
        </Notice>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-[200px]">
            <Field label="Kanal">
              <Select
                value={params.values.channel}
                onChange={(event) => params.setFilters({ channel: event.target.value })}
              >
                <option value="">Semua kanal</option>
                <option value="IN_APP">IN_APP</option>
                <option value="EMAIL">EMAIL</option>
                <option value="TELEGRAM">TELEGRAM</option>
              </Select>
            </Field>
          </div>
          <div className="w-full sm:max-w-[200px]">
            <Field label="Status">
              <Select
                value={params.values.status}
                onChange={(event) => params.setFilters({ status: event.target.value })}
              >
                <option value="">Semua status</option>
                <option value="QUEUED">QUEUED</option>
                <option value="SENT">SENT</option>
                <option value="MOCK_DELIVERED">MOCK_DELIVERED</option>
                <option value="FAILED">FAILED</option>
              </Select>
            </Field>
          </div>
          <p className="pb-2 text-xs text-ink-400 sm:ml-auto">
            {deliveries.data ? `${deliveries.data.pagination.total} catatan` : 'Memuat…'}
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={deliveries.data?.items ?? []}
          rowKey={(row) => row.id}
          ariaLabel="Tabel pengiriman notifikasi"
          loading={deliveries.isLoading}
          error={deliveries.isError ? 'Catatan pengiriman tidak dapat dimuat.' : null}
          onRetry={() => deliveries.refetch()}
          emptyTitle="Belum ada catatan pengiriman"
          emptyDescription="Catatan muncul saat notifikasi menghasilkan pengiriman melalui provider mock."
          emptyIcon={<Send className="h-5 w-5" />}
          minWidthClass="min-w-[760px]"
          footer={
            deliveries.data ? (
              <Pagination
                page={params.page}
                pageSize={params.pageSize}
                total={deliveries.data.pagination.total}
                onPageChange={params.setPage}
                onPageSizeChange={params.setPageSize}
                fetching={deliveries.isFetching}
                itemLabel="pengiriman"
              />
            ) : null
          }
        />
      </Card>
    </div>
  );
}
