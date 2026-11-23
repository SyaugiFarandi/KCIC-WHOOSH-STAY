import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROLE_CODES,
  ROLE_LABELS,
  SCOPE_LABELS,
  SCOPE_TYPES,
  type AuditLogEntry,
  type RoleCode,
  type RoleSummary,
  type ScopeType,
} from '@whoosh/shared';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  KeyRound,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { SettingsPanel } from './SettingsPage';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  type DataTableColumn,
} from '../components/ui';
import { useListParams } from '../hooks/useListParams';
import { useUrlSyncedSearch } from '../hooks/useUrlSyncedSearch';
import { apiRequest, ApiError, queryString } from '../lib/api';
import { formatDateTime, humanize, initials } from '../lib/format';
import type { AdminUser, Paged, ScopeOptions } from '../lib/types';

interface DraftAssignment {
  key: string;
  roleCode: RoleCode;
  scopeType: ScopeType;
  scopeId: string;
}

const SCOPE_WITH_ID: ScopeType[] = ['DORMITORY', 'BUILDING'];

function draftFromUser(user: AdminUser): DraftAssignment[] {
  return user.roles.map((role, index) => ({
    key: `${role.roleCode}-${role.scopeType}-${role.scopeId ?? index}-${index}`,
    roleCode: role.roleCode as RoleCode,
    scopeType: role.scopeType as ScopeType,
    scopeId: role.scopeId ?? '',
  }));
}

function validateAssignments(assignments: DraftAssignment[]): string | null {
  const seen = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.roleCode === 'SYSTEM_ADMIN' && assignment.scopeType !== 'GLOBAL') {
      return 'SYSTEM_ADMIN harus menggunakan scope GLOBAL.';
    }
    if (SCOPE_WITH_ID.includes(assignment.scopeType) && !assignment.scopeId) {
      return `Scope ${SCOPE_LABELS[assignment.scopeType]} membutuhkan pilihan unit.`;
    }
    if (!SCOPE_WITH_ID.includes(assignment.scopeType) && assignment.scopeId) {
      return `Scope ${SCOPE_LABELS[assignment.scopeType]} tidak boleh memiliki unit.`;
    }
    const key = `${assignment.roleCode}:${assignment.scopeType}:${assignment.scopeId}`;
    if (seen.has(key)) return 'Terdapat penugasan peran duplikat.';
    seen.add(key);
  }
  return null;
}

type AccessTab = 'users' | 'roles' | 'audit' | 'settings';

export function UsersPage() {
  const { me, hasPermission } = useAuth();
  const canViewSettings =
    hasPermission('settings.manage') ||
    hasPermission('policies.manage') ||
    hasPermission('notifications.manage');
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: AccessTab =
    rawTab === 'roles' || rawTab === 'audit' || (rawTab === 'settings' && canViewSettings)
      ? rawTab
      : 'users';

  const setTab = (next: AccessTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keamanan"
        title="Pengguna & hak akses"
        description="Kelola akun, peran, scope akses, pengaturan sistem, dan telusuri aktivitas sensitif. Semua perubahan divalidasi di server dan dicatat pada log audit."
        actions={<Badge tone="brand">{me?.roles.length ?? 0} peran pada sesi ini</Badge>}
      />

      <Tabs
        ariaLabel="Bagian pengguna dan hak akses"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'users', label: 'Pengguna', icon: <UsersRound className="h-3.5 w-3.5" /> },
          { value: 'roles', label: 'Role & Akses', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          { value: 'audit', label: 'Log Aktivitas', icon: <Activity className="h-3.5 w-3.5" /> },
          ...(canViewSettings
            ? [
                {
                  value: 'settings' as const,
                  label: 'Pengaturan',
                  icon: <Settings2 className="h-3.5 w-3.5" />,
                },
              ]
            : []),
        ]}
      />

      {tab === 'users' ? <UsersPanel /> : null}
      {tab === 'roles' ? <RolesPanel /> : null}
      {tab === 'audit' ? <AccessAuditPanel /> : null}
      {tab === 'settings' ? <SettingsPanel embedded /> : null}
    </div>
  );
}

