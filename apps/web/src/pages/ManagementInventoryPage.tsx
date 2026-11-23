import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BedDouble,
  Building2,
  Layers,
  Pencil,
  Plus,
  Power,
} from 'lucide-react';
import type { BedSummary, DormitoryDetail, DormitorySummary, RoomSummary } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
} from '../components/ui';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import type { Paged } from '../lib/types';

type ModalState =
  | { type: 'dormitory' }
  | { type: 'building'; dormitoryId: string }
  | { type: 'floor'; buildingId: string }
  | { type: 'room'; floorId: string }
  | { type: 'bed'; roomId: string }
  | { type: 'roomEdit'; room: RoomSummary }
  | { type: 'bedEdit'; bed: BedSummary; roomId: string }
  | null;

const ROOM_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'BLOCKED'];
const BED_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'BLOCKED'];
const HOUSEKEEPING_STATUSES = ['READY', 'DIRTY', 'CLEANING', 'INSPECTION_REQUIRED'];
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Pria',
  FEMALE: 'Wanita',
  MIXED: 'Campur',
  UNSPECIFIED: 'Tidak ditentukan',
};

export function ManagementInventoryPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const dormitories = useQuery({
    queryKey: ['dormitories', 'inventory', q],
    queryFn: () =>
      apiRequest<Paged<DormitorySummary>>(
        `/api/v1/dormitories${queryString({ q, pageSize: 50 })}`,
      ),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!selectedId && dormitories.data?.items.length) {
      setSelectedId(dormitories.data.items[0]!.id);
    }
  }, [dormitories.data, selectedId]);

  const detail = useQuery({
    queryKey: ['dormitory', selectedId],
    queryFn: () => apiRequest<DormitoryDetail>(`/api/v1/dormitories/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dormitories'] });
    void queryClient.invalidateQueries({ queryKey: ['dormitory', selectedId] });
  };

  const mutate = (path: string, method: 'POST' | 'PATCH', body: unknown) =>
    apiRequest(path, { method, body: JSON.stringify(body) });

  const save = useMutation({
    mutationFn: async () => {
      if (!modal) return null;
      switch (modal.type) {
        case 'dormitory':
          return mutate('/api/v1/dormitories', 'POST', {
            code: form.code,
            name: form.name,
            description: form.description || undefined,
            address: form.address || undefined,
            stationCode: form.stationCode || undefined,
            contactName: form.contactName || undefined,
            contactPhone: form.contactPhone || undefined,
          });
        case 'building':
          return mutate(`/api/v1/dormitories/${modal.dormitoryId}/buildings`, 'POST', {
            code: form.code,
            name: form.name,
          });
        case 'floor':
          return mutate(`/api/v1/buildings/${modal.buildingId}/floors`, 'POST', {
            floorNumber: Number(form.floorNumber),
            name: form.name,
          });
        case 'room':
          return mutate(`/api/v1/floors/${modal.floorId}/rooms`, 'POST', {
            roomNumber: form.roomNumber,
            name: form.name || undefined,
            genderPolicy: form.genderPolicy || 'UNSPECIFIED',
          });
        case 'bed':
          return mutate(`/api/v1/rooms/${modal.roomId}/beds`, 'POST', {
            bedCode: form.bedCode,
            label: form.label || undefined,
          });
        case 'roomEdit':
          return mutate(`/api/v1/rooms/${modal.room.id}`, 'PATCH', {
            operationalStatus: form.operationalStatus || undefined,
            housekeepingStatus: form.housekeepingStatus || undefined,
            statusReason: form.statusReason || undefined,
          });
        case 'bedEdit':
          return mutate(`/api/v1/beds/${modal.bed.id}`, 'PATCH', {
            status: form.status || undefined,
            housekeepingStatus: form.housekeepingStatus || undefined,
            statusReason: form.statusReason || undefined,
          });
        default:
          return null;
      }
    },
    onSuccess: () => {
      setFeedback('Perubahan inventory tersimpan.');
      setModal(null);
      setError(null);
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) =>
      mutate(`/api/v1/dormitories/${id}/deactivate`, 'POST', {}),
    onSuccess: () => {
      setFeedback('Dormitory dinonaktifkan.');
      refresh();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const openModal = (next: Exclude<ModalState, null>, initial: Record<string, string> = {}) => {
    setModal(next);
    setForm(initial);
    setError(null);
    setFeedback(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Dormitory & tempat tidur"
        description="Kelola struktur dormitory sampai tingkat tempat tidur. Perubahan status operasional tetap tunduk pada perlindungan alokasi aktif."
        actions={
          hasPermission('dormitories.create') ? (
            <Button onClick={() => openModal({ type: 'dormitory' }, { code: '', name: '' })}>
              <Plus className="h-4 w-4" />
              Dormitory baru
            </Button>
          ) : null
        }
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error && !modal ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit min-w-0">
          <form
            className="border-b border-ink-100 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              setQ(search.trim());
            }}
          >
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari dormitory"
              aria-label="Cari dormitory"
            />
          </form>
          <div className="max-h-[560px] overflow-y-auto p-2 scrollbar-slim">
            {dormitories.isError ? (
              <ErrorState
                message="Daftar dormitory tidak dapat dimuat."
                onRetry={() => dormitories.refetch()}
              />
            ) : dormitories.isLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : dormitories.data?.items.length ? (
              dormitories.data.items.map((dormitory) => (
                <button
                  key={dormitory.id}
                  type="button"
                  onClick={() => setSelectedId(dormitory.id)}
                  className={
                    selectedId === dormitory.id
                      ? 'flex w-full items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-left'
                      : 'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-ink-50'
                  }
                >
                  <Building2 className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-xs font-semibold text-ink-900"
                      title={dormitory.name}
                    >
                      {dormitory.name}
                    </span>
                    <span className="block truncate text-[10px] text-ink-400">
                      {dormitory.code} · {dormitory.bedCount} bed
                    </span>
                  </span>
                  <Badge tone={dormitory.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {dormitory.status}
                  </Badge>
                </button>
              ))
            ) : (
              <p className="p-3 text-xs text-ink-400">Tidak ada dormitory.</p>
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          {detail.isError ? (
            <ErrorState
              message="Detail dormitory tidak dapat dimuat."
              onRetry={() => detail.refetch()}
            />
          ) : null}

          {detail.isLoading || !detail.data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Card className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-ink-950">{detail.data.name}</h2>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {detail.data.code} · {detail.data.roomCount} kamar · {detail.data.bedCount}{' '}
                      bed
                    </p>
                    {detail.data.address ? (
                      <p className="mt-1 text-[11px] text-ink-500">{detail.data.address}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={detail.data.status} />
                    {hasPermission('buildings.manage') ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          openModal({ type: 'building', dormitoryId: detail.data!.id }, { code: '', name: '' })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Gedung
                      </Button>
                    ) : null}
                    {hasPermission('dormitories.deactivate') && detail.data.status === 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={deactivate.isPending}
                        onClick={() => setConfirmDeactivate(true)}
                      >
                        <Power className="h-3.5 w-3.5" />
                        Nonaktifkan
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>

              {detail.data.buildings.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-5 w-5" />}
                  title="Belum ada gedung"
                  description="Tambahkan gedung untuk mulai membuat lantai, kamar, dan tempat tidur."
                />
              ) : null}

              {detail.data.buildings.map((building) => (
                <Card key={building.id} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-brand-600" />
                      <p className="text-sm font-bold text-ink-950">
                        {building.name} ({building.code})
                      </p>
                      <StatusBadge status={building.status} />
                    </div>
                    {hasPermission('floors.manage') ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          openModal(
                            { type: 'floor', buildingId: building.id },
                            { floorNumber: '1', name: '' },
                          )
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Lantai
                      </Button>
                    ) : null}
                  </div>

                  {building.floors.map((floor) => (
                    <div key={floor.id} className="border-b border-ink-50 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-ink-400" />
                          <p className="text-xs font-semibold text-ink-700">
                            {floor.name && floor.name !== `Lantai ${floor.floorNumber}`
                              ? `Lantai ${floor.floorNumber} · ${floor.name}`
                              : `Lantai ${floor.floorNumber}`}
                          </p>
                        </div>
                        {hasPermission('rooms.create') ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              openModal(
                                { type: 'room', floorId: floor.id },
                                { roomNumber: '', name: '', genderPolicy: 'UNSPECIFIED' },
                              )
                            }
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Kamar
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                        {floor.rooms.map((room) => (
                          <div key={room.id} className="min-w-0 rounded-xl border border-ink-100 p-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-bold text-ink-900">
                                Kamar {room.roomNumber}
                              </p>
                              <StatusBadge status={room.operationalStatus} />
                              <StatusBadge status={room.housekeepingStatus} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-ink-400">
                              {room.roomTypeName} ·{' '}
                              {GENDER_LABELS[room.genderPolicy] ?? room.genderPolicy}
                            </p>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {room.beds.map((bed) =>
                                hasPermission('beds.manage') ? (
                                  <button
                                    key={bed.id}
                                    type="button"
                                    onClick={() =>
                                      openModal(
                                        { type: 'bedEdit', bed, roomId: room.id },
                                        {
                                          status: bed.status,
                                          housekeepingStatus: bed.housekeepingStatus,
                                          statusReason: '',
                                        },
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600 hover:bg-ink-200"
                                    title="Ubah status tempat tidur"
                                  >
                                    <BedDouble className="h-3 w-3" />
                                    {bed.bedCode}
                                  </button>
                                ) : (
                                  <span
                                    key={bed.id}
                                    className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600"
                                  >
                                    <BedDouble className="h-3 w-3" />
                                    {bed.bedCode}
                                  </span>
                                ),
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {hasPermission('rooms.update') ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    openModal(
                                      { type: 'roomEdit', room },
                                      {
                                        operationalStatus: room.operationalStatus,
                                        housekeepingStatus: room.housekeepingStatus,
                                        statusReason: '',
                                      },
                                    )
                                  }
                                >
                                  <Pencil className="h-3 w-3" />
                                  Kamar
                                </Button>
                              ) : null}
                              {hasPermission('beds.manage') ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    openModal(
                                      { type: 'bed', roomId: room.id },
                                      { bedCode: '', label: '' },
                                    )
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                  Bed
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                        {floor.rooms.length === 0 ? (
                          <p className="text-xs text-ink-400">Belum ada kamar.</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {building.floors.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-ink-400">Belum ada lantai.</p>
                  ) : null}
                </Card>
              ))}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => {
          if (!detail.data) return;
          deactivate.mutate(detail.data.id, {
            onSettled: () => setConfirmDeactivate(false),
          });
        }}
        title="Nonaktifkan dormitory"
        description={`${detail.data?.name ?? 'Dormitory'} akan dinonaktifkan. Struktur di dalamnya tetap tersimpan, namun dormitory tidak lagi menerima alokasi baru.`}
        confirmLabel="Nonaktifkan"
        tone="danger"
        loading={deactivate.isPending}
      />

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modalTitle(modal)}
        description="Perubahan tercatat pada audit log dan tidak dapat menimpa alokasi aktif."
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {modal?.type === 'dormitory' ? (
            <>
              <Field label="Kode">
                <Input
                  value={form.code ?? ''}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  placeholder="DORM-06"
                />
              </Field>
              <Field label="Nama">
                <Input
                  value={form.name ?? ''}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Kode stasiun">
                <Input
                  value={form.stationCode ?? ''}
                  onChange={(event) => setForm({ ...form, stationCode: event.target.value })}
                />
              </Field>
              <Field label="Kontak">
                <Input
                  value={form.contactName ?? ''}
                  onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                />
              </Field>
              <Field label="Alamat">
                <Input
                  value={form.address ?? ''}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </Field>
              <Field label="Deskripsi">
                <Input
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
            </>
          ) : null}

          {modal?.type === 'building' ? (
            <>
              <Field label="Kode gedung">
                <Input
                  value={form.code ?? ''}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Nama gedung">
                <Input
                  value={form.name ?? ''}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
            </>
          ) : null}

          {modal?.type === 'floor' ? (
            <>
              <Field label="Nomor lantai">
                <Input
                  type="number"
                  value={form.floorNumber ?? ''}
                  onChange={(event) => setForm({ ...form, floorNumber: event.target.value })}
                />
              </Field>
              <Field label="Nama lantai">
                <Input
                  value={form.name ?? ''}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
            </>
          ) : null}

          {modal?.type === 'room' ? (
            <>
              <Field label="Nomor kamar">
                <Input
                  value={form.roomNumber ?? ''}
                  onChange={(event) => setForm({ ...form, roomNumber: event.target.value })}
                />
              </Field>
              <Field label="Nama kamar (opsional)">
                <Input
                  value={form.name ?? ''}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Kebijakan gender">
                <Select
                  value={form.genderPolicy ?? 'UNSPECIFIED'}
                  onChange={(event) => setForm({ ...form, genderPolicy: event.target.value })}
                >
                  <option value="UNSPECIFIED">Tidak ditentukan</option>
                  <option value="MALE">Pria</option>
                  <option value="FEMALE">Wanita</option>
                </Select>
              </Field>
            </>
          ) : null}

          {modal?.type === 'bed' ? (
            <>
              <Field label="Kode bed">
                <Input
                  value={form.bedCode ?? ''}
                  onChange={(event) => setForm({ ...form, bedCode: event.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Label (opsional)">
                <Input
                  value={form.label ?? ''}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                />
              </Field>
            </>
          ) : null}

          {modal?.type === 'roomEdit' ? (
            <>
              <Field label="Status operasional">
                <Select
                  value={form.operationalStatus ?? ''}
                  onChange={(event) => setForm({ ...form, operationalStatus: event.target.value })}
                >
                  {ROOM_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status housekeeping">
                <Select
                  value={form.housekeepingStatus ?? ''}
                  onChange={(event) => setForm({ ...form, housekeepingStatus: event.target.value })}
                >
                  {HOUSEKEEPING_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catatan status">
                <Input
                  value={form.statusReason ?? ''}
                  onChange={(event) => setForm({ ...form, statusReason: event.target.value })}
                />
              </Field>
            </>
          ) : null}

          {modal?.type === 'bedEdit' ? (
            <>
              <Field label="Status bed">
                <Select
                  value={form.status ?? ''}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  {BED_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status housekeeping">
                <Select
                  value={form.housekeepingStatus ?? ''}
                  onChange={(event) => setForm({ ...form, housekeepingStatus: event.target.value })}
                >
                  {HOUSEKEEPING_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catatan status">
                <Input
                  value={form.statusReason ?? ''}
                  onChange={(event) => setForm({ ...form, statusReason: event.target.value })}
                />
              </Field>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModal(null)}>
            Batal
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function modalTitle(modal: ModalState): string {
  switch (modal?.type) {
    case 'dormitory':
      return 'Dormitory baru';
    case 'building':
      return 'Gedung baru';
    case 'floor':
      return 'Lantai baru';
    case 'room':
      return 'Kamar baru';
    case 'bed':
      return 'Tempat tidur baru';
    case 'roomEdit':
      return `Ubah status kamar ${modal.room.roomNumber}`;
    case 'bedEdit':
      return `Ubah status tempat tidur ${modal.bed.bedCode}`;
    default:
      return 'Inventory';
  }
}
