import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { EmployeeDetail } from '@whoosh/shared';
import { Badge, Card, ErrorState, Notice, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { apiRequest } from '../lib/api';
import { formatDate, formatDateTime, humanize } from '../lib/format';

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium text-ink-400">{label}</dt>
      <dd className="text-sm font-semibold text-ink-800">{value}</dd>
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();

  const employee = useQuery({
    queryKey: ['employees', 'detail', id],
    queryFn: () => apiRequest<EmployeeDetail>(`/api/v1/employees/${id}`),
    enabled: Boolean(id),
  });

  if (employee.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (employee.isError || !employee.data) {
    return (
      <ErrorState
        message="Detail karyawan tidak dapat dimuat."
        onRetry={() => employee.refetch()}
      />
    );
  }

  const data = employee.data;
  const isSynthetic = data.sourceSystem === 'SYNTHETIC';

  return (
    <div className="space-y-6">
      <Link
        to="/manage/employees"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke data karyawan
      </Link>

      <PageHeader
        eyebrow="Master Data"
        title={data.fullName}
        description={`${data.employeeCode} · ${data.positionName ?? 'Posisi belum tersedia'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.employmentStatus} />
            <Badge tone={isSynthetic ? 'warning' : 'info'}>{data.sourceSystem}</Badge>
          </div>
        }
      />

      {isSynthetic ? (
        <Notice tone="warning">
          Profil ini adalah data sintetis untuk pengujian tampilan dan alur sistem — bukan karyawan
          KCIC sungguhan. Email menggunakan domain nonaktif example.invalid dan tidak memiliki akun
          login. Data akan diganti melalui impor HR resmi.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-bold text-ink-950">Organisasi</h2>
          </div>
          <dl className="divide-y divide-ink-50">
            <DetailRow label="Departemen" value={data.departmentName ?? '—'} />
            <DetailRow label="Divisi" value={data.divisionName ?? '—'} />
            <DetailRow label="Posisi" value={data.positionName ?? '—'} />
            <DetailRow label="Lokasi kerja" value={data.homeStationCode ?? '—'} />
            <DetailRow
              label="Atasan"
              value={
                data.supervisor ? (
                  <Link
                    to={`/manage/employees/${data.supervisor.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {data.supervisor.fullName} ({data.supervisor.employeeCode})
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <DetailRow label="Bawahan langsung" value={data.subordinateCount} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-bold text-ink-950">Kepegawaian</h2>
          <dl className="divide-y divide-ink-50">
            <DetailRow label="Status kepegawaian" value={<StatusBadge status={data.employmentStatus} />} />
            <DetailRow
              label="Status kelayakan hunian"
              value={humanize(data.eligibilityStatus)}
            />
            <DetailRow label="Tanggal bergabung" value={data.joinDate ? formatDate(data.joinDate) : '—'} />
            <DetailRow label="Email kerja" value={data.workEmail ?? '—'} />
            <DetailRow label="Sumber data" value={data.sourceSystem} />
            <DetailRow
              label="Sinkron terakhir"
              value={data.syncedAt ? formatDateTime(data.syncedAt) : 'Belum pernah sinkron'}
            />
            <DetailRow label="Dibuat" value={formatDateTime(data.createdAt)} />
            <DetailRow label="Diperbarui" value={formatDateTime(data.updatedAt)} />
          </dl>
        </Card>
      </div>
    </div>
  );
}