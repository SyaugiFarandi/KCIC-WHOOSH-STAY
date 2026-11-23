import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { PermissionCode } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { FullPageLoader } from '../components/ui';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { me, isLoading, isError } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;
  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand-50 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-ink-800">Tidak dapat memeriksa sesi</p>
          <p className="mt-1 text-sm text-ink-500">
            Pastikan API Whoosh Stay berjalan, lalu muat ulang halaman.
          </p>
        </div>
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}

export function PermissionRoute({
  permission,
  children,
}: {
  permission: PermissionCode;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}

export function PortalLanding() {
  const { isManagementUser } = useAuth();
  return <Navigate to={isManagementUser ? '/manage/dashboard' : '/crew'} replace />;
}
