import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react';
import type { AuthConfig, AuthMe } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button, Field, Input, Spinner, cn } from '../components/ui';
import { ApiError, apiRequest } from '../lib/api';

const MANAGEMENT_ROLES = new Set([
  'SYSTEM_ADMIN',
  'DORMITORY_MANAGER',
  'DORMITORY_ADMIN',
  'FRONT_DESK',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'AUDITOR',
]);

function resolveLanding(me: AuthMe, from: string): string {
  const isManagement = me.roles.some((role) => MANAGEMENT_ROLES.has(role.roleCode));
  if (from.startsWith('/manage') && !isManagement) return '/crew';
  if (from.startsWith('/crew') && isManagement) return '/manage/dashboard';
  return from;
}

function friendlyLoginError(error: unknown, passwordMode: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Terlalu banyak percobaan masuk. Tunggu beberapa saat lalu coba lagi.';
    }
    if (error.status === 0) {
      return 'Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.';
    }
    if (error.status === 401) {
      return passwordMode ? 'Email atau password salah.' : 'Username atau password salah.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Gagal masuk. Coba lagi.';
}

interface FieldErrors {
  username?: string;
  password?: string;
}

function LoginBackdrop() {
  return (
    <>
      <img
        src="/photos/login-railway-1792.webp"
        srcSet="/photos/login-railway-1024.webp 1024w, /photos/login-railway-1792.webp 1792w"
        sizes="100vw"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-[100%_50%] sm:object-center"
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/80"
        aria-hidden
      />
      <div className="absolute inset-0 login-vignette" aria-hidden />
    </>
  );
}

function LoginLoading() {
  return (
    <div
      className="relative flex min-h-screen min-h-[100dvh] items-center justify-center overflow-hidden bg-login-deep px-4"
      style={{ minHeight: '100dvh' }}
    >
      <LoginBackdrop />
      <div className="relative z-10 flex flex-col items-center gap-7 animate-rise">
        <img
          src="/brand/whoosh-stay-logo-on-dark.svg"
          alt="WHOOSH STAY — Crew Accommodation Platform"
          width={300}
          height={76}
          className="h-12 w-auto"
        />
        <Spinner />
      </div>
    </div>
  );
}

export function LoginPage() {
  const { me, isLoading, loginWithPassword, loginWithEmail, loginOidc, isLoggingIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const configQuery = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => apiRequest<AuthConfig>('/api/v1/auth/config'),
    staleTime: 60_000,
  });

  const oidcError = searchParams.get('error');
  const oidcMode = configQuery.data?.mode === 'oidc';
  const passwordMode = configQuery.data?.mode === 'password';

  if (isLoading) return <LoginLoading />;
  if (me) return <Navigate to={resolveLanding(me, from)} replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const identifier = username.trim();
    const nextErrors: FieldErrors = {};
    if (passwordMode) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        nextErrors.username = 'Masukkan alamat email yang valid.';
      }
    } else if (identifier.length < 3) {
      nextErrors.username = 'Masukkan username minimal 3 karakter.';
    }
    if (!password) nextErrors.password = 'Masukkan password Anda.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const account = passwordMode
        ? await loginWithEmail({ email: identifier, password })
        : await loginWithPassword({ username: identifier, password });
      navigate(resolveLanding(account, from), { replace: true });
    } catch (loginError) {
      setError(friendlyLoginError(loginError, passwordMode));
    }
  };

  const message =
    error ??
    (oidcError === 'account_not_provisioned'
      ? 'Akun SSO belum terdaftar di Whoosh Stay. Hubungi administrator.'
      : oidcError === 'account_inactive'
        ? 'Akun Anda tidak aktif.'
        : oidcError
          ? 'Proses masuk SSO tidak berhasil. Silakan coba lagi.'
          : null);

  return (
    <div
      className="relative flex min-h-screen min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-login-deep px-4 py-6 sm:px-6 sm:py-10"
      style={{ minHeight: '100dvh' }}
    >
      <LoginBackdrop />

      <main className="relative z-10 w-full max-w-[420px] animate-rise">
        <div className="rounded-[28px] bg-login-card/95 p-6 shadow-login-card ring-1 ring-white/50 backdrop-blur-md sm:p-8">
          <div className="flex justify-center">
            <img
              src="/brand/whoosh-stay-logo.svg"
              alt="WHOOSH STAY — Crew Accommodation Platform"
              width={300}
              height={76}
              className="h-12 w-auto sm:h-14"
            />
          </div>

          <div
            className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-ink-200 to-transparent"
            aria-hidden
          />

          <div className="mt-5 text-center">
            <h1 className="text-[1.65rem] font-bold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[1.8rem]">
              Selamat Datang Kembali
            </h1>
            <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-5 text-ink-500">
              Masuk dengan akun Anda untuk mengakses sistem WHOOSH STAY.
            </p>
          </div>

          {message ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-800"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{message}</span>
            </div>
          ) : null}

          {configQuery.isLoading ? (
            <div className="mt-8 flex justify-center py-6">
              <Spinner />
            </div>
          ) : oidcMode ? (
            <div className="mt-6 space-y-3">
              <Button variant="maroon" size="lg" className="w-full" onClick={() => loginOidc(from)}>
                <KeyRound className="h-4 w-4" />
                Masuk dengan SSO KCIC
              </Button>
              <p className="text-center text-[11px] leading-5 text-ink-400">
                Anda akan diarahkan ke penyedia identitas resmi. Sesi Whoosh Stay dibuat setelah
                verifikasi berhasil.
              </p>
              {configQuery.isError ? (
                <p className="text-center text-xs text-red-600">
                  Konfigurasi autentikasi tidak dapat dimuat. Pastikan API berjalan.
                </p>
              ) : null}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-3.5" noValidate>
              <Field label={passwordMode ? 'Email' : 'Username'} error={fieldErrors.username}>
                <Input
                  name="username"
                  type={passwordMode ? 'email' : 'text'}
                  autoComplete={passwordMode ? 'email' : 'username'}
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={passwordMode ? 'Masukkan email kerja' : 'Masukkan username'}
                  value={username}
                  disabled={isLoggingIn}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setFieldErrors((current) => ({ ...current, username: undefined }));
                    setError(null);
                  }}
                  aria-invalid={Boolean(fieldErrors.username)}
                  className="h-11"
                />
              </Field>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-ink-700"
                >
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    value={password}
                    disabled={isLoggingIn}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                      setError(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.password)}
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPassword}
                    className={cn(
                      'absolute right-1.5 top-1/2 mt-0.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700',
                    )}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <span className="mt-1 block text-xs text-red-600">{fieldErrors.password}</span>
                ) : null}
              </div>

              <Button
                type="submit"
                variant="maroon"
                size="lg"
                className="mt-1 w-full shadow-login-button"
                loading={isLoggingIn}
              >
                <LockKeyhole className="h-4 w-4" />
                Masuk
              </Button>
            </form>
          )}

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-300">
            WHOOSH STAY — Crew Accommodation Platform
          </p>
        </div>
      </main>

      <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto hidden w-[min(92vw,42rem)] px-4 text-center text-[10px] leading-4 text-white/60 text-shadow-photo [@media(max-height:760px)]:hidden sm:block">
        Aktivitas login dicatat dalam audit log.
      </p>
    </div>
  );
}
