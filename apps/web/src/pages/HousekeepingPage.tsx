import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BedDouble,
  CheckCheck,
  ClipboardList,
  Paperclip,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { HousekeepingSummary, HousekeepingTaskSummary } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import {
  Badge,
  Button,
  Card,
  DistributionBar,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
  Textarea,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime, humanize } from '../lib/format';
import type { Paged } from '../lib/types';

interface ReadinessRoom {
  roomId: string;
  roomNumber: string;
  dormitoryName: string;
  buildingName: string;
  floorNumber: number;
  roomStatus: string;
  housekeepingStatus: string;
  openTasks: number;
  beds: Array<{ id: string; bedCode: string; status: string; housekeepingStatus: string }>;
}

export function HousekeepingPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'tasks' | 'readiness'>('tasks');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [taskType, setTaskType] = useState('CLEANING');
  const [notes, setNotes] = useState('');
  const [attachmentTaskId, setAttachmentTaskId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tasks = useQuery({
    queryKey: ['housekeeping', 'tasks', { status, page, pageSize }],
    queryFn: () =>
      apiRequest<Paged<HousekeepingTaskSummary>>(
        `/api/v1/housekeeping/tasks${queryString({ status, page, pageSize })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['housekeeping', 'summary'],
    queryFn: () => apiRequest<HousekeepingSummary>('/api/v1/housekeeping/summary'),
    staleTime: 30_000,
  });

  const readiness = useQuery({
    queryKey: ['housekeeping', 'readiness'],
    queryFn: () => apiRequest<{ items: ReadinessRoom[] }>('/api/v1/housekeeping/readiness'),
    enabled: tab === 'readiness' || createOpen,
    staleTime: 15_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['housekeeping'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const action = useMutation({
    mutationFn: (input: { id: string; action: 'START' | 'COMPLETE' | 'VERIFY' }) =>
      apiRequest<HousekeepingTaskSummary>(
        `/api/v1/housekeeping/tasks/${input.id}/actions`,
        { method: 'POST', body: JSON.stringify({ action: input.action }) },
      ),
    onSuccess: (task) => {
      setFeedback(`Tugas kamar ${task.roomNumber} diperbarui.`);
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest<HousekeepingTaskSummary>('/api/v1/housekeeping/tasks', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          taskType,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      }),
    onSuccess: (task) => {
      setFeedback(`Tugas untuk kamar ${task.roomNumber} dibuat.`);
      setCreateOpen(false);
      setRoomId('');
      setNotes('');
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Housekeeping"
        title="Kebersihan & kesiapan kamar"
        description="Housekeeping berjalan independen dari status reservasi. Verifikasi tugas akan menandai kamar READY jika tidak ada tugas lain yang terbuka."
        actions={
          hasPermission('housekeeping.assign') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Tugas baru
            </Button>
          ) : null
        }
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total tugas"
          value={summary.data?.total ?? '—'}
          hint="Sesuai scope akun Anda"
          icon={<ClipboardList className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Terbuka"
          value={summary.data?.open ?? '—'}
          hint="Pending + in progress"
          icon={<Play className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Selesai dikerjakan"
          value={summary.data?.byStatus.COMPLETED ?? '—'}
          hint="Menunggu verifikasi"
          icon={<CheckCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Terverifikasi"
          value={summary.data?.byStatus.VERIFIED ?? '—'}
          icon={<Sparkles className="h-5 w-5" />}
          tone="success"
        />
      </div>

      {summary.data ? (
        <DistributionBar
          title="Distribusi status tugas"
          items={[
            { label: 'Pending', value: summary.data.byStatus.PENDING ?? 0, colorClass: 'bg-chart-2' },
            { label: 'In progress', value: summary.data.byStatus.IN_PROGRESS ?? 0, colorClass: 'bg-chart-4' },
            { label: 'Completed', value: summary.data.byStatus.COMPLETED ?? 0, colorClass: 'bg-chart-3' },
            { label: 'Verified', value: summary.data.byStatus.VERIFIED ?? 0, colorClass: 'bg-chart-5' },
          ]}
        />
      ) : null}

      <Tabs
        ariaLabel="Tampilan housekeeping"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'tasks', label: 'Tugas', icon: <ClipboardList className="h-3.5 w-3.5" /> },
          { value: 'readiness', label: 'Kesiapan kamar', icon: <Sparkles className="h-3.5 w-3.5" /> },
        ]}
      />

      {tab === 'tasks' ? (
        <Card>
          <div className="flex flex-col gap-2 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="sm:w-56"
              aria-label="Filter status housekeeping"
            >
              <option value="">Semua status</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="VERIFIED">Verified</option>
            </Select>
            <p className="text-xs text-ink-400">
              {tasks.data ? `${tasks.data.pagination.total} tugas` : 'Memuat…'}
            </p>
          </div>

          {tasks.isError ? (
            <div className="p-4">
              <ErrorState message="Tugas tidak dapat dimuat." onRetry={() => tasks.refetch()} />
            </div>
          ) : null}

          {tasks.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : tasks.data?.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="Tidak ada tugas"
                description="Tugas pembersihan otomatis dibuat setelah check-out, atau tambahkan tugas manual."
              />
            </div>
          ) : (
            <div className="divide-y divide-ink-50">
              {tasks.data?.items.map((task) => (
                <div key={task.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink-900">
                          Kamar {task.roomNumber}
                          {task.bedCode ? ` / ${task.bedCode}` : ''}
                        </p>
                        <StatusBadge status={task.status} />
                        <Badge tone="neutral">{humanize(task.taskType)}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-400">
                        {task.dormitoryName} · dibuat {formatDateTime(task.scheduledAt)}
                        {task.assignedToName ? ` · ditugaskan ke ${task.assignedToName}` : ''}
                      </p>
                      {task.notes ? (
                        <p className="mt-1 text-[11px] text-ink-500">{task.notes}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {task.checklist.map((item) => (
                          <Badge key={item.id} tone={item.isCompleted ? 'success' : 'neutral'}>
                            {item.isCompleted ? '✓' : '○'} {item.itemLabel}
                          </Badge>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-expanded={attachmentTaskId === task.id}
                          onClick={() =>
                            setAttachmentTaskId((current) =>
                              current === task.id ? null : task.id,
                            )
                          }
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Bukti
                        </Button>
                      </div>
                      {attachmentTaskId === task.id ? (
                        <div className="mt-2">
                          <AttachmentsPanel
                            entityType="HOUSEKEEPING_TASK"
                            entityId={task.id}
                            canUpload={
                              hasPermission('housekeeping.execute') ||
                              hasPermission('housekeeping.assign') ||
                              hasPermission('housekeeping.verify')
                            }
                            title="Bukti kebersihan"
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {task.status === 'PENDING' && hasPermission('housekeeping.execute') ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={action.isPending}
                            loading={
                              action.isPending &&
                              action.variables?.id === task.id &&
                              action.variables.action === 'START'
                            }
                            onClick={() => action.mutate({ id: task.id, action: 'START' })}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Mulai
                          </Button>
                          <Button
                            size="sm"
                            disabled={action.isPending}
                            loading={
                              action.isPending &&
                              action.variables?.id === task.id &&
                              action.variables.action === 'COMPLETE'
                            }
                            onClick={() => action.mutate({ id: task.id, action: 'COMPLETE' })}
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Selesai
                          </Button>
                        </>
                      ) : null}
                      {task.status === 'IN_PROGRESS' && hasPermission('housekeeping.execute') ? (
                        <Button
                          size="sm"
                          disabled={action.isPending}
                          loading={
                            action.isPending &&
                            action.variables?.id === task.id &&
                            action.variables.action === 'COMPLETE'
                          }
                          onClick={() => action.mutate({ id: task.id, action: 'COMPLETE' })}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Selesai
                        </Button>
                      ) : null}
                      {task.status === 'COMPLETED' && hasPermission('housekeeping.verify') ? (
                        <Button
                          size="sm"
                          disabled={action.isPending}
                          loading={
                            action.isPending &&
                            action.variables?.id === task.id &&
                            action.variables.action === 'VERIFY'
                          }
                          onClick={() => action.mutate({ id: task.id, action: 'VERIFY' })}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Verifikasi
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tasks.data ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={tasks.data.pagination.total}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
              fetching={tasks.isFetching}
              itemLabel="tugas"
            />
          ) : null}
        </Card>
      ) : (
        <Card>
          <div className="border-b border-ink-100 p-4">
            <p className="text-sm font-bold text-ink-950">Kesiapan kamar & tempat tidur</p>
            <p className="mt-1 text-[11px] text-ink-400">
              Kamar READY dapat dipakai check-in. Status INSPECTION_REQUIRED menunggu verifikasi
              housekeeping.
            </p>
          </div>
          {readiness.isError ? (
            <div className="p-4">
              <ErrorState message="Data kesiapan tidak dapat dimuat." onRetry={() => readiness.refetch()} />
            </div>
          ) : null}
          {readiness.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : readiness.data?.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<BedDouble className="h-5 w-5" />}
                title="Tidak ada kamar dalam scope"
                description="Periksa penugasan scope akun housekeeping Anda."
              />
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {readiness.data?.items.map((room) => (
                <div key={room.roomId} className="rounded-xl border border-ink-100 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink-900">Kamar {room.roomNumber}</p>
                      <p className="text-[11px] text-ink-400">
                        {room.dormitoryName} · {room.buildingName} lt. {room.floorNumber}
                      </p>
                    </div>
                    <Badge
                      tone={
                        room.housekeepingStatus === 'READY'
                          ? 'success'
                          : room.housekeepingStatus === 'DIRTY'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {humanize(room.housekeepingStatus)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-500">
                    Status operasional: {humanize(room.roomStatus)} · {room.openTasks} tugas terbuka
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {room.beds.map((bed) => (
                      <span
                        key={bed.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[10px] text-ink-600"
                      >
                        <BedDouble className="h-3 w-3" />
                        {bed.bedCode} · {humanize(bed.housekeepingStatus)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tugas housekeeping baru"
        description="Checklist standar (linen, kamar mandi, fasilitas) otomatis ditambahkan."
      >
        <div className="space-y-4">
          <Field label="Kamar">
            <Select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              <option value="">Pilih kamar</option>
              {readiness.data?.items.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  {room.dormitoryName} · {room.roomNumber} ({humanize(room.housekeepingStatus)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis tugas">
            <Select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
              <option value="CLEANING">Cleaning</option>
              <option value="INSPECTION">Inspection</option>
              <option value="TURNDOWN">Turndown</option>
            </Select>
          </Field>
          <Field label="Catatan (opsional)">
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Instruksi khusus untuk petugas"
            />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button
              loading={create.isPending}
              disabled={!roomId}
              onClick={() => create.mutate()}
            >
              Buat tugas
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
