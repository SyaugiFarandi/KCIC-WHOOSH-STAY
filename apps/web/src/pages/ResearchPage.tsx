import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  GitCompareArrows,
  MapPin,
  Search,
  Telescope,
  XCircle,
} from 'lucide-react';
import {
  RESEARCH_CLASSIFICATIONS,
  RESEARCH_CLASSIFICATION_LABELS,
  RESEARCH_PROPERTY_TYPE_LABELS,
  RESEARCH_SOURCE_TYPE_LABELS,
  RESEARCH_VERIFICATION_LABELS,
  RESEARCH_VERIFICATION_STATUSES,
} from '@whoosh/shared';
import type {
  ResearchClassification,
  ResearchEventItem,
  ResearchItem,
  ResearchPropertyType,
  ResearchSummary,
  ResearchVerificationStatus,
} from '@whoosh/shared';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DistributionBar,
  Field,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import { useListParams } from '../hooks/useListParams';
import { useUrlSyncedSearch } from '../hooks/useUrlSyncedSearch';
import { useAuth } from '../auth/AuthProvider';
import { apiRequest, queryString } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import type { Paged } from '../lib/types';

type ResearchDetail = ResearchItem & { events: ResearchEventItem[] };

const classificationTone: Record<ResearchClassification, 'success' | 'info' | 'warning' | 'neutral'> = {
  VERIFIED_OFFICIAL_KCIC: 'success',
  VERIFIED_PUBLIC: 'info',
  RESEARCH_CANDIDATE: 'warning',
  UNVERIFIED: 'neutral',
};

const verificationTone: Record<ResearchVerificationStatus, 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

function ClassificationBadge({ value }: { value: ResearchClassification }) {
  return <Badge tone={classificationTone[value]}>{RESEARCH_CLASSIFICATION_LABELS[value]}</Badge>;
}

function VerificationBadge({ value }: { value: ResearchVerificationStatus }) {
  return <Badge tone={verificationTone[value]}>{RESEARCH_VERIFICATION_LABELS[value]}</Badge>;
}

function propertyTypeLabel(value: string | null): string {
  if (!value) return '—';
  return RESEARCH_PROPERTY_TYPE_LABELS[value as ResearchPropertyType] ?? value;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="min-w-0 text-xs text-ink-800">{children}</dd>
    </div>
  );
}

function SourceList({ item }: { item: ResearchItem }) {
  return (
    <div className="space-y-3">
      {item.sources.map((source) => (
        <div key={source.id} className="rounded-lg border border-ink-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={source.sourceType === 'KCIC_OFFICIAL' ? 'success' : 'neutral'}>
              {RESEARCH_SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}
            </Badge>
            <span className="text-[11px] text-ink-400">
              Dicek {formatDate(source.checkedAt)}
            </span>
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-start gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <span className="break-all">{source.title ?? source.url}</span>
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
          </a>
          {source.notes ? <p className="mt-1 text-[11px] text-ink-500">{source.notes}</p> : null}
          {source.photoUrl ? (
            <figure className="mt-2">
              <img
                src={source.photoUrl}
                alt={source.title ? `Foto ${source.title}` : 'Foto properti dari sumber riset'}
                className="max-h-48 rounded-md border border-ink-100 object-cover"
                loading="lazy"
              />
              <figcaption className="mt-1 text-[11px] text-ink-400">
                Hak penggunaan: {source.photoRights ?? 'belum diketahui'}
                {source.photoTakenAt ? ` · Diambil ${formatDate(source.photoTakenAt)}` : ''}
              </figcaption>
            </figure>
          ) : null}
        </div>
      ))}
      {item.sources.length === 0 ? (
        <p className="text-xs text-ink-400">Belum ada referensi sumber tercatat.</p>
      ) : null}
      {item.sources.every((source) => !source.photoUrl) ? (
        <p className="text-[11px] text-ink-400">
          Belum ada foto dengan izin penggunaan yang terverifikasi untuk properti ini. Foto tidak
          ditampilkan sampai sumber dan hak penggunaannya jelas.
        </p>
      ) : null}
    </div>
  );
}

