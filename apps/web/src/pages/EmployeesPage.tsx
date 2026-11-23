import { useQuery } from '@tanstack/react-query';
import { Briefcase, Building2, CheckCircle2, RefreshCcw, Search, UserRound, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SYNTHETIC_EMPLOYEE_SOURCE } from '@whoosh/shared';
import type { EmployeeFilterOptions, EmployeeSummary, EmployeesSummary } from '@whoosh/shared';
import {
  Badge,
  Card,
  DataTable,
  DistributionBar,
  ErrorState,
  Field,
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
import { useListParams } from '../hooks/useListParams';
import { useUrlSyncedSearch } from '../hooks/useUrlSyncedSearch';
import { useAuth } from '../auth/AuthProvider';
import { EmployeeImportPanel } from '../components/EmployeeImportPanel';
import { apiRequest, queryString } from '../lib/api';
import { formatDate, formatDateTime, humanize } from '../lib/format';
import type { EmployeeSyncRunsResponse, Paged } from '../lib/types';

const columns: Array<DataTableColumn<EmployeeSummary>> = [
  {
    key: 'employee',
    header: 'Karyawan',
    render: (employee) => (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-200 text-ink-600">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <Link
            to={`/manage/employees/${employee.id}`}
            className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
          >
            {employee.fullName}
          </Link>
          <p className="text-[11px] text-ink-400">
            {employee.employeeCode} ·{' '}
            {employee.workEmail ? (
              <span
                className="inline-block max-w-[190px] truncate align-bottom"
                title={employee.workEmail}
              >
                {employee.workEmail}
              </span>
            ) : (
              'Email belum tersedia'
            )}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'department',
    header: 'Departemen',
    render: (employee) => (
      <span className="text-xs text-ink-600">{employee.departmentName ?? '—'}</span>
    ),
  },
  {
    key: 'division',
    header: 'Divisi',
    render: (employee) => (
      <span className="text-xs text-ink-600">{employee.divisionName ?? '—'}</span>
    ),
  },
  {
    key: 'position',
    header: 'Posisi',
    render: (employee) => (
      <span className="text-xs text-ink-600">{employee.positionName ?? '—'}</span>
    ),
  },
  {
    key: 'location',
    header: 'Lokasi',
    render: (employee) => (
      <span className="text-xs text-ink-600">{employee.homeStationCode ?? '—'}</span>
    ),
  },
  {
    key: 'joinDate',
    header: 'Bergabung',
    render: (employee) => (
      <span className="text-[11px] text-ink-500">
        {employee.joinDate ? formatDate(employee.joinDate) : '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (employee) => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={employee.employmentStatus} />
        <Badge
          tone={
            employee.eligibilityStatus === 'ELIGIBLE'
              ? 'success'
              : employee.eligibilityStatus === 'INELIGIBLE'
                ? 'danger'
                : 'neutral'
          }
        >
          {humanize(employee.eligibilityStatus)}
        </Badge>
      </div>
    ),
  },
  {
    key: 'source',
    header: 'Sumber',
    render: (employee) => (
      <Badge
        tone={
          employee.sourceSystem === 'DEMO' || employee.sourceSystem === SYNTHETIC_EMPLOYEE_SOURCE
            ? 'warning'
            : 'info'
        }
      >
        {employee.sourceSystem}
      </Badge>
    ),
  },
  {
    key: 'syncedAt',
    header: 'Sinkron terakhir',
    render: (employee) => (
      <span className="text-xs text-ink-500">
        {employee.syncedAt ? formatDateTime(employee.syncedAt) : '—'}
      </span>
    ),
  },
];

export function EmployeesPage({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth();
  const params = useListParams({
    q: '',
    location: '',
    department: '',
    position: '',
    page: '1',
    pageSize: '10',
  });
  const { value: search, setValue: setSearch } = useUrlSyncedSearch(
    params.values.q,
    (q) => params.setFilters({ q }),
  );

  const employees = useQuery({
    queryKey: ['employees', params.values],
    queryFn: () =>
      apiRequest<Paged<EmployeeSummary>>(
        `/api/v1/employees${queryString({
          q: params.values.q,
          homeStationCode: params.values.location,
          departmentCode: params.values.department,
          positionCode: params.values.position,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const filterOptions = useQuery({
    queryKey: ['employees', 'filter-options'],
    queryFn: () => apiRequest<EmployeeFilterOptions>('/api/v1/employees/filter-options'),
    staleTime: 60_000,
  });

  const summary = useQuery({
    queryKey: ['employees', 'summary'],
    queryFn: () => apiRequest<EmployeesSummary>('/api/v1/employees/summary'),
    staleTime: 60_000,
  });

  const syncRuns = useQuery({
    queryKey: ['employees', 'sync-runs'],
    queryFn: () =>
      apiRequest<EmployeeSyncRunsResponse>('/api/v1/admin/employees/sync-runs?pageSize=5'),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" aria-hidden />
            <h2 className="text-sm font-bold text-ink-950">Data karyawan</h2>
          </div>
          <Badge
              tone={
                syncRuns.data?.integrationStatus === 'MOCK'
                  ? 'warning'
                  : syncRuns.data?.integrationStatus === 'CONFIGURED'
                    ? 'info'
                    : 'neutral'
              }
            >
            {syncRuns.data ? `Sync: ${syncRuns.data.integrationStatus}` : 'Sync: —'}
          </Badge>
        </div>
      ) : (
        <PageHeader
          eyebrow="Master Data"
          title="Data karyawan"
          description="Data karyawan dari impor Excel terverifikasi (sumber IMPORT) dan sinkronisasi SDM. Integrasi HR mengikuti konfigurasi lingkungan."
          actions={
            <Badge
              tone={
                syncRuns.data?.integrationStatus === 'MOCK'
                  ? 'warning'
                  : syncRuns.data?.integrationStatus === 'CONFIGURED'
                    ? 'info'
                    : 'neutral'
              }
            >
              {syncRuns.data ? `Sync: ${syncRuns.data.integrationStatus}` : 'Sync: —'}
            </Badge>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total karyawan"
          value={summary.data?.total ?? '—'}
          hint={
            summary.data?.lastSyncedAt
              ? `Sinkron terakhir ${formatDateTime(summary.data.lastSyncedAt)}`
              : 'Belum pernah sinkron'
          }
          icon={<UserRound className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Aktif"
          value={summary.data?.byStatus.ACTIVE ?? '—'}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Departemen"
          value={summary.data?.departments ?? '—'}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          label="Posisi"
          value={summary.data?.positions ?? '—'}
          icon={<Briefcase className="h-5 w-5" />}
        />
      </div>

      {summary.data && (summary.data.bySource[SYNTHETIC_EMPLOYEE_SOURCE] ?? 0) > 0 ? (
        <Notice tone="warning">
          {summary.data.bySource[SYNTHETIC_EMPLOYEE_SOURCE]} profil bersumber SYNTHETIC adalah data
          uji untuk tampilan dan alur sistem — bukan karyawan KCIC sungguhan. Profil ini tidak
          memiliki akun login dan akan diganti melalui impor data HR resmi.
        </Notice>
      ) : null}

      {summary.data && summary.data.total > 0 ? (
        <DistributionBar
          title="Distribusi status kepegawaian"
          items={Object.entries(summary.data.byStatus).map(([status, value], index) => ({
            label: humanize(status),
            value,
            colorClass: `bg-chart-${(index % 6) + 1}`,
          }))}
        />
      ) : null}

      {summary.data && Object.keys(summary.data.byLocation).length > 0 ? (
        <DistributionBar
          title="Distribusi lokasi kerja"
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
                placeholder="Cari nama, kode, departemen, divisi, atau posisi"
                aria-label="Cari karyawan"
              />
            </form>
            <p className="text-xs text-ink-400">
              {employees.data ? `${employees.data.pagination.total} karyawan` : 'Memuat…'}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Lokasi kerja">
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
            <Field label="Departemen">
              <Select
                value={params.values.department}
                onChange={(event) => params.setFilters({ department: event.target.value })}
              >
                <option value="">Semua departemen</option>
                {(filterOptions.data?.departments ?? []).map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.name}
                    {department.status === 'UNCONFIRMED' ? ' (belum dikonfirmasi)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Posisi">
              <Select
                value={params.values.position}
                onChange={(event) => params.setFilters({ position: event.target.value })}
              >
                <option value="">Semua posisi</option>
                {(filterOptions.data?.positions ?? []).map((position) => (
                  <option key={position.code} value={position.code}>
                    {position.name}
                    {position.status === 'UNCONFIRMED' ? ' (belum dikonfirmasi)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={employees.data?.items ?? []}
          rowKey={(employee) => employee.id}
          ariaLabel="Tabel data karyawan"
          loading={employees.isLoading}
          error={employees.isError ? 'Daftar karyawan tidak dapat dimuat.' : null}
          onRetry={() => employees.refetch()}
          emptyTitle="Tidak ada karyawan yang cocok"
          emptyDescription="Ubah kata kunci pencarian atau jalankan sinkronisasi karyawan terlebih dahulu."
          emptyIcon={<Search className="h-5 w-5" />}
          minWidthClass="min-w-[1080px]"
          footer={
            employees.data ? (
              <Pagination
                page={params.page}
                pageSize={params.pageSize}
                total={employees.data.pagination.total}
                onPageChange={params.setPage}
                onPageSizeChange={params.setPageSize}
                fetching={employees.isFetching}
                itemLabel="karyawan"
              />
            ) : null
          }
        />
      </Card>

      {hasPermission('employees.import') ? <EmployeeImportPanel /> : null}

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-bold text-ink-950">Riwayat sinkronisasi</h2>
          </div>
          <span className="text-[11px] text-ink-400">5 eksekusi terakhir</span>
        </div>

        {syncRuns.isError ? (
          <div className="p-4">
            <ErrorState
              message="Riwayat sinkronisasi tidak dapat dimuat."
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
                    {run.fetchedCount} dibaca · {run.insertedCount} baru · {run.updatedCount} diperbarui ·{' '}
                    {run.failedCount} gagal
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
              Belum ada eksekusi sinkronisasi tercatat. Sinkronisasi dapat dijalankan melalui CLI
              <span className="mx-1 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px]">
                npm run employees:sync
              </span>
              menggunakan adapter pengembangan.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
