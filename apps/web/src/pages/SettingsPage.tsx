import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Save, Send, Settings2, SlidersHorizontal } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  cn,
} from '../components/ui';
import { apiRequest } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../auth/AuthProvider';

type SettingValue = string | number | boolean;

interface SettingItem {
  key: string;
  value: SettingValue;
  description: string;
  source: 'DATABASE' | 'DEFAULT';
  updatedAt: string | null;
  pendingDecision: string | null;
}

interface Policy {
  id: string;
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
  approvalMode: 'NOT_REQUIRED' | 'ADMIN_APPROVAL';
  criteria: Record<string, unknown>;
  rules: Record<string, unknown>;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

const BOOLEAN_KEYS = new Set([
  'notifications.emailEnabled',
  'notifications.telegramEnabled',
  'roster.autoConfirmEnabled',
]);

const APPROVAL_MODE_LABELS: Record<string, string> = {
  ADMIN_APPROVAL: 'Persetujuan admin',
  NOT_REQUIRED: 'Tanpa persetujuan',
};

interface PolicyFormState {
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
  approvalMode: 'NOT_REQUIRED' | 'ADMIN_APPROVAL';
  criteriaText: string;
  rulesText: string;
}

const EMPTY_POLICY: PolicyFormState = {
  code: '',
  name: '',
  priority: 100,
  isActive: true,
  approvalMode: 'ADMIN_APPROVAL',
  criteriaText: '{}',
  rulesText: '{}',
};

export function SettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(EMPTY_POLICY);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiRequest<{ items: SettingItem[] }>('/api/v1/settings'),
    enabled: hasPermission('settings.manage'),
  });

  const policies = useQuery({
    queryKey: ['policies'],
    queryFn: () => apiRequest<{ items: Policy[] }>('/api/v1/policies'),
    enabled: hasPermission('policies.manage'),
  });

  useEffect(() => {
    if (!settings.data) return;
    setDraft(Object.fromEntries(settings.data.items.map((item) => [item.key, item.value])));
  }, [settings.data]);

  const saveSettings = useMutation({
    mutationFn: () =>
      apiRequest<{ items: SettingItem[] }>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: Object.entries(draft).map(([key, value]) => ({ key, value })),
        }),
      }),
    onSuccess: () => {
      setSettingsError(null);
      setSettingsSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      setSettingsSaved(false);
      setSettingsError(errorMessage(error));
    },
  });

  const savePolicy = useMutation({
    mutationFn: async () => {
      const payload = {
        code: policyForm.code.trim(),
        name: policyForm.name.trim(),
        priority: policyForm.priority,
        isActive: policyForm.isActive,
        approvalMode: policyForm.approvalMode,
        criteria: JSON.parse(policyForm.criteriaText || '{}') as Record<string, unknown>,
        rules: JSON.parse(policyForm.rulesText || '{}') as Record<string, unknown>,
      };
      if (editingPolicy) {
        return apiRequest<Policy>(`/api/v1/policies/${editingPolicy.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: payload.name,
            priority: payload.priority,
            isActive: payload.isActive,
            approvalMode: payload.approvalMode,
            criteria: payload.criteria,
            rules: payload.rules,
          }),
        });
      }
      return apiRequest<Policy>('/api/v1/policies', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setPolicyOpen(false);
      setPolicyError(null);
      void queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
    onError: (error) => setPolicyError(errorMessage(error)),
  });

  const togglePolicy = useMutation({
    mutationFn: (policy: Policy) =>
      apiRequest<Policy>(`/api/v1/policies/${policy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !policy.isActive }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });

  const openPolicy = (policy: Policy | null) => {
    setEditingPolicy(policy);
    setPolicyError(null);
    setPolicyForm(
      policy
        ? {
            code: policy.code,
            name: policy.name,
            priority: policy.priority,
            isActive: policy.isActive,
            approvalMode: policy.approvalMode,
            criteriaText: JSON.stringify(policy.criteria, null, 2),
            rulesText: JSON.stringify(policy.rules, null, 2),
          }
        : EMPTY_POLICY,
    );
    setPolicyOpen(true);
  };

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-brand-600" aria-hidden />
            <h2 className="text-sm font-bold text-ink-950">Pengaturan sistem</h2>
          </div>
          <Badge tone="warning">Kebijakan D-008 belum final</Badge>
        </div>
      ) : (
        <PageHeader
          eyebrow="Administrasi"
          title="Pengaturan sistem"
          description="Konfigurasi kebijakan operasional yang tersimpan di basis data. Perubahan tercatat di audit log."
          actions={<Badge tone="warning">Kebijakan D-008 belum final</Badge>}
        />
      )}

      {hasPermission('notifications.manage') ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
              <Send className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink-950">Diagnostik Pengiriman Notifikasi</h2>
              <p className="mt-0.5 text-xs leading-5 text-ink-500">
                Pantau antrean dan status pengiriman notifikasi. Pusat notifikasi pengguna tetap
                tersedia melalui ikon lonceng di kanan atas.
              </p>
            </div>
          </div>
          <Link
            to="/manage/notification-deliveries"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50"
          >
            Buka diagnostik
          </Link>
        </Card>
      ) : null}

      {hasPermission('settings.manage') ? (
        <Card>
          <div className="flex items-center gap-2 border-b border-ink-100 p-4">
            <Settings2 className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-bold text-ink-950">Pengaturan umum</h2>
          </div>
          {settings.isError ? (
            <div className="p-4">
              <ErrorState
                message="Pengaturan tidak dapat dimuat."
                onRetry={() => settings.refetch()}
              />
            </div>
          ) : null}
          {settings.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          <div className="divide-y divide-ink-50">
            {settings.data?.items.map((item) => {
              const value = draft[item.key] ?? item.value;
              return (
                <div key={item.key} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_280px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-ink-900">{item.key}</p>
                      <Badge tone={item.source === 'DATABASE' ? 'info' : 'neutral'}>
                        {item.source}
                      </Badge>
                      {item.pendingDecision ? (
                        <Badge tone="warning">
                          <AlertTriangle className="h-3 w-3" />
                          Keputusan tertunda
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-ink-500">
                      {item.description}
                    </p>
                    {item.pendingDecision ? (
                      <p className="mt-1 text-[11px] leading-5 text-amber-700">
                        {item.pendingDecision}
                      </p>
                    ) : null}
                    {item.updatedAt ? (
                      <p className="mt-1 text-[10px] text-ink-400">
                        Diperbarui {formatDateTime(item.updatedAt)}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    {item.key === 'reservation.defaultApprovalMode' ? (
                      <Field label="Nilai">
                        <Select
                          value={String(value)}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [item.key]: event.target.value,
                            }))
                          }
                        >
                          <option value="ADMIN_APPROVAL">Persetujuan admin</option>
                          <option value="NOT_REQUIRED">Tanpa persetujuan</option>
                        </Select>
                      </Field>
                    ) : BOOLEAN_KEYS.has(item.key) ? (
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-3 py-2.5 text-sm">
                        <span className="font-semibold text-ink-700">
                          {value ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-sidebar"
                          checked={Boolean(value)}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [item.key]: event.target.checked,
                            }))
                          }
                        />
                      </label>
                    ) : (
                      <Field label="Nilai">
                        <Input
                          type="number"
                          min={0}
                          value={Number(value)}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [item.key]: Number(event.target.value),
                            }))
                          }
                        />
                      </Field>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-ink-100 p-4">
            {settingsError ? <Notice tone="danger">{settingsError}</Notice> : null}
            {settingsSaved && !settingsError ? (
              <Notice tone="success">Pengaturan tersimpan dan tercatat di audit log.</Notice>
            ) : null}
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setSettingsSaved(false);
                  saveSettings.mutate();
                }}
                loading={saveSettings.isPending}
                disabled={!settings.data}
              >
                <Save className="h-4 w-4" />
                Simpan pengaturan
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {hasPermission('policies.manage') ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-ink-950">Kebijakan akomodasi</h2>
            </div>
            <Button size="sm" variant="secondary" onClick={() => openPolicy(null)}>
              <Plus className="h-4 w-4" />
              Kebijakan baru
            </Button>
          </div>

          {policies.isError ? (
            <div className="p-4">
              <ErrorState
                message="Kebijakan tidak dapat dimuat."
                onRetry={() => policies.refetch()}
              />
            </div>
          ) : null}

          <div className="divide-y divide-ink-50">
            {policies.data?.items.map((policy) => (
              <div key={policy.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-ink-900">{policy.name}</p>
                    <Badge tone="neutral">{policy.code}</Badge>
                    <Badge tone={policy.isActive ? 'success' : 'danger'}>
                      {policy.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                    <Badge tone="info">
                      {APPROVAL_MODE_LABELS[policy.approvalMode] ?? policy.approvalMode}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-400">
                    Prioritas {policy.priority} · Diperbarui {formatDateTime(policy.updatedAt)}
                  </p>
                  <pre
                    className="mt-2 max-h-24 max-w-xl overflow-auto rounded-lg bg-ink-50 p-2 text-[10px] leading-4 text-ink-600 scrollbar-slim"
                    tabIndex={0}
                    aria-label="Pratinjau kriteria dan aturan kebijakan"
                  >
                    {JSON.stringify({ criteria: policy.criteria, rules: policy.rules }, null, 2)}
                  </pre>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openPolicy(policy)}>
                    Ubah
                  </Button>
                  <Button
                    size="sm"
                    variant={policy.isActive ? 'ghost' : 'subtle'}
                    onClick={() => togglePolicy.mutate(policy)}
                    loading={togglePolicy.isPending}
                  >
                    {policy.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                </div>
              </div>
            ))}
            {policies.data && policies.data.items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<SlidersHorizontal className="h-5 w-5" />}
                  title="Belum ada kebijakan"
                  description="Buat kebijakan akomodasi untuk mengatur mode persetujuan dan aturan alokasi."
                  action={
                    <Button size="sm" onClick={() => openPolicy(null)}>
                      <Plus className="h-4 w-4" />
                      Kebijakan baru
                    </Button>
                  }
                />
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Modal
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title={editingPolicy ? 'Ubah kebijakan' : 'Kebijakan baru'}
        description="Criteria dan rules disimpan sebagai JSON. Gunakan struktur yang sudah disepakati tim operasional."
        size="lg"
      >
        <div className="space-y-4">
          {!editingPolicy ? (
            <Field label="Kode kebijakan" hint="Huruf kapital, angka, tanda hubung atau garis bawah.">
              <Input
                value={policyForm.code}
                onChange={(event) =>
                  setPolicyForm((current) => ({ ...current, code: event.target.value }))
                }
                placeholder="DORM_PRIORITY_CREW"
              />
            </Field>
          ) : (
            <div className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
              Kode kebijakan: <span className="font-mono font-semibold">{policyForm.code}</span>
            </div>
          )}
          <Field label="Nama kebijakan">
            <Input
              value={policyForm.name}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Prioritas kru operasional"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Prioritas">
              <Input
                type="number"
                min={1}
                max={1000}
                value={policyForm.priority}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    priority: Number(event.target.value) || 1,
                  }))
                }
              />
            </Field>
            <Field label="Mode persetujuan">
              <Select
                value={policyForm.approvalMode}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    approvalMode: event.target.value as PolicyFormState['approvalMode'],
                  }))
                }
              >
                <option value="ADMIN_APPROVAL">Persetujuan admin</option>
                <option value="NOT_REQUIRED">Tanpa persetujuan</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={policyForm.isActive ? 'active' : 'inactive'}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    isActive: event.target.value === 'active',
                  }))
                }
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </Select>
            </Field>
          </div>
          <Field label="Criteria (JSON)">
            <Textarea
              rows={5}
              className="font-mono text-xs"
              value={policyForm.criteriaText}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, criteriaText: event.target.value }))
              }
            />
          </Field>
          <Field label="Rules (JSON)">
            <Textarea
              rows={5}
              className="font-mono text-xs"
              value={policyForm.rulesText}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, rulesText: event.target.value }))
              }
            />
          </Field>
          {policyError ? <Notice tone="danger">{policyError}</Notice> : null}
          <div className={cn('flex justify-end gap-2')}>
            <Button variant="secondary" onClick={() => setPolicyOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => savePolicy.mutate()} loading={savePolicy.isPending}>
              <Save className="h-4 w-4" />
              Simpan kebijakan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function SettingsPage() {
  return <SettingsPanel />;
}
