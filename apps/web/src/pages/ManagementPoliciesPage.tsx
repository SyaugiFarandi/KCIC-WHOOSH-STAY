import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  FileClock,
  FlaskConical,
  History,
  Pencil,
  Play,
  Plus,
  Scale,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  POLICY_CATEGORIES,
  POLICY_CATEGORY_LABELS,
  POLICY_CATEGORY_META,
  POLICY_DECISIONS,
  POLICY_DECISION_LABELS,
  POLICY_EFFECTS,
  POLICY_EFFECT_LABELS,
  POLICY_PRIORITIES,
  POLICY_SEVERITIES,
  POLICY_SEVERITY_LABELS,
  POLICY_STATUSES,
  POLICY_STATUS_LABELS,
  POLICY_WORKFLOWS,
  POLICY_WORKFLOW_LABELS,
  type DormitorySummary,
  type PolicyCategory,
  type PolicyDecision,
  type PolicyDetail,
  type PolicyEffect,
  type PolicyEvaluationLogEntry,
  type PolicyEvaluationLogResult,
  type PolicyEvaluationResult,
  type PolicyListResult,
  type PolicySeverity,
  type PolicySimulationInput,
  type PolicyStatus,
  type PolicySummary,
  type PolicyVersionEntry,
  type PolicyWorkflow,
} from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  Tabs,
  Textarea,
  type DataTableColumn,
} from '../components/ui';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { apiRequest, queryString } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { displayName, formatDateTime } from '../lib/format';
import type { Paged } from '../lib/types';

const BASE = '/api/v1/policy-engine';

const DECISION_TONE: Record<PolicyDecision, 'success' | 'danger' | 'warning' | 'info'> = {
  ALLOWED: 'success',
  DENIED: 'danger',
  REQUIRES_APPROVAL: 'warning',
  REQUIRES_MANUAL_REVIEW: 'info',
};

const STATUS_TONE: Record<PolicyStatus, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  INACTIVE: 'neutral',
};

const EFFECT_TONE: Record<PolicyEffect, 'success' | 'danger' | 'warning' | 'info'> = {
  ALLOW: 'success',
  DENY: 'danger',
  REQUIRES_APPROVAL: 'warning',
  REQUIRES_MANUAL_REVIEW: 'info',
};

const SEVERITY_TONE: Record<PolicySeverity, 'danger' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

type TabValue = 'registry' | 'simulation' | 'logs';

interface JsonParseResult {
  value?: Record<string, unknown>;
  error?: string;
}

function parseJsonObject(text: string, label: string): JsonParseResult {
  if (!text.trim()) return { value: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: `${label} harus berupa objek JSON.` };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: `${label} bukan JSON yang valid.` };
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface EditorState {
  mode: 'create' | 'edit';
  id: string | null;
  expectedVersion: number | null;
  code: string;
  name: string;
  description: string;
  category: PolicyCategory;
  effect: PolicyEffect;
  severity: PolicySeverity;
  priority: string;
  dormitoryId: string;
  effectiveFrom: string;
  effectiveTo: string;
  parametersText: string;
  conditionsText: string;
  changeNote: string;
}

function emptyEditor(): EditorState {
  return {
    mode: 'create',
    id: null,
    expectedVersion: null,
    code: '',
    name: '',
    description: '',
    category: 'RESERVATION_ELIGIBILITY',
    effect: 'DENY',
    severity: 'MEDIUM',
    priority: '100',
    dormitoryId: '',
    effectiveFrom: todayIso(),
    effectiveTo: '',
    parametersText: '{}',
    conditionsText: '{}',
    changeNote: '',
  };
}

function editorFrom(policy: PolicyDetail): EditorState {
  return {
    mode: 'edit',
    id: policy.id,
    expectedVersion: policy.version,
    code: policy.code,
    name: policy.name,
    description: policy.description ?? '',
    category: policy.category,
    effect: policy.effect,
    severity: policy.severity,
    priority: String(policy.priority),
    dormitoryId: policy.dormitoryId ?? '',
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo ?? '',
    parametersText: JSON.stringify(policy.parameters ?? {}, null, 2),
    conditionsText: JSON.stringify(policy.conditions ?? {}, null, 2),
    changeNote: '',
  };
}