function ReviewPanel({
  item,
  onChanged,
}: {
  item: ResearchDetail;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [classification, setClassification] = useState<ResearchClassification>(item.classification);
  const [classificationNote, setClassificationNote] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['research'] });
    onChanged();
  };

  const approve = useMutation({
    mutationFn: () =>
      apiRequest<ResearchItem>(`/api/v1/research/${item.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || undefined }),
      }),
    onSuccess: () => {
      setApproveOpen(false);
      setNote('');
      invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      apiRequest<ResearchItem>(`/api/v1/research/${item.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note: rejectNote.trim() }),
      }),
    onSuccess: () => {
      setRejectOpen(false);
      setRejectNote('');
      invalidate();
    },
  });

  const promote = useMutation({
    mutationFn: () =>
      apiRequest<{ research: ResearchItem; dormitory: { id: string; code: string } }>(
        `/api/v1/research/${item.id}/promote`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setPromoteOpen(false);
      invalidate();
    },
  });

  const changeClassification = useMutation({
    mutationFn: () =>
      apiRequest<ResearchItem>(`/api/v1/research/${item.id}/classification`, {
        method: 'PATCH',
        body: JSON.stringify({ classification, note: classificationNote.trim() }),
      }),
    onSuccess: () => {
      setClassificationNote('');
      invalidate();
    },
  });

  const canPromote =
    item.classification === 'VERIFIED_OFFICIAL_KCIC' &&
    item.verificationStatus === 'APPROVED' &&
    !item.promotedDormitoryId;
  const actionError =
    approve.error?.message ?? reject.error?.message ?? promote.error?.message ?? null;

  return (
    <div className="space-y-4 rounded-lg border border-ink-100 bg-sand-50 p-4">
      <h3 className="text-sm font-bold text-ink-950">Tinjauan administrator</h3>
      {item.promotedDormitoryId ? (
        <Notice tone="success">
          Kandidat ini sudah dipromosikan menjadi dormitory operasional. Keputusan tinjauan tidak
          dapat mengubah data operasional yang sudah dibuat.
        </Notice>
      ) : null}
      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setApproveOpen(true)}
          disabled={item.verificationStatus === 'APPROVED' || Boolean(item.promotedDormitoryId)}
          loading={approve.isPending}
        >
          <CheckCircle2 className="h-4 w-4" /> Setujui
        </Button>
        <Button
          variant="danger"
          onClick={() => setRejectOpen(true)}
          disabled={item.verificationStatus === 'REJECTED' || Boolean(item.promotedDormitoryId)}
        >
          <XCircle className="h-4 w-4" /> Tolak
        </Button>
        <Button
          variant="secondary"
          onClick={() => setPromoteOpen(true)}
          disabled={!canPromote}
          loading={promote.isPending}
        >
          <ArrowUpRight className="h-4 w-4" /> Promosikan ke master operasional
        </Button>
      </div>
      {!canPromote && !item.promotedDormitoryId ? (
        <p className="text-[11px] text-ink-500">
          Promosi hanya tersedia untuk klasifikasi{' '}
          <strong>Akomodasi resmi KCIC terverifikasi</strong> yang sudah <strong>disetujui</strong>.
          Penginapan publik tidak boleh dipromosikan menjadi fasilitas operasional KCIC.
        </p>
      ) : null}

      <div className="border-t border-ink-100 pt-3">
        <Field label="Ubah klasifikasi (wajib menyertakan bukti/alasan)">
          <Select
            value={classification}
            onChange={(event) => setClassification(event.target.value as ResearchClassification)}
            disabled={Boolean(item.promotedDormitoryId)}
          >
            {RESEARCH_CLASSIFICATIONS.map((value) => (
              <option key={value} value={value}>
                {RESEARCH_CLASSIFICATION_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Textarea
          className="mt-2"
          rows={2}
          value={classificationNote}
          onChange={(event) => setClassificationNote(event.target.value)}
          placeholder="Referensi bukti, mis. URL siaran pers KCIC atau dokumen kontrak"
          aria-label="Alasan perubahan klasifikasi"
          disabled={Boolean(item.promotedDormitoryId)}
        />
        <Button
          className="mt-2"
          variant="secondary"
          onClick={() => changeClassification.mutate()}
          disabled={
            Boolean(item.promotedDormitoryId) ||
            classification === item.classification ||
            classificationNote.trim().length === 0
          }
          loading={changeClassification.isPending}
        >
          Simpan klasifikasi
        </Button>
        {changeClassification.error ? (
          <p className="mt-1 text-[11px] text-red-600">{changeClassification.error.message}</p>
        ) : null}
      </div>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => approve.mutate()}
        title="Setujui kandidat riset?"
        description={`Menyetujui "${item.name}" berarti administrator telah meninjau sumber dan bukti yang tersedia. Persetujuan tidak otomatis menjadikannya data operasional KCIC.`}
        confirmLabel="Setujui"
        tone="primary"
        loading={approve.isPending}
      />

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Tolak kandidat riset"
        description="Alasan penolakan wajib diisi dan tercatat pada riwayat riset."
      >
        <Textarea
          rows={3}
          value={rejectNote}
          onChange={(event) => setRejectNote(event.target.value)}
          placeholder="Alasan penolakan, mis. sumber tidak dapat diverifikasi"
          aria-label="Alasan penolakan"
        />
        {reject.error ? <p className="mt-1 text-[11px] text-red-600">{reject.error.message}</p> : null}
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setRejectOpen(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={() => reject.mutate()}
            disabled={rejectNote.trim().length === 0}
            loading={reject.isPending}
          >
            Tolak kandidat
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        onConfirm={() => promote.mutate()}
        title="Promosikan ke master operasional?"
        description={`Dormitory baru akan dibuat untuk "${item.name}" pada lokasi ${item.locationCode}. Hanya data tingkat properti yang dibuat — gedung, lantai, kamar, dan ranjang TIDAK akan dibuat karena datanya belum tersedia. Tindakan ini tercatat di log audit.`}
        confirmLabel="Promosikan"
        tone="primary"
        loading={promote.isPending}
      />
    </div>
  );
}

function ResearchDetailModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { hasPermission } = useAuth();
  const detail = useQuery({
    queryKey: ['research', 'detail', id],
    queryFn: () => apiRequest<ResearchDetail>(`/api/v1/research/${id}`),
  });

  const item = detail.data;
  return (
    <Modal open onClose={onClose} title={item?.name ?? 'Detail kandidat riset'} size="lg">
      {detail.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {detail.isError ? (
        <Notice tone="danger">Detail kandidat tidak dapat dimuat.</Notice>
      ) : null}
      {item ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationBadge value={item.classification} />
            <VerificationBadge value={item.verificationStatus} />
            <Badge tone="neutral">{item.locationName}</Badge>
            {item.promotedDormitoryId ? <Badge tone="success">Sudah dipromosikan</Badge> : null}
          </div>

          <dl className="divide-y divide-ink-50 rounded-lg border border-ink-100 px-3">
            <DetailRow label="Alamat">{item.address ?? 'Belum tersedia'}</DetailRow>
            <DetailRow label="Koordinat">
              {item.latitude !== null && item.longitude !== null
                ? `${item.latitude}, ${item.longitude}`
                : 'Belum tersedia'}
            </DetailRow>
            <DetailRow label="Jarak dari stasiun/depo">
              {item.distanceKm !== null ? `${item.distanceKm} km` : 'Belum terverifikasi'}
            </DetailRow>
            <DetailRow label="Tipe properti">{propertyTypeLabel(item.propertyType)}</DetailRow>
            <DetailRow label="Situs web">
              {item.website ? (
                <a
                  href={item.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                >
                  {item.website} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                'Belum tersedia'
              )}
            </DetailRow>
            <DetailRow label="Kontak">
              {item.contactName || item.contactPhone
                ? [item.contactName, item.contactPhone].filter(Boolean).join(' · ')
                : 'Belum terverifikasi'}
            </DetailRow>
            <DetailRow label="Fasilitas">
              {item.facilities.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {item.facilities.map((facility) => (
                    <Badge key={facility} tone="neutral">
                      {facility}
                    </Badge>
                  ))}
                </span>
              ) : (
                'Belum tersedia'
              )}
            </DetailRow>
            <DetailRow label="Catatan riset">{item.notes ?? '—'}</DetailRow>
            <DetailRow label="Ditinjau oleh">
              {item.reviewedByName
                ? `${item.reviewedByName} · ${item.reviewedAt ? formatDateTime(item.reviewedAt) : ''}`
                : 'Belum ditinjau'}
            </DetailRow>
          </dl>

          <section>
            <h3 className="mb-2 text-sm font-bold text-ink-950">
              Referensi sumber ({item.sources.length})
            </h3>
            <SourceList item={item} />
          </section>

          {hasPermission('research.manage') && !item.promotedDormitoryId ? (
            <ReviewPanel item={item} onChanged={() => detail.refetch()} />
          ) : null}
          {hasPermission('research.manage') && item.promotedDormitoryId ? (
            <Notice tone="success">
              Kandidat ini sudah dipromosikan menjadi dormitory operasional.
            </Notice>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-bold text-ink-950">Riwayat riset</h3>
            <ol className="space-y-2">
              {item.events.map((event) => (
                <li key={event.id} className="rounded-md border border-ink-100 px-3 py-2">
                  <p className="text-xs font-semibold text-ink-800">
                    {event.action}
                    {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus
                      ? ` · ${event.fromStatus} → ${event.toStatus}`
                      : ''}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {formatDateTime(event.createdAt)}
                    {event.actorName ? ` · ${event.actorName}` : ' · sistem'}
                  </p>
                  {event.note ? <p className="mt-0.5 text-[11px] text-ink-500">{event.note}</p> : null}
                </li>
              ))}
              {item.events.length === 0 ? (
                <li className="text-xs text-ink-400">Belum ada riwayat.</li>
              ) : null}
            </ol>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function CompareModal({ items, onClose }: { items: ResearchItem[]; onClose: () => void }) {
  const rows: Array<{ label: string; render: (item: ResearchItem) => ReactNode }> = [
    { label: 'Lokasi', render: (item) => item.locationName },
    { label: 'Tipe', render: (item) => propertyTypeLabel(item.propertyType) },
    { label: 'Klasifikasi', render: (item) => <ClassificationBadge value={item.classification} /> },
    { label: 'Tinjauan', render: (item) => <VerificationBadge value={item.verificationStatus} /> },
    {
      label: 'Jarak',
      render: (item) => (item.distanceKm !== null ? `${item.distanceKm} km` : 'Belum terverifikasi'),
    },
    {
      label: 'Koordinat',
      render: (item) =>
        item.latitude !== null && item.longitude !== null
          ? `${item.latitude}, ${item.longitude}`
          : '—',
    },
    { label: 'Alamat', render: (item) => item.address ?? '—' },
    { label: 'Fasilitas', render: (item) => `${item.facilities.length} tercatat` },
    { label: 'Sumber', render: (item) => `${item.sources.length} referensi` },
    { label: 'Kontak', render: (item) => item.contactPhone ?? '—' },
  ];
  return (
    <Modal open onClose={onClose} title="Bandingkan kandidat" size="lg">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-32 border-b border-ink-100 p-2 text-[11px] uppercase tracking-wide text-ink-400">
                Aspek
              </th>
              {items.map((item) => (
                <th key={item.id} className="border-b border-ink-100 p-2 text-xs font-bold text-ink-900">
                  {item.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="align-top">
                <th className="border-b border-ink-50 p-2 text-[11px] font-semibold text-ink-500">
                  {row.label}
                </th>
                {items.map((item) => (
                  <td key={item.id} className="border-b border-ink-50 p-2 text-xs text-ink-700">
                    {row.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function ResearchPage() {
  const { hasPermission } = useAuth();
  const params = useListParams({
    q: '',
    location: '',
    classification: '',
    status: '',
    page: '1',
    pageSize: '10',
  });
  const { value: search, setValue: setSearch } = useUrlSyncedSearch(
    params.values.q,
    (q) => params.setFilters({ q }),
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const research = useQuery({
    queryKey: ['research', 'list', params.values],
    queryFn: () =>
      apiRequest<Paged<ResearchItem>>(
        `/api/v1/research${queryString({
          q: params.values.q,
          locationCode: params.values.location,
          classification: params.values.classification,
          verificationStatus: params.values.status,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['research', 'summary'],
    queryFn: () => apiRequest<ResearchSummary>('/api/v1/research/summary'),
    staleTime: 60_000,
  });

  const filterOptions = useQuery({
    queryKey: ['research', 'filter-options'],
    queryFn: () =>
      apiRequest<{ locations: Array<{ code: string; name: string }> }>(
        '/api/v1/research/filter-options',
      ),
    staleTime: 60_000,
  });

  const items = research.data?.items ?? [];
  const selectedItems = items.filter((item) => selected.includes(item.id));

  const toggleSelected = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= 4
          ? current
          : [...current, id],
    );
  };

  const columns: Array<DataTableColumn<ResearchItem>> = [
    {
      key: 'select',
      header: '',
      render: (item) => (
        <input
          type="checkbox"
          checked={selected.includes(item.id)}
          onChange={() => toggleSelected(item.id)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Pilih ${item.name} untuk perbandingan`}
          className="h-4 w-4 accent-brand-700"
        />
      ),
    },
    {
      key: 'property',
      header: 'Properti',
      render: (item) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setDetailId(item.id)}
            className="text-left font-semibold text-ink-900 hover:text-brand-700 hover:underline"
          >
            {item.name}
          </button>
          <p className="max-w-[280px] truncate text-[11px] text-ink-400" title={item.address ?? undefined}>
            {item.address ?? 'Alamat belum tersedia'}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Lokasi',
      render: (item) => <span className="text-xs text-ink-600">{item.locationCode}</span>,
    },
    {
      key: 'type',
      header: 'Tipe',
      render: (item) => (
        <span className="text-xs text-ink-600">{propertyTypeLabel(item.propertyType)}</span>
      ),
    },
    {
      key: 'classification',
      header: 'Klasifikasi',
      render: (item) => <ClassificationBadge value={item.classification} />,
    },
    {
      key: 'verification',
      header: 'Tinjauan',
      render: (item) => (
        <div className="flex flex-wrap items-center gap-1">
          <VerificationBadge value={item.verificationStatus} />
          {item.promotedDormitoryId ? <Badge tone="success">Dipromosikan</Badge> : null}
        </div>
      ),
    },
    {
      key: 'distance',
      header: 'Jarak',
      render: (item) => (
        <span className="text-xs text-ink-600">
          {item.distanceKm !== null ? `${item.distanceKm} km` : '—'}
        </span>
      ),
    },
    {
      key: 'sources',
      header: 'Sumber',
      render: (item) => (
        <span className="text-xs text-ink-600">{item.sources.length} referensi</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Riset Akomodasi"
        title="Hasil riset penginapan"
        description="Kandidat akomodasi di sekitar stasiun dan depo, dikumpulkan dari sumber publik dan resmi beserta referensi dan tanggal pemeriksaan."
        actions={
          selectedItems.length >= 2 ? (
            <Button variant="secondary" onClick={() => setCompareOpen(true)}>
              <GitCompareArrows className="h-4 w-4" /> Bandingkan ({selectedItems.length})
            </Button>
          ) : null
        }
      />

      <Notice tone="warning">
        Hasil pencarian publik bukan data operasional KCIC. Kandidat hanya menjadi fasilitas
        operasional setelah klasifikasi <strong>Akomodasi resmi KCIC terverifikasi</strong> dibuktikan
        dengan sumber resmi dan disetujui administrator. Jangan mencampur penginapan publik dengan
        fasilitas internal KCIC.
      </Notice>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total kandidat"
          value={summary.data?.total ?? '—'}
          icon={<Telescope className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Publik terverifikasi"
          value={summary.data?.byClassification.VERIFIED_PUBLIC ?? '—'}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          label="Resmi KCIC terverifikasi"
          value={summary.data?.byClassification.VERIFIED_OFFICIAL_KCIC ?? 0}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Dipromosikan"
          value={summary.data?.promoted ?? '—'}
          icon={<ArrowUpRight className="h-5 w-5" />}
        />
      </div>

      {summary.data && Object.keys(summary.data.byLocation).length > 0 ? (
        <DistributionBar
          title="Kandidat per lokasi"
          items={Object.entries(summary.data.byLocation).map(([code, value], index) => ({
            label: code,
            value,
            colorClass: `bg-chart-${(index % 6) + 1}`,
          }))}
        />
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form
              className="relative w-full sm:max-w-sm"
              onSubmit={(event) => {
                event.preventDefault();
                params.setFilters({ q: search.trim() });
              }}
            >
              <SearchInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama atau alamat properti"
                aria-label="Cari kandidat riset"
              />
            </form>
            <p className="text-xs text-ink-400">
              {research.data ? `${research.data.pagination.total} kandidat` : 'Memuat…'}
              {selected.length > 0 ? ` · ${selected.length} dipilih (maks 4)` : ''}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Lokasi">
              <Select
                value={params.values.location}
                onChange={(event) => params.setFilters({ location: event.target.value })}
              >
                <option value="">Semua lokasi</option>
                {(filterOptions.data?.locations ?? []).map((location) => (
                  <option key={location.code} value={location.code}>
                    {location.name} ({location.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Klasifikasi">
              <Select
                value={params.values.classification}
                onChange={(event) => params.setFilters({ classification: event.target.value })}
              >
                <option value="">Semua klasifikasi</option>
                {RESEARCH_CLASSIFICATIONS.map((value) => (
                  <option key={value} value={value}>
                    {RESEARCH_CLASSIFICATION_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status tinjauan">
              <Select
                value={params.values.status}
                onChange={(event) => params.setFilters({ status: event.target.value })}
              >
                <option value="">Semua status</option>
                {RESEARCH_VERIFICATION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {RESEARCH_VERIFICATION_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={items}
          rowKey={(item) => item.id}
          ariaLabel="Tabel hasil riset akomodasi"
          loading={research.isLoading}
          error={research.isError ? 'Hasil riset tidak dapat dimuat.' : null}
          onRetry={() => research.refetch()}
          onRowClick={(item) => setDetailId(item.id)}
          emptyTitle="Tidak ada kandidat yang cocok"
          emptyDescription="Ubah filter, atau jalankan impor hasil riset melalui CLI npm run research:import."
          emptyIcon={<Search className="h-5 w-5" />}
          minWidthClass="min-w-[1080px]"
          footer={
            research.data ? (
              <Pagination
                page={params.page}
                pageSize={params.pageSize}
                total={research.data.pagination.total}
                onPageChange={params.setPage}
                onPageSizeChange={params.setPageSize}
                fetching={research.isFetching}
                itemLabel="kandidat"
              />
            ) : null
          }
        />
      </Card>

      {hasPermission('research.manage') ? (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <MapPin className="h-3.5 w-3.5" />
          Tinjauan, persetujuan, dan promosi tersedia pada detail kandidat untuk administrator
          dengan izin research.manage.
        </p>
      ) : null}

      {detailId ? <ResearchDetailModal id={detailId} onClose={() => setDetailId(null)} /> : null}
      {compareOpen && selectedItems.length >= 2 ? (
        <CompareModal items={selectedItems} onClose={() => setCompareOpen(false)} />
      ) : null}
    </div>
  );
}