import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { Button, Card } from '../components/ui';

export function ForbiddenPage() {
  const { isManagementUser } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo variant="compact" />
        </div>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-ink-950">Akses ditolak</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Akun Anda tidak memiliki izin atau scope untuk membuka halaman ini. Hubungi administrator
          sistem bila akses memang dibutuhkan.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to={isManagementUser ? '/manage/dashboard' : '/crew'}>
            <Button>Kembali ke portal</Button>
          </Link>
          <Link to="/crew/profile">
            <Button variant="secondary">Profil saya</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo variant="compact" />
        </div>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-brand-600">
          404
        </p>
        <h1 className="mt-3 text-xl font-bold text-ink-950">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Tautan yang Anda buka tidak tersedia pada portal Whoosh Stay.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button>Ke portal</Button>
        </Link>
      </Card>
    </div>
  );
}
