import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock3,
  Paperclip,
  Plus,
  Wrench,
} from 'lucide-react';
import type {
  DormitoryDetail,
  DormitorySummary,
  MaintenanceSummary,
  MaintenanceTicketSummary,
} from '@whoosh/shared';
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
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime, humanize } from '../lib/format';
import type { Paged } from '../lib/types';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'FURNITURE', 'AC', 'CLEANLINESS', 'OTHER'];
const CATEGORY_LABELS: Record<string, string> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Kelistrikan',
  FURNITURE: 'Furnitur',
  AC: 'AC',
  CLEANLINESS: 'Kebersihan',
  OTHER: 'Lainnya',
};

const NEXT_ACTIONS: Record<string, Array<{ status: string; label: string }>> = {
  OPEN: [
    { status: 'IN_REVIEW', label: 'Tinjau' },
    { status: 'IN_PROGRESS', label: 'Kerjakan' },
  ],
  IN_REVIEW: [{ status: 'IN_PROGRESS', label: 'Kerjakan' }],
  IN_PROGRESS: [{ status: 'RESOLVED', label: 'Selesaikan' }],
  RESOLVED: [{ status: 'CLOSED', label: 'Tutup' }],
};

export function MaintenancePage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [dormitoryId, setDormitoryId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [category, setCategory] = useState('PLUMBING');
  const [ticketPriority, setTicketPriority] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [attachmentTicketId, setAttachmentTicketId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState(false);
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [resolveTarget, setResolveTarget] = useState<{
    ticket: MaintenanceTicketSummary;
    status: 'RESOLVED' | 'CLOSED';
  } | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ['maintenance', 'tickets', { status, priority, page, pageSize }],
    queryFn: () =>
      apiRequest<Paged<MaintenanceTicketSummary>>(
        `/api/v1/maintenance/tickets${queryString({ status, priority, page, pageSize })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['maintenance', 'summary'],
    queryFn: () => apiRequest<MaintenanceSummary>('/api/v1/maintenance/summary'),
    staleTime: 30_000,
  });

  const dormitories = useQuery({
    queryKey: ['dormitories', 'maintenance'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    enabled: createOpen,
    staleTime: 60_000,
  });

  const detail = useQuery({
    queryKey: ['dormitory', dormitoryId, 'maintenance'],
    queryFn: () => apiRequest<DormitoryDetail>(`/api/v1/dormitories/${dormitoryId}`),
    enabled: createOpen && Boolean(dormitoryId),
  });

  const rooms =
    detail.data?.buildings.flatMap((building) =>
      building.floors.flatMap((floor) => floor.rooms),
    ) ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const updateStatus = useMutation({
    mutationFn: (input: {
      id: string;
      status: string;
      resolutionNotes?: string;
    }) =>
      apiRequest<MaintenanceTicketSummary>(`/api/v1/maintenance/tickets/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: input.status,
          ...(input.resolutionNotes ? { resolutionNotes: input.resolutionNotes } : {}),
        }),
      }),
    onSuccess: (ticket) => {
      setFeedback(`Tiket ${ticket.ticketCode} diperbarui.`);
      setResolveTarget(null);
      setResolutionNotes('');
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest<MaintenanceTicketSummary>('/api/v1/maintenance/tickets', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          category,
          priority: ticketPriority,
          description,
          blocksInventory: blocks,
          ...(blocks && blockStart && blockEnd
            ? {
                blockStartAt: new Date(`${blockStart}T00:00:00+07:00`).toISOString(),
                blockEndAt: new Date(`${blockEnd}T00:00:00+07:00`).toISOString(),
              }
            : {}),
        }),
      }),
    onSuccess: (ticket) => {
      setFeedback(`Tiket ${ticket.ticketCode} dibuat.`);
      setCreateOpen(false);
      setRoomId('');
      setDescription('');
      setBlocks(false);
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const handleAction = (ticket: MaintenanceTicketSummary, nextStatus: string) => {
    if (nextStatus === 'RESOLVED' || nextStatus === 'CLOSED') {
      setResolveTarget({ ticket, status: nextStatus });
      setResolutionNotes('');
      setError(null);
      return;
    }
    updateStatus.mutate({ id: ticket.id, status: nextStatus });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Maintenance"
        title="Tiket pemeliharaan"
        description="Kelola kerusakan kamar dan tempat tidur. Tiket yang memblokir inventory akan mencegah alokasi dan check-in sampai diselesaikan."
        actions={
          hasPermission('maintenance.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Tiket baru
            </Button>
          ) : null
        }
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error && !createOpen && !resolveTarget ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total tiket"
          value={summary.data?.total ?? '—'}
          hint="Sesuai scope akun Anda"
          icon={<Wrench className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Terbuka"
          value={summary.data?.open ?? '—'}
          hint="Open + review + dikerjakan"
          icon={<Clock3 className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Prioritas kritis"
          value={summary.data?.byPriority.CRITICAL ?? '—'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Selesai / ditutup"
          value={
            summary.data
              ? (summary.data.byStatus.RESOLVED ?? 0) + (summary.data.byStatus.CLOSED ?? 0)
              : '—'
          }
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
      </div>

      {summary.data ? (
        <DistributionBar
          title="Distribusi prioritas tiket"
          items={[
            { label: 'Low', value: summary.data.byPriority.LOW ?? 0, colorClass: 'bg-chart-5' },
            { label: 'Medium', value: summary.data.byPriority.MEDIUM ?? 0, colorClass: 'bg-chart-4' },
            { label: 'High', value: summary.data.byPriority.HIGH ?? 0, colorClass: 'bg-chart-2' },
            { label: 'Critical', value: summary.data.byPriority.CRITICAL ?? 0, colorClass: 'bg-chart-1' },
          ]}
        />
      ) : null}

      <Card>
        <div className="flex flex-col gap-2 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="sm:w-44"
              aria-label="Status tiket"
            >
              <option value="">Semua status</option>
              <option value="OPEN">Open</option>
              <option value="IN_REVIEW">In review</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <Select
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setPage(1);
              }}
              className="sm:w-44"
              aria-label="Prioritas"
            >
              <option value="">Semua prioritas</option>
              {PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-ink-400">
            {tickets.data ? `${tickets.data.pagination.total} tiket` : 'Memuat…'}
          </p>
        </div>

        {tickets.isError ? (
          <div className="p-4">
            <ErrorState message="Tiket tidak dapat dimuat." onRetry={() => tickets.refetch()} />
          </div>
        ) : null}

        {tickets.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : tickets.data?.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Wrench className="h-5 w-5" />}
              title="Tidak ada tiket"
              description="Buat tiket baru bila ditemukan kerusakan pada kamar atau tempat tidur."
            />
          </div>
        ) : (
          <div className="divide-y divide-ink-50">
            {tickets.data?.items.map((ticket) => (
              <div key={ticket.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs font-bold text-ink-900">{ticket.ticketCode}</p>
                      <StatusBadge status={ticket.status} />
                      <Badge
                        tone={
                          ticket.priority === 'CRITICAL'
                            ? 'danger'
                            : ticket.priority === 'HIGH'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {humanize(ticket.priority)}
                      </Badge>
                      <Badge tone="info">
                        {CATEGORY_LABELS[ticket.category] ?? humanize(ticket.category)}
                      </Badge>
                      {ticket.blocksInventory ? (
                        <Badge tone="danger">
                          <Ban className="h-3 w-3" /> Blokir inventory
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-ink-900">
                      {ticket.dormitoryName ?? '—'} · Kamar {ticket.roomNumber ?? '-'}
                      {ticket.bedCode ? ` / ${ticket.bedCode}` : ''}
                    </p>
                    <p className="mt-1 max-w-2xl text-[11px] leading-5 text-ink-500">
                      {ticket.description}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-400">
                      Dilaporkan {ticket.reportedByName} · {formatDateTime(ticket.reportedAt)}
                      {ticket.assignedToName ? ` · Ditugaskan: ${ticket.assignedToName}` : ''}
                    </p>
                    {ticket.resolutionNotes ? (
                      <p className="mt-1 text-[11px] text-emerald-700">
                        Resolusi: {ticket.resolutionNotes}
                      </p>
                    ) : null}
                    <div className="mt-2 max-w-2xl">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-expanded={attachmentTicketId === ticket.id}
                        onClick={() =>
                          setAttachmentTicketId((current) =>
                            current === ticket.id ? null : ticket.id,
                          )
                        }
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Lampiran
                      </Button>
                      {attachmentTicketId === ticket.id ? (
                        <div className="mt-2">
                          <AttachmentsPanel
                            entityType="MAINTENANCE_TICKET"
                            entityId={ticket.id}
                            canUpload={
                              hasPermission('maintenance.create') ||
                              hasPermission('maintenance.update')
                            }
                            title="Bukti maintenance"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {hasPermission('maintenance.update') ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(NEXT_ACTIONS[ticket.status] ?? []).map((next) => (
                        <Button
                          key={next.status}
                          size="sm"
                          variant={next.status === 'CLOSED' ? 'secondary' : 'subtle'}
                          loading={
                            updateStatus.isPending &&
                            updateStatus.variables?.id === ticket.id &&
                            updateStatus.variables.status === next.status
                          }
                          onClick={() => handleAction(ticket, next.status)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          {next.label}
                        </Button>
                      ))}
                      {ticket.status === 'CLOSED' ? (
                        <Badge tone="neutral">Selesai</Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {tickets.data ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={tickets.data.pagination.total}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
            fetching={tickets.isFetching}
            itemLabel="tiket"
          />
        ) : null}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tiket maintenance baru"
        description="Pilih kamar, kategori, dan prioritas. Blokir inventory hanya bila kamar/bed tidak layak dipakai."
      >
        <div className="space-y-4">
          <Field label="Dormitory">
            <Select
              value={dormitoryId}
              onChange={(event) => {
                setDormitoryId(event.target.value);
                setRoomId('');
              }}
            >
              <option value="">Pilih dormitory</option>
              {dormitories.data?.items.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {dormitory.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kamar">
            <Select value={roomId} onChange={(event) => setRoomId(event.target.value)} disabled={!dormitoryId}>
              <option value="">Pilih kamar</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomNumber} · {room.roomTypeName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategori">
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {CATEGORY_LABELS[item] ?? humanize(item)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prioritas">
              <Select
                value={ticketPriority}
                onChange={(event) => setTicketPriority(event.target.value)}
              >
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Deskripsi masalah" hint="Minimal 5 karakter.">
            <Textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Jelaskan kerusakan dan lokasi"
            />
          </Field>
          {hasPermission('maintenance.block_inventory') ? (
            <div className="rounded-xl border border-ink-100 p-3.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-800">
                <input
                  type="checkbox"
                  checked={blocks}
                  onChange={(event) => setBlocks(event.target.checked)}
                />
                Blokir inventory selama perbaikan
              </label>
              {blocks ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Field label="Mulai blokir">
                    <Input
                      type="date"
                      value={blockStart}
                      onChange={(event) => setBlockStart(event.target.value)}
                    />
                  </Field>
                  <Field label="Akhir blokir">
                    <Input
                      type="date"
                      value={blockEnd}
                      onChange={(event) => setBlockEnd(event.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button
              loading={create.isPending}
              disabled={!roomId || description.trim().length < 5}
              onClick={() => create.mutate()}
            >
              Buat tiket
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        title={
          resolveTarget?.status === 'CLOSED' ? 'Tutup tiket maintenance' : 'Selesaikan tiket'
        }
        description={
          resolveTarget
            ? `${resolveTarget.ticket.ticketCode} · blokir inventory akan dipotong pada waktu resolusi`
            : undefined
        }
      >
        <div className="space-y-4">
          <Field label="Catatan resolusi" hint="Opsional, maksimal 1000 karakter.">
            <Textarea
              rows={4}
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              placeholder="Tindakan yang dilakukan"
            />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolveTarget(null)}>
              Batal
            </Button>
            <Button
              loading={updateStatus.isPending}
              onClick={() =>
                resolveTarget &&
                updateStatus.mutate({
                  id: resolveTarget.ticket.id,
                  status: resolveTarget.status,
                  resolutionNotes: resolutionNotes.trim() || undefined,
                })
              }
            >
              {resolveTarget?.status === 'CLOSED' ? 'Tutup tiket' : 'Selesaikan'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
