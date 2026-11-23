import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, MapPin, RefreshCcw, Sparkles } from 'lucide-react';
import type { RosterAssignmentSummary, RosterSyncRunSummary } from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage, todayIso, addDaysIso } from '../lib/errors';
import { formatDateTime, humanize } from '../lib/format';
import type { Paged } from '../lib/types';
import { useAuth } from '../auth/AuthProvider';

interface RosterAssignmentsResponse extends Paged<RosterAssignmentSummary> {
  integrationStatus: 'MOCK' | 'CONFIGURED';
}

interface RosterSyncRunsResponse extends Paged<RosterSyncRunSummary> {
  integrationStatus: 'MOCK' | 'CONFIGURED';
}

interface RosterSyncRunResult extends RosterSyncRunSummary {
  provider: string;
  integrationStatus: 'MOCK' | 'CONFIGURED';
}

interface RosterPreview {
  provider: string;
  integrationStatus: 'MOCK';
  startDate: string;
  days: number;
  wouldFetch: number;
  alreadyPresent: number;
  wouldCreate: number;
  sample: Array<{
    externalRosterId: string;
    employeeId: string;
    dutyDate: string;
    stationCode: string | null;
  }>;
}

const columns: Array<DataTableColumn<RosterAssignmentSummary>> = [
  {
    key: 'dutyDate',
    header: 'Tanggal tugas',
    render: (item) => (
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-800">
        <CalendarDays className="h-3.5 w-3.5 text-ink-300" />
        {item.dutyDate}
      </div>
    ),
  },
  {
    key: 'employee',
    header: 'Kru',
    render: (item) => (
      <>
        <p className="text-xs font-semibold text-ink-800">{item.employeeName}</p>
        <p className="text-[10px] text-ink-400">{item.externalRosterId}</p>
      </>
    ),
  },
  {
    key: 'station',
    header: 'Stasiun',
    render: (item) => <span className="text-xs text-ink-600">{item.stationCode ?? '—'}</span>,
  },
  {
    key: 'shift',
    header: 'Shift',
    render: (item) => (
      <span className="text-xs text-ink-600">
        {item.dutyStart && item.dutyEnd
          ? `${new Date(item.dutyStart).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })} – ${new Date(item.dutyEnd).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          : '—'}
      </span>
    ),
  },
  {
    key: 'rosterStatus',
    header: 'Status roster',
    render: (item) => <StatusBadge status={item.rosterStatus} />,
  },
  {
    key: 'syncedAt',
    header: 'Sinkron',
    render: (item) => (
      <span className="text-[11px] text-ink-500">{formatDateTime(item.syncedAt)}</span>
    ),
  },
];

export function RosterPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDaysIso(todayIso(), 6));
  const [stationCode, setStationCode] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncStart, setSyncStart] = useState(todayIso());
  const [syncDays, setSyncDays] = useState(5);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<RosterSyncRunResult | null>(null);

  const assignments = useQuery({
    queryKey: ['roster', 'assignments', { from, to, stationCode, q, page, pageSize }],
    queryFn: () =>
      apiRequest<RosterAssignmentsResponse>(
        `/api/v1/roster/assignments${queryString({
          from,
          to,
          stationCode,
          q,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const syncRuns = useQuery({
    queryKey: ['roster', 'sync-runs'],
    queryFn: () =>
      apiRequest<RosterSyncRunsResponse>('/api/v1/roster/sync-runs?pageSize=5'),
    staleTime: 30_000,
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      apiRequest<RosterPreview>('/api/v1/roster/preview', {
        method: 'POST',
        body: JSON.stringify({ startDate: syncStart, days: syncDays }),
      }),
    onSuccess: (data) => {
      setPreview(data);
      setSyncError(null);
    },
    onError: (error) => setSyncError(errorMessage(error)),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiRequest<RosterSyncRunResult>('/api/v1/roster/sync', {
        method: 'POST',
        body: JSON.stringify({ startDate: syncStart, days: syncDays }),
      }),
    onSuccess: (data) => {
      setSyncResult(data);
      setPreview(null);
      setSyncError(null);
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
    onError: (error) => setSyncError(errorMessage(error)),
  });

  const summaries = {
    total: assignments.data?.pagination.total ?? 0,
    dutyDates: new Set(assignments.data?.items.map((item) => item.dutyDate)).size,
    stations: new Set(
      assignments.data?.items.map((item) => item.stationCode).filter(Boolean),
    ).size,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Duty Roster"
        title="Roster tugas kru"
        description="Roster hasil sinkronisasi dari adapter pengembangan (MOCK). Roster tidak pernah mengubah reservasi yang sudah terkonfirmasi."
        actions={
          <>
            <Badge tone={assignments.data?.integrationStatus === 'MOCK' ? 'warning' : 'info'}>
              Sumber: {humanize(assignments.data?.integrationStatus ?? '—')}
            </Badge>
            {hasPermission('roster.preview') ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSyncOpen(true);
                  setSyncError(null);
                  setSyncResult(null);
                  setPreview(null);
                }}
              >
                <Sparkles className="h-4 w-4" />
                Pratinjau &amp; Sinkron
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Penugasan ditampilkan"
          value={summaries.total}
          hint="Sesuai filter tanggal dan stasiun"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatCard
          label="Tanggal tugas"
          value={summaries.dutyDates}
          hint="Tanggal berbeda dalam rentang"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          label="Stasiun tercakup"
          value={summaries.stations}
          hint="Stasiun dengan penugasan aktif"
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

      <Card>
        <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-2 lg:grid-cols-[150px_150px_160px_1fr]">
          <Field label="Dari tanggal">
            <Input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Sampai tanggal">
            <Input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Stasiun">
            <Select
              value={stationCode}
              onChange={(event) => {
                setStationCode(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua stasiun</option>
              {[...new Set(assignments.data?.items.map((item) => item.stationCode).filter(Boolean))].map(
                (code) => (
                  <option key={code} value={code ?? ''}>
                    {code}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Cari nama kru">
            <SearchInput
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              placeholder="Nama kru"
            />
          </Field>
        </div>

        <DataTable
          columns={columns}
          rows={assignments.data?.items ?? []}
          rowKey={(item) => item.id}
          ariaLabel="Tabel roster tugas kru"
          loading={assignments.isLoading}
          error={assignments.isError ? 'Roster tidak dapat dimuat.' : null}
          onRetry={() => assignments.refetch()}
          emptyTitle="Belum ada roster pada rentang ini"
          emptyDescription="Jalankan pratinjau dan sinkronisasi roster dari adapter pengembangan (MOCK) untuk mengisi data."
          emptyIcon={<CalendarDays className="h-5 w-5" />}
          minWidthClass="min-w-[720px]"
          footer={
            assignments.data ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={assignments.data.pagination.total}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
                fetching={assignments.isFetching}
                itemLabel="penugasan"
              />
            ) : null
          }
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-bold text-ink-950">Riwayat sinkronisasi roster</h2>
          </div>
          <Badge tone="warning">Provider MOCK</Badge>
        </div>

        {syncRuns.isError ? (
          <div className="p-4">
            <ErrorState
              message="Riwayat sinkronisasi roster tidak dapat dimuat."
              onRetry={() => syncRuns.refetch()}
            />
          </div>
        ) : null}

        <div className="divide-y divide-ink-50">
          {syncRuns.data?.items.map((run) => (
            <div
              key={run.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={run.status} />
                <div>
                  <p className="text-xs font-semibold text-ink-800">
                    {run.sourceSystem} · {formatDateTime(run.startedAt)}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {run.fetchedCount} dibaca · {run.createdCount} baru · {run.updatedCount}{' '}
                    diperbarui · {run.unchangedCount} tetap · {run.failedCount} gagal
                  </p>
                </div>
              </div>
              {run.errorSummary ? (
                <p className="max-w-sm text-[11px] text-red-600">{run.errorSummary}</p>
              ) : null}
            </div>
          ))}
          {syncRuns.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : null}
          {syncRuns.data && syncRuns.data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-400">
              Belum ada eksekusi sinkronisasi roster tercatat.
            </p>
          ) : null}
        </div>
      </Card>

      <Modal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        title="Pratinjau & sinkronisasi roster"
        description="Adapter MOCK menghasilkan baris roster deterministik untuk pengujian. Tidak ada integrasi KCIC nyata."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal mulai">
              <Input
                type="date"
                value={syncStart}
                onChange={(event) => {
                  setSyncStart(event.target.value);
                  setPreview(null);
                  setSyncResult(null);
                }}
              />
            </Field>
            <Field label="Jumlah hari" hint="1–14 hari.">
              <Input
                type="number"
                min={1}
                max={14}
                value={syncDays}
                onChange={(event) => {
                  setSyncDays(Number(event.target.value) || 1);
                  setPreview(null);
                  setSyncResult(null);
                }}
              />
            </Field>
          </div>

          <Notice tone="warning">
            Roster hanya menambah/memperbarui penugasan. Reservasi terkonfirmasi tidak pernah diubah
            otomatis oleh proses ini.
          </Notice>

          {syncError ? <Notice tone="danger">{syncError}</Notice> : null}
          {syncResult ? (
            <Notice tone="success">
              Sinkronisasi selesai: {syncResult.fetchedCount} dibaca, {syncResult.createdCount}{' '}
              dibuat, {syncResult.updatedCount} diperbarui, {syncResult.unchangedCount} tidak berubah.
              Status: {syncResult.status}.
            </Notice>
          ) : null}

          {preview ? (
            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
              <p className="text-xs font-semibold text-ink-800">
                {preview.wouldFetch} baris akan diproses · {preview.alreadyPresent} sudah ada ·{' '}
                {preview.wouldCreate} baru
              </p>
              <div className="mt-3 max-h-40 overflow-y-auto text-[11px] text-ink-500 scrollbar-slim">
                {preview.sample.map((row) => (
                  <p key={row.externalRosterId} className="py-0.5 font-mono">
                    {row.dutyDate} · {row.stationCode ?? '—'} · {row.externalRosterId}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => previewMutation.mutate()}
              loading={previewMutation.isPending}
              disabled={syncMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              Pratinjau
            </Button>
            {hasPermission('roster.sync') ? (
              <Button
                onClick={() => syncMutation.mutate()}
                loading={syncMutation.isPending}
                disabled={previewMutation.isPending}
              >
                <RefreshCcw className="h-4 w-4" />
                Jalankan sinkronisasi
              </Button>
            ) : (
              <Badge tone="neutral">Butuh izin roster.sync</Badge>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