function UsersPanel() {
  const { me, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const params = useListParams({ q: '', role: '', status: '', page: '1', pageSize: '10' });
  const { value: search, setValue: setSearch } = useUrlSyncedSearch(
    params.values.q,
    (q) => params.setFilters({ q }),
  );
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'DISABLED' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSelected([]);
  }, [params.values]);

  const canManageRoles = hasPermission('roles.manage');
  const canManageUsers = hasPermission('users.manage');
  const canEdit = canManageRoles || canManageUsers;

  const users = useQuery({
    queryKey: ['admin', 'users', params.values],
    queryFn: () =>
      apiRequest<Paged<AdminUser>>(
        `/api/v1/admin/users${queryString({
          q: params.values.q,
          role: params.values.role,
          status: params.values.status,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const pageIds = users.data?.items.map((user) => user.id) ?? [];
  const selectableIds = pageIds.filter((id) => id !== me?.user.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  const bulk = useMutation({
    mutationFn: (status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') =>
      apiRequest<{ updated: number }>('/api/v1/admin/users/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ userIds: selected, status }),
      }),
    onSuccess: (data, status) => {
      setBulkStatus(null);
      setSelected([]);
      setBulkError(null);
      setBulkFeedback(`${data.updated} akun diperbarui menjadi ${status}.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (cause) => setBulkError(cause instanceof ApiError ? cause.message : 'Aksi massal gagal.'),
  });

  const toggleAll = () => {
    setSelected(allSelected ? [] : selectableIds);
  };
  const toggleOne = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const columns: Array<DataTableColumn<AdminUser>> = [
    {
      key: 'select',
      className: 'w-10',
      header: (
        <input
          type="checkbox"
          aria-label="Pilih semua akun pada halaman ini"
          checked={allSelected}
          disabled={!canManageUsers || selectableIds.length === 0}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-200"
        />
      ),
      render: (user) => (
        <input
          type="checkbox"
          aria-label={`Pilih ${user.displayName}`}
          checked={selected.includes(user.id)}
          disabled={!canManageUsers || user.id === me?.user.id}
          onChange={() => toggleOne(user.id)}
          className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-200"
        />
      ),
    },
    {
      key: 'user',
      header: 'Pengguna',
      render: (user) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
            {initials(user.displayName)}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">{user.displayName}</p>
            <p className="max-w-[210px] truncate text-[11px] text-ink-400" title={user.email}>
              {user.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'employee',
      header: 'Karyawan',
      render: (user) => <span className="text-xs text-ink-600">{user.employeeName ?? '—'}</span>,
    },
    {
      key: 'roles',
      header: 'Peran & scope',
      render: (user) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <span className="text-[11px] text-ink-400">Belum ada peran</span>
          ) : (
            user.roles.map((role) => (
              <span
                key={`${user.id}-${role.roleCode}-${role.scopeType}-${role.scopeId ?? ''}`}
                className="rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-600"
                title={`${ROLE_LABELS[role.roleCode]} · ${SCOPE_LABELS[role.scopeType]}`}
              >
                {ROLE_LABELS[role.roleCode] ?? role.roleCode}
                <span className="text-ink-400">
                  {role.scopeType === 'GLOBAL'
                    ? ''
                    : ` · ${SCOPE_LABELS[role.scopeType] ?? role.scopeType}`}
                </span>
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => <StatusBadge status={user.status} />,
    },
    {
      key: 'lastLogin',
      header: 'Login terakhir',
      className: 'whitespace-nowrap',
      render: (user) => (
        <span className="text-xs text-ink-500">
          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Belum pernah'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (user) => (
        <Button
          size="sm"
          variant="secondary"
          className="whitespace-nowrap"
          disabled={!canEdit}
          onClick={() => setEditing(user)}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Kelola akses
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {bulkFeedback ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
          <span>{bulkFeedback}</span>
          <button type="button" className="font-semibold" onClick={() => setBulkFeedback(null)}>
            Tutup
          </button>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            className="relative w-full lg:max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              params.setFilters({ q: search.trim() });
            }}
          >
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari email, nama, atau karyawan"
              aria-label="Cari pengguna"
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={params.values.role}
              onChange={(event) => params.setFilters({ role: event.target.value })}
              aria-label="Filter peran"
              className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Semua peran</option>
              {ROLE_CODES.map((code) => (
                <option key={code} value={code}>
                  {ROLE_LABELS[code]}
                </option>
              ))}
            </select>
            <select
              value={params.values.status}
              onChange={(event) => params.setFilters({ status: event.target.value })}
              aria-label="Filter status akun"
              className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Semua status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="SUSPENDED">Ditangguhkan</option>
              <option value="DISABLED">Nonaktif</option>
            </select>
            <span className="text-xs text-ink-400">
              {users.data ? `${users.data.pagination.total} pengguna` : 'Memuat…'}
            </span>
          </div>
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-col gap-2 border-b border-ink-100 bg-brand-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-brand-900">
              {selected.length} akun dipilih
              {selected.includes(me?.user.id ?? '') ? ' (akun sendiri tidak diikutkan untuk nonaktif)' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!canManageUsers || bulk.isPending}
                onClick={() => {
                  setBulkError(null);
                  setBulkStatus('ACTIVE');
                }}
              >
                Aktifkan
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canManageUsers || bulk.isPending}
                onClick={() => {
                  setBulkError(null);
                  setBulkStatus('SUSPENDED');
                }}
              >
                Tangguhkan
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={!canManageUsers || bulk.isPending}
                onClick={() => {
                  setBulkError(null);
                  setBulkStatus('DISABLED');
                }}
              >
                Nonaktifkan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Bersihkan
              </Button>
            </div>
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={users.data?.items ?? []}
          rowKey={(user) => user.id}
          ariaLabel="Tabel pengguna"
          loading={users.isLoading}
          error={
            users.isError
              ? users.error instanceof ApiError && users.error.status === 403
                ? 'Akun Anda tidak memiliki scope GLOBAL untuk administrasi pengguna.'
                : 'Daftar pengguna tidak dapat dimuat.'
              : null
          }
          onRetry={() => users.refetch()}
          emptyTitle="Tidak ada pengguna yang cocok"
          emptyDescription="Ubah kata kunci atau filter peran untuk menemukan pengguna."
          emptyIcon={<Search className="h-5 w-5" />}
          minWidthClass="min-w-[880px]"
          footer={
            users.data ? (
              <Pagination
                page={params.page}
                pageSize={params.pageSize}
                total={users.data.pagination.total}
                onPageChange={params.setPage}
                onPageSizeChange={params.setPageSize}
                fetching={users.isFetching}
              />
            ) : null
          }
        />
      </Card>

      <p className="px-1 text-[11px] leading-5 text-ink-400">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-brand-600" />
        Backend menolak perubahan peran pada akun sendiri dan menjamin minimal satu SYSTEM_ADMIN
        aktif tetap tersedia.
      </p>

      {editing ? (
        <ManageAccessModal
          user={editing}
          canManageRoles={canManageRoles}
          canManageUsers={canManageUsers}
          isSelf={editing.id === me?.user.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      ) : null}

      <Modal
        open={bulkStatus !== null}
        onClose={() => setBulkStatus(null)}
        title={`Ubah status ${selected.length} akun`}
        description="Status baru berlaku pada permintaan API berikutnya. Akun nonaktif tidak dapat mengakses API."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            {selected.length} akun akan diubah menjadi{' '}
            <Badge tone={bulkStatus === 'ACTIVE' ? 'success' : bulkStatus === 'SUSPENDED' ? 'warning' : 'danger'}>
              {bulkStatus ?? ''}
            </Badge>
            . Akun sendiri tidak dapat dinonaktifkan atau ditangguhkan.
          </p>
          {bulkError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
              {bulkError}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkStatus(null)} disabled={bulk.isPending}>
              Batal
            </Button>
            <Button
              variant={bulkStatus === 'ACTIVE' ? 'primary' : 'danger'}
              loading={bulk.isPending}
              onClick={() => {
                if (bulkStatus) bulk.mutate(bulkStatus);
              }}
            >
              Terapkan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const PERMISSION_MODULES: Array<{ label: string; prefixes: string[] }> = [
  { label: 'Dashboard', prefixes: ['dashboard.'] },
  { label: 'Reservasi', prefixes: ['reservations.'] },
  {
    label: 'Akomodasi',
    prefixes: ['dormitories.', 'buildings.', 'floors.', 'rooms.', 'beds.', 'facilities.', 'availability.', 'allocations.', 'stays.', 'photos.'],
  },
  { label: 'Housekeeping', prefixes: ['housekeeping.'] },
  { label: 'Maintenance', prefixes: ['maintenance.'] },
  { label: 'Roster', prefixes: ['roster.'] },
  { label: 'Laporan', prefixes: ['reports.'] },
  { label: 'Master Data', prefixes: ['employees.'] },
  {
    label: 'Pengguna & Hak Akses',
    prefixes: ['users.', 'roles.', 'policies.', 'audit.', 'notifications.', 'settings.', 'attachments.'],
  },
];

function permissionModule(permission: string): string {
  return (
    PERMISSION_MODULES.find((module) =>
      module.prefixes.some((prefix) => permission.startsWith(prefix)),
    )?.label ?? 'Lainnya'
  );
}

function permissionAction(permission: string): string {
  const action = permission.split('.').slice(1).join(' ');
  return humanize(action.replace(/[._]/g, ' ').toUpperCase());
}

function RolesPanel() {
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<RoleSummary | null>(null);
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiRequest<{ items: RoleSummary[] }>('/api/v1/admin/roles'),
    staleTime: 5 * 60_000,
  });
  const catalog = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => apiRequest<{ permissions: string[] }>('/api/v1/admin/permissions'),
    staleTime: 10 * 60_000,
  });

  const filtered = (roles.data?.items ?? []).filter((role) =>
    `${role.name} ${role.code} ${role.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const knownPermissions = new Set(catalog.data?.permissions ?? []);
  const rolePermissions = detail
    ? detail.permissions.filter((permission) => knownPermissions.size === 0 || knownPermissions.has(permission))
    : [];
  const grouped = PERMISSION_MODULES.map((module) => ({
    label: module.label,
    permissions: rolePermissions.filter((permission) => permissionModule(permission) === module.label),
  })).filter((group) => group.permissions.length > 0);

  const roleColumns: Array<DataTableColumn<RoleSummary>> = [
    {
      key: 'role',
      header: 'Peran',
      render: (role) => (
        <>
          <p className="font-semibold text-ink-900">{role.name}</p>
          <p className="font-mono text-[10px] text-ink-400">{role.code}</p>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Tipe',
      render: () => <Badge tone="neutral">Bawaan sistem</Badge>,
    },
    {
      key: 'scope',
      header: 'Cakupan',
      render: (role) => (
        <span className="text-xs text-ink-600">
          {role.code === 'SYSTEM_ADMIN' ? 'GLOBAL' : 'Sesuai penugasan'}
        </span>
      ),
    },
    {
      key: 'permissions',
      header: 'Jumlah izin',
      render: (role) => <span className="text-xs text-ink-600">{role.permissions.length}</span>,
    },
    {
      key: 'description',
      header: 'Deskripsi',
      render: (role) => (
        <span className="line-clamp-2 max-w-[280px] text-xs text-ink-500">
          {role.description ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (role) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDetail(role)}>
            Lihat izin
          </Button>
          <Link
            to={`/manage/users?tab=users&role=${role.code}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            <UsersRound className="h-3.5 w-3.5" />
            Pengguna
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            className="w-full lg:max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari peran atau deskripsi"
            aria-label="Cari peran"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{roles.data?.items.length ?? 0} peran</Badge>
            <Badge tone="neutral">{catalog.data?.permissions.length ?? 0} izin</Badge>
            <Button
              size="sm"
              variant="secondary"
              disabled={roles.isFetching}
              onClick={() => {
                void roles.refetch();
                void catalog.refetch();
              }}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${roles.isFetching ? 'animate-spin' : ''}`} />
              Muat ulang
            </Button>
          </div>
        </div>

        <DataTable
          columns={roleColumns}
          rows={filtered}
          rowKey={(role) => role.code}
          ariaLabel="Tabel peran dan akses"
          loading={roles.isLoading}
          error={roles.isError || catalog.isError ? 'Katalog peran tidak dapat dimuat.' : null}
          onRetry={() => {
            void roles.refetch();
            void catalog.refetch();
          }}
          emptyTitle="Peran tidak ditemukan"
          emptyDescription="Ubah kata kunci pencarian."
          emptyIcon={<Search className="h-5 w-5" />}
          minWidthClass="min-w-[760px]"
        />
      </Card>

      <Notice tone="warning">
        Peran kustom belum didukung arsitektur saat ini: kode peran divalidasi sebagai enum dan
        bundle izin dimuat dari seed. Tombol tambah peran dinonaktifkan sampai model peran dinamis
        tersedia. Perubahan peran pengguna dilakukan pada tab Pengguna.
      </Notice>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail ? `Izin peran — ${detail.name}` : 'Izin peran'}
        description={
          detail ? `${detail.code} · ${detail.permissions.length} izin terdaftar` : undefined
        }
      >
        {detail ? (
          <div className="space-y-4">
            {grouped.length === 0 ? (
              <p className="text-xs text-ink-400">
                Katalog izin tidak tersedia atau peran ini belum memiliki izin.
              </p>
            ) : (
              grouped.map((group) => (
                <section key={group.label} className="rounded-xl border border-ink-100">
                  <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-3.5 py-2">
                    <h3 className="text-xs font-bold text-ink-800">{group.label}</h3>
                    <Badge tone="neutral">{group.permissions.length} izin</Badge>
                  </div>
                  <div className="divide-y divide-ink-50">
                    {group.permissions.map((permission) => (
                      <div key={permission} className="flex items-center justify-between gap-2 px-3.5 py-2">
                        <code className="font-mono text-[11px] text-brand-700">{permission}</code>
                        <span className="text-[11px] text-ink-500">{permissionAction(permission)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
            <p className="text-[11px] text-ink-400">
              Izin berlaku di server melalui middleware permission. UI hanya menyembunyikan aksi yang
              tidak diizinkan; API tetap menolak permintaan tanpa izin.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

const AUDIT_ENTITY_TYPES = [
  'USER',
  'ROLE',
  'DORMITORY',
  'BUILDING',
  'FLOOR',
  'ROOM',
  'ROOM_TYPE',
  'BED',
  'FACILITY',
  'RESERVATION',
  'STAY',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'ROSTER',
  'MASTER_DATA',
] as const;

function AccessAuditPanel() {
  const params = useListParams({
    q: '',
    entityType: '',
    action: '',
    from: '',
    to: '',
    page: '1',
    pageSize: '15',
  });
  const { value: search, setValue: setSearch } = useUrlSyncedSearch(
    params.values.q,
    (q) => params.setFilters({ q }),
  );
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const logs = useQuery({
    queryKey: ['admin', 'audit-logs', 'access-tab', params.values],
    queryFn: () =>
      apiRequest<Paged<AuditLogEntry>>(
        `/api/v1/admin/audit-logs${queryString({
          q: params.values.q,
          entityType: params.values.entityType,
          action: params.values.action,
          from: params.values.from ? `${params.values.from}T00:00:00.000Z` : '',
          to: params.values.to ? `${params.values.to}T23:59:59.999Z` : '',
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const auditColumns: Array<DataTableColumn<AuditLogEntry>> = [
    {
      key: 'time',
      header: 'Waktu',
      className: 'whitespace-nowrap',
      render: (log) => (
        <span className="text-[11px] text-ink-500">{formatDateTime(log.createdAt)}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Pengguna',
      render: (log) => <span className="text-xs text-ink-700">{log.actorName ?? 'Sistem'}</span>,
    },
    {
      key: 'action',
      header: 'Aktivitas',
      render: (log) => <Badge tone="neutral">{log.action}</Badge>,
    },
    {
      key: 'module',
      header: 'Modul',
      render: (log) => <span className="text-xs text-ink-600">{humanize(log.entityType)}</span>,
    },
    {
      key: 'target',
      header: 'Target data',
      render: (log) => (
        <span className="font-mono text-[10px] text-ink-400">{log.entityId ?? '—'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Keterangan',
      render: (log) => (
        <span className="line-clamp-2 max-w-[240px] text-xs text-ink-500">{log.reason ?? '—'}</span>
      ),
    },
    {
      key: 'detail',
      header: 'Detail',
      align: 'right',
      render: (log) => (
        <Button size="sm" variant="ghost" onClick={() => setDetail(log)}>
          Lihat
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Log aktivitas bersifat append-only. Catatan dibuat oleh server pada setiap perubahan sensitif
        dan tidak dapat diubah dari antarmuka.
      </Notice>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <form
            className="relative w-full lg:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              params.setFilters({ q: search.trim() });
            }}
          >
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari aksi, modul, atau pengguna"
              aria-label="Cari log aktivitas"
            />
          </form>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Modul
              <Select
                value={params.values.entityType}
                onChange={(event) => params.setFilters({ entityType: event.target.value })}
                aria-label="Filter modul"
              >
                <option value="">Semua modul</option>
                {AUDIT_ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Aktivitas
              <Input
                value={params.values.action}
                onChange={(event) => params.setFilters({ action: event.target.value.toUpperCase() })}
                placeholder="USER_UPDATE"
                aria-label="Filter aksi"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Dari
              <Input
                type="date"
                value={params.values.from}
                onChange={(event) => params.setFilters({ from: event.target.value })}
                aria-label="Tanggal mulai"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Sampai
              <Input
                type="date"
                value={params.values.to}
                onChange={(event) => params.setFilters({ to: event.target.value })}
                aria-label="Tanggal akhir"
              />
            </label>
          </div>
        </div>

        <DataTable
          columns={auditColumns}
          rows={logs.data?.items ?? []}
          rowKey={(log) => log.id}
          ariaLabel="Tabel log aktivitas akses"
          loading={logs.isLoading}
          error={
            logs.isError
              ? logs.error instanceof ApiError && logs.error.status === 403
                ? 'Akun Anda tidak memiliki scope GLOBAL untuk membaca log audit.'
                : 'Log aktivitas tidak dapat dimuat.'
              : null
          }
          onRetry={() => logs.refetch()}
          emptyTitle="Tidak ada aktivitas pada filter ini"
          emptyDescription="Ubah rentang tanggal, modul, atau kata kunci pencarian."
          emptyIcon={<Activity className="h-5 w-5" />}
          minWidthClass="min-w-[900px]"
          footer={
            logs.data ? (
              <Pagination
                page={params.page}
                pageSize={params.pageSize}
                total={logs.data.pagination.total}
                onPageChange={params.setPage}
                onPageSizeChange={params.setPageSize}
                fetching={logs.isFetching}
                itemLabel="aktivitas"
              />
            ) : null
          }
        />
      </Card>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        size="lg"
        title="Detail aktivitas"
        description={detail ? `${detail.action} · ${formatDateTime(detail.createdAt)}` : undefined}
      >
        {detail ? (
          <div className="space-y-4 text-xs">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Pengguna</dt>
                <dd className="mt-1 text-ink-800">{detail.actorName ?? 'Sistem'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Modul</dt>
                <dd className="mt-1 text-ink-800">{humanize(detail.entityType)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Target</dt>
                <dd className="mt-1 break-all font-mono text-[10px] text-ink-600">
                  {detail.entityId ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Request ID</dt>
                <dd className="mt-1 break-all font-mono text-[10px] text-ink-600">
                  {detail.requestId ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">IP</dt>
                <dd className="mt-1 font-mono text-[10px] text-ink-600">
                  {detail.ipAddress ?? 'Tidak dicatat'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Keterangan</dt>
                <dd className="mt-1 text-ink-600">{detail.reason ?? '—'}</dd>
              </div>
            </dl>
            {detail.beforeData ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                  Data sebelum
                </p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-xl bg-ink-950 p-3 text-[10px] leading-5 text-ink-100">
                  {JSON.stringify(detail.beforeData, null, 2)}
                </pre>
              </div>
            ) : null}
            {detail.afterData ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                  Data sesudah
                </p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-xl bg-ink-950 p-3 text-[10px] leading-5 text-ink-100">
                  {JSON.stringify(detail.afterData, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ManageAccessModal({
  user,
  canManageRoles,
  canManageUsers,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  canManageRoles: boolean;
  canManageUsers: boolean;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [status, setStatus] = useState(user.status);
  const [draft, setDraft] = useState<DraftAssignment[]>(() => draftFromUser(user));
  const [error, setError] = useState<string | null>(null);

  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiRequest<{ items: RoleSummary[] }>('/api/v1/admin/roles'),
    staleTime: 5 * 60_000,
  });
  const scopeOptions = useQuery({
    queryKey: ['admin', 'scope-options'],
    queryFn: () => apiRequest<ScopeOptions>('/api/v1/admin/scope-options'),
    staleTime: 5 * 60_000,
    enabled: canManageRoles,
  });

  const roleMeta = useMemo(
    () => new Map(roles.data?.items.map((role) => [role.code, role]) ?? []),
    [roles.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (canManageUsers && (displayName.trim() !== user.displayName || status !== user.status)) {
        await apiRequest<AdminUser>(`/api/v1/admin/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ displayName: displayName.trim(), status }),
        });
      }
      if (canManageRoles && !isSelf) {
        const assignments = draft.map((assignment) => ({
          roleCode: assignment.roleCode,
          scopeType: assignment.scopeType,
          scopeId: SCOPE_WITH_ID.includes(assignment.scopeType) ? assignment.scopeId : null,
        }));
        await apiRequest<AdminUser>(`/api/v1/admin/users/${user.id}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ assignments }),
        });
      }
    },
    onSuccess: onSaved,
    onError: (cause) => {
      setError(cause instanceof ApiError ? cause.message : 'Perubahan tidak dapat disimpan.');
    },
  });

  const handleSave = () => {
    setError(null);
    if (canManageUsers) {
      if (displayName.trim().length < 2) {
        setError('Nama tampilan minimal 2 karakter.');
        return;
      }
      if (isSelf && status !== 'ACTIVE') {
        setError('Anda tidak dapat menonaktifkan akun sendiri.');
        return;
      }
    }
    if (canManageRoles && !isSelf) {
      const issue = validateAssignments(draft);
      if (issue) {
        setError(issue);
        return;
      }
    }
    save.mutate();
  };

  const updateDraft = (key: string, patch: Partial<DraftAssignment>) => {
    setDraft((current) =>
      current.map((assignment) => (assignment.key === key ? { ...assignment, ...patch } : assignment)),
    );
  };

  const canEditHere = canManageUsers || (canManageRoles && !isSelf);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Kelola akses — ${user.displayName}`}
      description={user.email}
    >
      <div className="space-y-6">
        {canManageUsers ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Akun</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Nama tampilan">
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </Field>
              <Field
                label="Status"
                hint={isSelf ? 'Akun sendiri tidak dapat dinonaktifkan.' : undefined}
              >
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as AdminUser['status'])}
                  disabled={isSelf}
                  className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
                >
                  <option value="ACTIVE">Aktif</option>
                  <option value="SUSPENDED">Ditangguhkan</option>
                  <option value="DISABLED">Nonaktif</option>
                </select>
              </Field>
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">
                Peran & scope
              </h3>
              <p className="mt-1 text-[11px] text-ink-400">
                Scope GLOBAL, SELF, dan ASSIGNED_TASK tidak membutuhkan unit.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canManageRoles || isSelf}
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  {
                    key: `new-${Date.now()}-${current.length}`,
                    roleCode: 'CREW',
                    scopeType: 'SELF',
                    scopeId: '',
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah
            </Button>
          </div>

          {isSelf ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800">
              Peran akun sendiri tidak dapat diubah dari antarmuka ini.
            </p>
          ) : null}

          <div className="mt-3 space-y-3">
            {draft.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-200 px-3.5 py-6 text-center text-xs text-ink-400">
                Pengguna ini belum memiliki peran. Tanpa peran, akses API ditolak secara default.
              </p>
            ) : null}

            {draft.map((assignment) => {
              const needsId = SCOPE_WITH_ID.includes(assignment.scopeType);
              const selectedRole = roleMeta.get(assignment.roleCode);
              return (
                <div
                  key={assignment.key}
                  className="rounded-xl border border-ink-100 bg-ink-50/40 p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-[1.2fr_0.9fr_1.2fr_auto]">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                        Peran
                      </span>
                      <select
                        value={assignment.roleCode}
                        disabled={!canManageRoles || isSelf}
                        onChange={(event) =>
                          updateDraft(assignment.key, {
                            roleCode: event.target.value as RoleCode,
                            ...(event.target.value === 'SYSTEM_ADMIN'
                              ? { scopeType: 'GLOBAL' as ScopeType, scopeId: '' }
                              : {}),
                          })
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800 disabled:bg-ink-100"
                      >
                        {ROLE_CODES.map((code) => (
                          <option key={code} value={code}>
                            {ROLE_LABELS[code]} ({code})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                        Scope
                      </span>
                      <select
                        value={assignment.scopeType}
                        disabled={!canManageRoles || isSelf || assignment.roleCode === 'SYSTEM_ADMIN'}
                        onChange={(event) =>
                          updateDraft(assignment.key, {
                            scopeType: event.target.value as ScopeType,
                            scopeId: '',
                          })
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800 disabled:bg-ink-100"
                      >
                        {SCOPE_TYPES.map((scope) => (
                          <option key={scope} value={scope}>
                            {SCOPE_LABELS[scope]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                        Unit
                      </span>
                      {needsId ? (
                        <select
                          value={assignment.scopeId}
                          disabled={!canManageRoles || isSelf}
                          onChange={(event) =>
                            updateDraft(assignment.key, { scopeId: event.target.value })
                          }
                          className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800 disabled:bg-ink-100"
                        >
                          <option value="">Pilih unit…</option>
                          {assignment.scopeType === 'DORMITORY'
                            ? scopeOptions.data?.dormitories.map((dormitory) => (
                                <option key={dormitory.id} value={dormitory.id}>
                                  {dormitory.code} — {dormitory.name}
                                </option>
                              ))
                            : scopeOptions.data?.buildings.map((building) => (
                                <option key={building.id} value={building.id}>
                                  {building.code} — {building.name}
                                </option>
                              ))}
                        </select>
                      ) : (
                        <span className="mt-1 flex h-9 items-center rounded-lg border border-dashed border-ink-200 px-2 text-[11px] text-ink-400">
                          Tidak diperlukan
                        </span>
                      )}
                    </label>

                    <div className="flex items-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManageRoles || isSelf}
                        onClick={() =>
                          setDraft((current) =>
                            current.filter((entry) => entry.key !== assignment.key),
                          )
                        }
                        aria-label="Hapus penugasan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {selectedRole ? (
                    <p className="mt-2 text-[10px] text-ink-400">
                      {selectedRole.description ?? 'Tidak ada deskripsi.'} · {selectedRole.permissions.length} izin
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {scopeOptions.isError ? (
            <p className="mt-2 text-[11px] text-red-600">
              Opsi scope unit tidak dapat dimuat. Periksa koneksi API.
            </p>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <p className="text-[11px] text-ink-400">
            <UserRound className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Perubahan berlaku pada permintaan API berikutnya.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
              Batal
            </Button>
            <Button onClick={handleSave} loading={save.isPending} disabled={!canEditHere}>
              Simpan perubahan
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