export function ManagementPoliciesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission('policies.create');
  const canUpdate = hasPermission('policies.update');
  const canActivate = hasPermission('policies.activate');
  const canManage = hasPermission('policies.manage');
  const canEvaluate = hasPermission('policies.evaluate');

  const [tab, setTab] = useState<TabValue>('registry');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [dormitoryFilter, setDormitoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ['policy-engine-summary'],
    queryFn: () =>
      apiRequest<{
        counts: { active: number; draft: number; inactive: number };
        total: number;
        categoriesCovered: number;
        evaluationsLast7Days: number;
        deniedLast7Days: number;
      }>(`${BASE}/summary`),
  });

  const dormitories = useQuery({
    queryKey: ['dormitories', 'policies'],
    queryFn: () => apiRequest<Paged<DormitorySummary>>('/api/v1/dormitories?pageSize=50'),
    staleTime: 60_000,
  });

  const policies = useQuery({
    queryKey: ['policy-engine-policies', { category, status, dormitoryFilter, q: debouncedSearch, page, pageSize }],
    queryFn: () =>
      apiRequest<PolicyListResult>(
        `${BASE}/policies${queryString({
          category,
          status,
          dormitoryId: dormitoryFilter,
          q: debouncedSearch.trim() || undefined,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const detail = useQuery({
    queryKey: ['policy-engine-detail', selectedId],
    queryFn: () => apiRequest<PolicyDetail>(`${BASE}/policies/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const versions = useQuery({
    queryKey: ['policy-engine-versions', selectedId],
    queryFn: () => apiRequest<PolicyVersionEntry[]>(`${BASE}/policies/${selectedId}/versions`),
    enabled: Boolean(selectedId),
  });

  const invalidatePolicies = () => {
    void queryClient.invalidateQueries({ queryKey: ['policy-engine-policies'] });
    void queryClient.invalidateQueries({ queryKey: ['policy-engine-summary'] });
  };
  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ['policy-engine-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['policy-engine-versions'] });
    invalidatePolicies();
  };

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<PolicyDetail>(`${BASE}/policies`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (created) => {
      setEditor(null);
      setEditorError(null);
      setActionError(null);
      setFeedback(`Kebijakan ${created.code} dibuat sebagai draf versi ${created.version}.`);
      invalidatePolicies();
    },
    onError: (error) => setEditorError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest<PolicyDetail>(`${BASE}/policies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) => {
      setEditor(null);
      setEditorError(null);
      setActionError(null);
      setFeedback(`Kebijakan ${updated.code} diperbarui menjadi versi ${updated.version}.`);
      invalidateDetail();
    },
    onError: (error) => setEditorError(errorMessage(error)),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiRequest<PolicyDetail>(`${BASE}/policies/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: (updated) => {
      setActionError(null);
      setApprovalNote('');
      setFeedback(`Parameter versi ${updated.version} kebijakan ${updated.code} disetujui.`);
      invalidateDetail();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const activateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'deactivate' }) =>
      apiRequest<PolicyDetail>(`${BASE}/policies/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (updated) => {
      setActionError(null);
      setFeedback(
        updated.status === 'ACTIVE'
          ? `Kebijakan ${updated.code} diaktifkan.`
          : `Kebijakan ${updated.code} dinonaktifkan.`,
      );
      invalidateDetail();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(`${BASE}/policies/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteOpen(false);
      setSelectedId(null);
      setActionError(null);
      setFeedback('Kebijakan dihapus.');
      invalidatePolicies();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const resetPage = () => setPage(1);
  const items = policies.data?.items ?? [];
  const counts = policies.data?.counts ?? { active: 0, draft: 0, inactive: 0 };
  const activePolicy = detail.data ?? null;
  const busy =
    approveMutation.isPending ||
    activateMutation.isPending ||
    deleteMutation.isPending ||
    updateMutation.isPending;

  const columns: Array<DataTableColumn<PolicySummary>> = [
    {
      key: 'policy',
      header: 'Kebijakan',
      render: (row) => (
        <div className="min-w-[220px]">
          <p className="font-semibold text-ink-900">{row.name}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {row.code} · v{row.version}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      render: (row) => (
        <span className="text-sm text-ink-800">{POLICY_CATEGORY_LABELS[row.category]}</span>
      ),
    },
    {
      key: 'effect',
      header: 'Efek',
      render: (row) => <Badge tone={EFFECT_TONE[row.effect]}>{POLICY_EFFECT_LABELS[row.effect]}</Badge>,
    },
    {
      key: 'priority',
      header: 'Prioritas',
      render: (row) => <span className="text-sm tabular-nums text-ink-800">{row.priority}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge tone={STATUS_TONE[row.status]}>{POLICY_STATUS_LABELS[row.status]}</Badge>
          {row.status !== 'ACTIVE' && !row.approved ? (
            <span className="text-[11px] text-ink-400">Belum disetujui</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'effective',
      header: 'Berlaku',
      render: (row) => (
        <div className="text-xs text-ink-600">
          <p>{row.effectiveFrom}</p>
          <p className="text-ink-400">s.d. {row.effectiveTo ?? 'tanpa batas'}</p>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Cakupan',
      render: (row) => (
        <span className="text-xs text-ink-600">
          {row.dormitoryName ? row.dormitoryName : 'Global'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pengelolaan Sistem"
        title="Kebijakan Akomodasi"
        description="Registry kebijakan terpusat untuk reservasi, alokasi, check-in, check-out, dan pembatalan. Nilai parameter contoh bersifat ilustratif dan bukan kebijakan resmi KCIC."
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setEditor(emptyEditor());
                setEditorError(null);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Kebijakan baru
            </Button>
          ) : null
        }
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kebijakan aktif"
          value={summary.data ? summary.data.counts.active : '…'}
          hint={`${summary.data?.categoriesCovered ?? 0} dari 16 kategori terpakai`}
          icon={<Scale className="h-5 w-5" aria-hidden />}
          tone="success"
        />
        <StatCard
          label="Draf & nonaktif"
          value={
            summary.data ? summary.data.counts.draft + summary.data.counts.inactive : '…'
          }
          hint="Belum berlaku pada alur"
          icon={<BookOpenCheck className="h-5 w-5" aria-hidden />}
          tone="brand"
        />
        <StatCard
          label="Evaluasi 7 hari"
          value={summary.data ? summary.data.evaluationsLast7Days : '…'}
          hint="Termasuk simulasi"
          icon={<FileClock className="h-5 w-5" aria-hidden />}
          tone="neutral"
        />
        <StatCard
          label="Ditolak 7 hari"
          value={summary.data ? summary.data.deniedLast7Days : '…'}
          hint="Keputusan DENIED tercatat"
          icon={<ShieldAlert className="h-5 w-5" aria-hidden />}
          tone="warning"
        />
      </div>

      <Tabs
        ariaLabel="Bagian kebijakan akomodasi"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'registry', label: 'Registry', icon: <Scale className="h-3.5 w-3.5" /> },
          { value: 'simulation', label: 'Simulasi', icon: <FlaskConical className="h-3.5 w-3.5" /> },
          { value: 'logs', label: 'Log evaluasi', icon: <History className="h-3.5 w-3.5" /> },
        ]}
      />

      {tab === 'registry' ? (
        <RegistryTab
          category={category}
          status={status}
          dormitoryFilter={dormitoryFilter}
          search={search}
          counts={counts}
          items={items}
          columns={columns}
          dormitories={dormitories.data?.items ?? []}
          loading={policies.isLoading}
          error={policies.isError ? errorMessage(policies.error) : null}
          onRetry={() => void policies.refetch()}
          onCategoryChange={(value) => {
            setCategory(value);
            resetPage();
          }}
          onStatusChange={(value) => {
            setStatus(value);
            resetPage();
          }}
          onDormitoryChange={(value) => {
            setDormitoryFilter(value);
            resetPage();
          }}
          onSearchChange={(value) => {
            setSearch(value);
            resetPage();
          }}
          onSelect={(row) => {
            setSelectedId(row.id);
            setActionError(null);
            setApprovalNote('');
          }}
          pagination={
            policies.data ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={policies.data.pagination.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                fetching={policies.isFetching}
                itemLabel="kebijakan"
              />
            ) : null
          }
        />
      ) : null}

      {tab === 'simulation' ? (
        <SimulationTab
          canEvaluate={canEvaluate}
          policies={items}
          dormitories={dormitories.data?.items ?? []}
        />
      ) : null}

      {tab === 'logs' ? (
        <LogsTab dormitories={dormitories.data?.items ?? []} />
      ) : null}

      <Modal
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null);
          setActionError(null);
          setApprovalNote('');
        }}
        title={activePolicy?.name ?? 'Detail kebijakan'}
        description={
          activePolicy
            ? `${activePolicy.code} · versi ${activePolicy.version} · ${POLICY_CATEGORY_LABELS[activePolicy.category]}`
            : undefined
        }
        size="lg"
      >
        {detail.isLoading ? (
          <p className="text-sm text-ink-500">Memuat detail kebijakan…</p>
        ) : detail.isError ? (
          <Notice tone="danger">{errorMessage(detail.error)}</Notice>
        ) : activePolicy ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={STATUS_TONE[activePolicy.status]}>
                {POLICY_STATUS_LABELS[activePolicy.status]}
              </Badge>
              <Badge tone={EFFECT_TONE[activePolicy.effect]}>
                {POLICY_EFFECT_LABELS[activePolicy.effect]}
              </Badge>
              <Badge tone={SEVERITY_TONE[activePolicy.severity]}>
                {POLICY_SEVERITY_LABELS[activePolicy.severity]}
              </Badge>
              <Badge tone={activePolicy.approved ? 'success' : 'warning'}>
                {activePolicy.approved ? 'Parameter disetujui' : 'Parameter belum disetujui'}
              </Badge>
              <Badge tone="neutral">Prioritas {activePolicy.priority}</Badge>
            </div>

            {activePolicy.description ? (
              <p className="text-sm leading-6 text-ink-700">{activePolicy.description}</p>
            ) : null}

            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Kategori
                </dt>
                <dd className="text-ink-800">{POLICY_CATEGORY_LABELS[activePolicy.category]}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Dormitory
                </dt>
                <dd className="text-ink-800">
                  {activePolicy.dormitoryName ?? 'Global (semua dormitory)'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Berlaku
                </dt>
                <dd className="text-ink-800">
                  {activePolicy.effectiveFrom} s.d. {activePolicy.effectiveTo ?? 'tanpa batas'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Versi
                </dt>
                <dd className="text-ink-800">
                  v{activePolicy.version}
                  {activePolicy.approvedAt
                    ? ` · disetujui ${formatDateTime(activePolicy.approvedAt)}`
                    : ''}
                </dd>
              </div>
            </dl>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Parameter
                </p>
                <pre className="scrollbar-slim mt-1 max-h-52 overflow-auto rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-xs leading-5 text-ink-700">
                  {JSON.stringify(activePolicy.parameters, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Kondisi
                </p>
                <pre className="scrollbar-slim mt-1 max-h-52 overflow-auto rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-xs leading-5 text-ink-700">
                  {JSON.stringify(activePolicy.conditions, null, 2)}
                </pre>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                Riwayat versi
              </p>
              <ul className="mt-2 space-y-2">
                {(versions.data ?? []).map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-ink-100 px-3 py-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[entry.status]}>v{entry.version}</Badge>
                      <span className="text-xs text-ink-500">{formatDateTime(entry.createdAt)}</span>
                      {entry.approvedAt ? (
                        <Badge tone="success">Disetujui</Badge>
                      ) : (
                        <Badge tone="neutral">Belum disetujui</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-ink-700">{entry.changeNote ?? 'Tanpa catatan perubahan'}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
              {canUpdate && activePolicy.status !== 'ACTIVE' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEditor(editorFrom(activePolicy));
                    setEditorError(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Ubah (versi baru)
                </Button>
              ) : null}
              {canManage && !activePolicy.approved && activePolicy.status !== 'ACTIVE' ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="Catatan persetujuan parameter"
                    placeholder="Catatan persetujuan (min. 3 karakter)"
                    value={approvalNote}
                    onChange={(event) => setApprovalNote(event.target.value)}
                    className="w-full sm:w-64"
                  />
                  <Button
                    size="sm"
                    disabled={busy || approvalNote.trim().length < 3}
                    onClick={() =>
                      approveMutation.mutate({ id: activePolicy.id, note: approvalNote.trim() })
                    }
                  >
                    Setujui parameter
                  </Button>
                </span>
              ) : null}
              {canActivate && activePolicy.status !== 'ACTIVE' ? (
                <Button
                  size="sm"
                  disabled={busy || !activePolicy.approved}
                  onClick={() =>
                    activateMutation.mutate({ id: activePolicy.id, action: 'activate' })
                  }
                >
                  Aktifkan
                </Button>
              ) : null}
              {canActivate && activePolicy.status === 'ACTIVE' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    activateMutation.mutate({ id: activePolicy.id, action: 'deactivate' })
                  }
                >
                  Nonaktifkan
                </Button>
              ) : null}
              {canManage && activePolicy.status !== 'ACTIVE' ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Hapus
                </Button>
              ) : null}
            </div>
            {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
            {!activePolicy.approved && activePolicy.status !== 'ACTIVE' ? (
              <Notice tone="info">
                Aktivasi memerlukan persetujuan eksplisit parameter versi ini. Nilai parameter tidak
                dianggap resmi sebelum disetujui.
              </Notice>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (selectedId) deleteMutation.mutate(selectedId);
        }}
        title="Hapus kebijakan?"
        description="Kebijakan nonaktif akan dihapus permanen dari registry. Riwayat versi dan log evaluasi terkait tidak dapat dipulihkan."
        confirmLabel="Hapus kebijakan"
        loading={deleteMutation.isPending}
      />

      {editor ? (
        <PolicyEditor
          editor={editor}
          setEditor={setEditor}
          dormitories={dormitories.data?.items ?? []}
          error={editorError}
          saving={createMutation.isPending || updateMutation.isPending}
          onClose={() => {
            setEditor(null);
            setEditorError(null);
          }}
          onSubmit={(body) => {
            setEditorError(null);
            if (editor.mode === 'create') {
              createMutation.mutate(body);
            } else if (editor.id) {
              updateMutation.mutate({
                id: editor.id,
                body: { ...body, expectedVersion: editor.expectedVersion },
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function RegistryTab({
  category,
  status,
  dormitoryFilter,
  search,
  counts,
  items,
  columns,
  dormitories,
  loading,
  error,
  onRetry,
  onCategoryChange,
  onStatusChange,
  onDormitoryChange,
  onSearchChange,
  onSelect,
  pagination,
}: {
  category: string;
  status: string;
  dormitoryFilter: string;
  search: string;
  counts: { active: number; draft: number; inactive: number };
  items: PolicySummary[];
  columns: Array<DataTableColumn<PolicySummary>>;
  dormitories: DormitorySummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDormitoryChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSelect: (row: PolicySummary) => void;
  pagination: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {counts.active === 0 ? (
        <Notice tone="info">
          Belum ada kebijakan aktif. Seluruh alur reservasi berjalan dengan keputusan ALLOWED sampai
          kebijakan disetujui dan diaktifkan.
        </Notice>
      ) : null}

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Kategori">
            <Select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="">Semua kategori</option>
              {POLICY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {POLICY_CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => onStatusChange(event.target.value)}>
              <option value="">Semua status</option>
              {POLICY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {POLICY_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dormitory">
            <Select
              value={dormitoryFilter}
              onChange={(event) => onDormitoryChange(event.target.value)}
            >
              <option value="">Semua dormitory</option>
              {dormitories.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {displayName(dormitory.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cari">
            <SearchInput
              aria-label="Cari kebijakan"
              placeholder="Nama, kode, atau deskripsi"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          ariaLabel="Registry kebijakan akomodasi"
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={onRetry}
          onRowClick={onSelect}
          minWidthClass="min-w-[980px]"
          emptyTitle="Tidak ada kebijakan pada filter ini"
          emptyDescription="Buat kebijakan baru untuk mulai mengonfigurasi aturan akomodasi. Tanpa kebijakan aktif, semua alur tetap berjalan normal."
          footer={pagination}
        />
      </Card>
    </div>
  );
}

function PolicyEditor({
  editor,
  setEditor,
  dormitories,
  error,
  saving,
  onClose,
  onSubmit,
}: {
  editor: EditorState;
  setEditor: (next: EditorState) => void;
  dormitories: DormitorySummary[];
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const meta = POLICY_CATEGORY_META[editor.category];
  const [localError, setLocalError] = useState<string | null>(null);

  const update = (patch: Partial<EditorState>) => setEditor({ ...editor, ...patch });

  const submit = () => {
    setLocalError(null);
    if (editor.mode === 'create' && !editor.code.trim()) {
      setLocalError('Kode kebijakan wajib diisi.');
      return;
    }
    if (editor.name.trim().length < 3) {
      setLocalError('Nama kebijakan minimal 3 karakter.');
      return;
    }
    if (!editor.effectiveFrom) {
      setLocalError('Tanggal mulai berlaku wajib diisi.');
      return;
    }
    if (editor.effectiveTo && editor.effectiveTo < editor.effectiveFrom) {
      setLocalError('Tanggal akhir tidak boleh sebelum tanggal mulai.');
      return;
    }
    const parameters = parseJsonObject(editor.parametersText, 'Parameter');
    if (parameters.error) {
      setLocalError(parameters.error);
      return;
    }
    const conditions = parseJsonObject(editor.conditionsText, 'Kondisi');
    if (conditions.error) {
      setLocalError(conditions.error);
      return;
    }
    const body: Record<string, unknown> = {
      name: editor.name.trim(),
      description: editor.description.trim() || undefined,
      category: editor.category,
      effect: editor.effect,
      severity: editor.severity,
      priority: Number(editor.priority) || 100,
      dormitoryId: editor.dormitoryId || null,
      effectiveFrom: editor.effectiveFrom,
      effectiveTo: editor.effectiveTo || null,
      parameters: parameters.value ?? {},
      conditions: conditions.value ?? {},
      changeNote: editor.changeNote.trim() || undefined,
    };
    if (editor.mode === 'create') body.code = editor.code.trim().toUpperCase();
    onSubmit(body);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editor.mode === 'create' ? 'Buat kebijakan baru' : `Ubah ${editor.code}`}
      description="Menyimpan perubahan membuat versi baru berstatus draf yang harus disetujui sebelum diaktifkan."
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kode kebijakan">
            <Input
              value={editor.code}
              disabled={editor.mode === 'edit'}
              onChange={(event) => update({ code: event.target.value.toUpperCase() })}
              placeholder="MISAL_MAX_NIGHTS"
            />
          </Field>
          <Field label="Nama">
            <Input
              value={editor.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Nama kebijakan"
            />
          </Field>
          <Field label="Kategori">
            <Select
              value={editor.category}
              onChange={(event) => update({ category: event.target.value as PolicyCategory })}
            >
              {POLICY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {POLICY_CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Efek">
            <Select
              value={editor.effect}
              onChange={(event) => update({ effect: event.target.value as PolicyEffect })}
            >
              {POLICY_EFFECTS.map((value) => (
                <option key={value} value={value}>
                  {POLICY_EFFECT_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Keparahan">
            <Select
              value={editor.severity}
              onChange={(event) => update({ severity: event.target.value as PolicySeverity })}
            >
              {POLICY_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {POLICY_SEVERITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioritas (1-1000)">
            <Input
              type="number"
              min={1}
              max={1000}
              value={editor.priority}
              onChange={(event) => update({ priority: event.target.value })}
            />
          </Field>
          <Field label="Dormitory">
            <Select
              value={editor.dormitoryId}
              onChange={(event) => update({ dormitoryId: event.target.value })}
            >
              <option value="">Global (semua dormitory)</option>
              {dormitories.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {displayName(dormitory.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mulai berlaku">
            <Input
              type="date"
              value={editor.effectiveFrom}
              onChange={(event) => update({ effectiveFrom: event.target.value })}
            />
          </Field>
          <Field label="Akhir berlaku (opsional)">
            <Input
              type="date"
              value={editor.effectiveTo}
              onChange={(event) => update({ effectiveTo: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Deskripsi">
          <Textarea
            rows={2}
            value={editor.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="Jelaskan tujuan kebijakan dan dasar operasionalnya."
          />
        </Field>

        <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
          <p className="text-sm font-semibold text-ink-900">{meta.label}</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-600">{meta.description}</p>
          <ul className="mt-2 space-y-1 text-xs text-ink-600">
            {meta.parameterFields.length ? (
              meta.parameterFields.map((field) => (
                <li key={field.key}>
                  <span className="font-semibold text-ink-800">{field.key}</span> — {field.label}:{' '}
                  {field.hint}
                </li>
              ))
            ) : (
              <li>Kategori ini tidak memerlukan parameter khusus.</li>
            )}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                update({ parametersText: JSON.stringify(meta.exampleParameters, null, 2) })
              }
            >
              Isi parameter contoh
            </Button>
            <span className="text-[11px] text-ink-500">
              Nilai contoh hanya ilustrasi, bukan kebijakan resmi KCIC.
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Parameter (JSON)">
            <Textarea
              rows={8}
              className="font-mono text-xs"
              value={editor.parametersText}
              onChange={(event) => update({ parametersText: event.target.value })}
              aria-label="Parameter kebijakan dalam JSON"
            />
          </Field>
          <Field label="Kondisi (JSON)">
            <Textarea
              rows={8}
              className="font-mono text-xs"
              value={editor.conditionsText}
              onChange={(event) => update({ conditionsText: event.target.value })}
              aria-label="Kondisi kebijakan dalam JSON"
            />
          </Field>
        </div>

        <Field label="Catatan perubahan (opsional)">
          <Input
            value={editor.changeNote}
            onChange={(event) => update({ changeNote: event.target.value })}
            placeholder="Alasan atau konteks perubahan"
          />
        </Field>

        {localError ? <Notice tone="danger">{localError}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving}>
            {editor.mode === 'create' ? 'Simpan draf' : 'Simpan versi baru'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SimulationTab({
  canEvaluate,
  policies,
  dormitories,
}: {
  canEvaluate: boolean;
  policies: PolicySummary[];
  dormitories: DormitorySummary[];
}) {
  const [form, setForm] = useState({
    workflow: 'RESERVATION_MANUAL' as PolicyWorkflow,
    policyId: '',
    dormitoryId: '',
    checkInDate: '',
    checkOutDate: '',
    occupantCount: '1',
    priority: '',
    isEmergency: false,
    emergencyReason: '',
    hasRosterShift: false,
    availableBeds: '',
    requestedBeds: '',
    employeeCategories: '',
    employmentStatus: '',
    eligibilityStatus: '',
    earlyCheckInMinutes: '',
    lateCheckOutMinutes: '',
    cancellationNoticeHours: '',
    sameDayCancellation: false,
  });
  const [result, setResult] = useState<PolicyEvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const mutation = useMutation({
    mutationFn: (input: PolicySimulationInput) =>
      apiRequest<PolicyEvaluationResult>(`${BASE}/evaluate`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (mutationError) => {
      setResult(null);
      setError(errorMessage(mutationError));
    },
  });

  const numeric = (value: string) => (value.trim() ? Number(value) : undefined);

  const submit = () => {
    const input: PolicySimulationInput = {
      workflow: form.workflow,
      ...(form.policyId ? { policyId: form.policyId } : {}),
      ...(form.dormitoryId ? { dormitoryId: form.dormitoryId } : {}),
      ...(form.checkInDate ? { checkInDate: form.checkInDate } : {}),
      ...(form.checkOutDate ? { checkOutDate: form.checkOutDate } : {}),
      ...(numeric(form.occupantCount) ? { occupantCount: numeric(form.occupantCount) } : {}),
      ...(form.priority ? { priority: form.priority as PolicySimulationInput['priority'] } : {}),
      isEmergency: form.isEmergency,
      ...(form.emergencyReason ? { emergencyReason: form.emergencyReason } : {}),
      hasRosterShift: form.hasRosterShift,
      ...(numeric(form.availableBeds) !== undefined
        ? { availableBeds: numeric(form.availableBeds) }
        : {}),
      ...(numeric(form.requestedBeds) !== undefined
        ? { requestedBeds: numeric(form.requestedBeds) }
        : {}),
      ...(form.employeeCategories.trim()
        ? {
            employeeCategories: form.employeeCategories
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : {}),
      ...(form.employmentStatus ? { employmentStatus: form.employmentStatus } : {}),
      ...(form.eligibilityStatus ? { eligibilityStatus: form.eligibilityStatus } : {}),
      ...(numeric(form.earlyCheckInMinutes) !== undefined
        ? { earlyCheckInMinutes: numeric(form.earlyCheckInMinutes) }
        : {}),
      ...(numeric(form.lateCheckOutMinutes) !== undefined
        ? { lateCheckOutMinutes: numeric(form.lateCheckOutMinutes) }
        : {}),
      ...(numeric(form.cancellationNoticeHours) !== undefined
        ? { cancellationNoticeHours: numeric(form.cancellationNoticeHours) }
        : {}),
      sameDayCancellation: form.sameDayCancellation,
    };
    mutation.mutate(input);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand-700" aria-hidden />
          <h2 className="text-sm font-bold text-ink-900">Simulasi evaluasi</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          Simulasi mencatat log evaluasi bertanda simulated dan tidak mengubah data reservasi.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Workflow">
            <Select
              value={form.workflow}
              onChange={(event) => update({ workflow: event.target.value as PolicyWorkflow })}
            >
              {POLICY_WORKFLOWS.map((value) => (
                <option key={value} value={value}>
                  {POLICY_WORKFLOW_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kebijakan tunggal (opsional)">
            <Select
              value={form.policyId}
              onChange={(event) => update({ policyId: event.target.value })}
            >
              <option value="">Semua kebijakan aktif</option>
              {policies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.code} — {policy.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dormitory">
            <Select
              value={form.dormitoryId}
              onChange={(event) => update({ dormitoryId: event.target.value })}
            >
              <option value="">Tanpa dormitory</option>
              {dormitories.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {displayName(dormitory.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jumlah penghuni">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.occupantCount}
              onChange={(event) => update({ occupantCount: event.target.value })}
            />
          </Field>
          <Field label="Check-in">
            <Input
              type="date"
              value={form.checkInDate}
              onChange={(event) => update({ checkInDate: event.target.value })}
            />
          </Field>
          <Field label="Check-out">
            <Input
              type="date"
              value={form.checkOutDate}
              onChange={(event) => update({ checkOutDate: event.target.value })}
            />
          </Field>
          <Field label="Prioritas">
            <Select value={form.priority} onChange={(event) => update({ priority: event.target.value })}>
              <option value="">Tidak ditentukan</option>
              {POLICY_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kategori kru (pisahkan koma)">
            <Input
              value={form.employeeCategories}
              onChange={(event) => update({ employeeCategories: event.target.value })}
              placeholder="dept:OPS, div:CREW, pos:ATTENDANT"
            />
          </Field>
          <Field label="Ketersediaan bed">
            <Input
              type="number"
              min={0}
              value={form.availableBeds}
              onChange={(event) => update({ availableBeds: event.target.value })}
            />
          </Field>
          <Field label="Permintaan bed">
            <Input
              type="number"
              min={0}
              value={form.requestedBeds}
              onChange={(event) => update({ requestedBeds: event.target.value })}
            />
          </Field>
          <Field label="Status kepegawaian">
            <Input
              value={form.employmentStatus}
              onChange={(event) => update({ employmentStatus: event.target.value })}
              placeholder="ACTIVE"
            />
          </Field>
          <Field label="Status eligibilitas">
            <Input
              value={form.eligibilityStatus}
              onChange={(event) => update({ eligibilityStatus: event.target.value })}
              placeholder="ELIGIBLE"
            />
          </Field>
          <Field label="Menit check-in lebih awal">
            <Input
              type="number"
              min={0}
              max={1440}
              value={form.earlyCheckInMinutes}
              onChange={(event) => update({ earlyCheckInMinutes: event.target.value })}
            />
          </Field>
          <Field label="Menit check-out terlambat">
            <Input
              type="number"
              min={0}
              max={1440}
              value={form.lateCheckOutMinutes}
              onChange={(event) => update({ lateCheckOutMinutes: event.target.value })}
            />
          </Field>
          <Field label="Pemberitahuan pembatalan (jam)">
            <Input
              type="number"
              min={0}
              value={form.cancellationNoticeHours}
              onChange={(event) => update({ cancellationNoticeHours: event.target.value })}
            />
          </Field>
          <Field label="Alasan darurat">
            <Input
              value={form.emergencyReason}
              onChange={(event) => update({ emergencyReason: event.target.value })}
              placeholder="Diisi bila simulasi reservasi darurat"
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.isEmergency}
              onChange={(event) => update({ isEmergency: event.target.checked })}
            />
            Reservasi darurat
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.hasRosterShift}
              onChange={(event) => update({ hasRosterShift: event.target.checked })}
            />
            Memiliki shift roster
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.sameDayCancellation}
              onChange={(event) => update({ sameDayCancellation: event.target.checked })}
            />
            Pembatalan hari yang sama
          </label>
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="mt-4">
          <Button onClick={submit} loading={mutation.isPending} disabled={!canEvaluate}>
            <Play className="h-4 w-4" aria-hidden />
            Jalankan evaluasi
          </Button>
          {!canEvaluate ? (
            <p className="mt-2 text-xs text-ink-500">
              Simulasi memerlukan izin policies.evaluate.
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-bold text-ink-900">Hasil evaluasi</h2>
        {!result ? (
          <div className="mt-6 rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center">
            <FlaskConical className="mx-auto h-8 w-8 text-ink-300" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-ink-700">Belum ada simulasi</p>
            <p className="mt-1 text-xs text-ink-500">
              Isi konteks di samping lalu jalankan evaluasi untuk melihat keputusan, kebijakan
              pemenang, dan alasan.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={DECISION_TONE[result.decision]}>
                {POLICY_DECISION_LABELS[result.decision]}
              </Badge>
              <span className="text-xs text-ink-500">
                {result.activePolicyCount} kebijakan aktif dievaluasi ·{' '}
                {formatDateTime(result.evaluatedAt)}
              </span>
            </div>
            {result.blockingPolicy ? (
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 px-3.5 py-3 text-sm">
                <p className="font-semibold text-ink-900">
                  {result.blockingPolicy.policyCode} v{result.blockingPolicy.policyVersion}
                </p>
                <p className="mt-1 text-ink-600">{result.blockingPolicy.reason}</p>
              </div>
            ) : (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3 text-sm text-emerald-800">
                Tidak ada kebijakan yang memblokir konteks ini.
              </p>
            )}
            {result.evaluations.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wide text-ink-400">
                      <th className="py-2 pr-3 font-semibold">Kebijakan</th>
                      <th className="py-2 pr-3 font-semibold">Kategori</th>
                      <th className="py-2 pr-3 font-semibold">Hasil</th>
                      <th className="py-2 font-semibold">Alasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.evaluations.map((line) => (
                      <tr key={`${line.policyId}-${line.policyVersion}`} className="border-b border-ink-50">
                        <td className="py-2 pr-3 align-top">
                          <p className="font-semibold text-ink-800">{line.policyCode}</p>
                          <p className="text-ink-400">v{line.policyVersion}</p>
                        </td>
                        <td className="py-2 pr-3 align-top text-ink-600">
                          {POLICY_CATEGORY_LABELS[line.category]}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <Badge tone={DECISION_TONE[line.result]}>
                            {line.matched ? 'Terpicu' : 'Tidak terpicu'}
                          </Badge>
                        </td>
                        <td className="py-2 align-top text-ink-600">{line.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-500">
                Tidak ada kebijakan relevan untuk konteks dan workflow ini.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function LogsTab({ dormitories }: { dormitories: DormitorySummary[] }) {
  const [resultFilter, setResultFilter] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [simulatedFilter, setSimulatedFilter] = useState('');
  const [dormitoryFilter, setDormitoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const debouncedSearch = useDebouncedValue(search, 300);

  const logs = useQuery({
    queryKey: [
      'policy-engine-evaluations',
      { resultFilter, workflowFilter, simulatedFilter, dormitoryFilter, q: debouncedSearch, page, pageSize },
    ],
    queryFn: () =>
      apiRequest<PolicyEvaluationLogResult>(
        `${BASE}/evaluations${queryString({
          result: resultFilter,
          workflow: workflowFilter,
          simulated: simulatedFilter,
          dormitoryId: dormitoryFilter,
          q: debouncedSearch.trim() || undefined,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const resetPage = () => setPage(1);

  const columns: Array<DataTableColumn<PolicyEvaluationLogEntry>> = [
    {
      key: 'time',
      header: 'Waktu',
      render: (row) => (
        <div className="text-xs text-ink-700">
          <p>{formatDateTime(row.evaluatedAt)}</p>
          <p className="text-ink-400">{row.actorName ?? 'Sistem'}</p>
        </div>
      ),
    },
    {
      key: 'policy',
      header: 'Kebijakan',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-ink-900">{row.policyCode}</p>
          <p className="text-xs text-ink-500">
            v{row.policyVersion} · {POLICY_CATEGORY_LABELS[row.category]}
          </p>
        </div>
      ),
    },
    {
      key: 'workflow',
      header: 'Workflow',
      render: (row) => (
        <span className="text-xs text-ink-700">{POLICY_WORKFLOW_LABELS[row.workflow]}</span>
      ),
    },
    {
      key: 'result',
      header: 'Hasil',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge tone={DECISION_TONE[row.result]}>{POLICY_DECISION_LABELS[row.result]}</Badge>
          {row.simulated ? <span className="text-[11px] text-ink-400">Simulasi</span> : null}
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Alasan',
      render: (row) => <span className="text-xs text-ink-600">{row.reason}</span>,
    },
    {
      key: 'scope',
      header: 'Cakupan',
      render: (row) => (
        <span className="text-xs text-ink-600">
          {row.dormitoryCode ?? 'Global'}
          {row.subjectId ? ' · terhubung subjek' : ''}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Hasil">
            <Select
              value={resultFilter}
              onChange={(event) => {
                setResultFilter(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua hasil</option>
              {POLICY_DECISIONS.map((value) => (
                <option key={value} value={value}>
                  {POLICY_DECISION_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Workflow">
            <Select
              value={workflowFilter}
              onChange={(event) => {
                setWorkflowFilter(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua workflow</option>
              {POLICY_WORKFLOWS.map((value) => (
                <option key={value} value={value}>
                  {POLICY_WORKFLOW_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis">
            <Select
              value={simulatedFilter}
              onChange={(event) => {
                setSimulatedFilter(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua</option>
              <option value="false">Produksi</option>
              <option value="true">Simulasi</option>
            </Select>
          </Field>
          <Field label="Dormitory">
            <Select
              value={dormitoryFilter}
              onChange={(event) => {
                setDormitoryFilter(event.target.value);
                resetPage();
              }}
            >
              <option value="">Semua dormitory</option>
              {dormitories.map((dormitory) => (
                <option key={dormitory.id} value={dormitory.id}>
                  {displayName(dormitory.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cari">
            <SearchInput
              aria-label="Cari log evaluasi"
              placeholder="Kode kebijakan atau alasan"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
            />
          </Field>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          ariaLabel="Log evaluasi kebijakan"
          columns={columns}
          rows={logs.data?.items ?? []}
          rowKey={(row) => row.id}
          loading={logs.isLoading}
          error={logs.isError ? errorMessage(logs.error) : null}
          onRetry={() => void logs.refetch()}
          minWidthClass="min-w-[980px]"
          emptyTitle="Belum ada log evaluasi"
          emptyDescription="Log terisi saat kebijakan aktif dievaluasi pada alur reservasi, alokasi, check-in, check-out, pembatalan, atau simulasi."
          footer={
            logs.data ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={logs.data.pagination.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                fetching={logs.isFetching}
                itemLabel="log"
              />
            ) : null
          }
        />
      </Card>
    </div>
  );
}
