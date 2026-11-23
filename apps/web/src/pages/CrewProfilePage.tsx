import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, SCOPE_LABELS } from '@whoosh/shared';
import { BadgeCheck, Fingerprint, KeyRound, Send, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Button, Card, Field, Input, Notice, PageHeader } from '../components/ui';
import { apiRequest } from '../lib/api';
import { formatDateTime, initials } from '../lib/format';

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest<{ changed: boolean; otherSessionsRevoked: number }>('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: (data) => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFormError(null);
      setSuccess(
        data.otherSessionsRevoked > 0
          ? `Password berhasil diganti. ${data.otherSessionsRevoked} sesi lain telah dikeluarkan.`
          : 'Password berhasil diganti.',
      );
    },
    onError: (error) => {
      setSuccess(null);
      setFormError(error instanceof Error ? error.message : 'Gagal mengganti password.');
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    if (newPassword.length < 12) {
      setFormError('Password baru minimal 12 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Konfirmasi password tidak cocok.');
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-bold text-ink-950">Keamanan akun</h2>
      </div>
      <p className="mt-1 text-xs text-ink-400">
        Ganti password login Anda. Sesi lain akan dikeluarkan otomatis setelah penggantian.
      </p>
      <form className="mt-4 space-y-3.5" onSubmit={handleSubmit}>
        <Field label="Password saat ini">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field label="Password baru" hint="Minimal 12 karakter.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <Field label="Konfirmasi password baru">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}
        <Button type="submit" loading={mutation.isPending} className="w-full">
          Ganti password
        </Button>
      </form>
    </Card>
  );
}

function TelegramLinkCard() {
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ['me-telegram'],
    queryFn: () => apiRequest<{ telegramChatId: string | null }>('/api/v1/auth/me/telegram'),
  });

  const savedChatId = current.data?.telegramChatId ?? '';

  useEffect(() => {
    setChatId(savedChatId);
  }, [savedChatId]);

  const mutation = useMutation({
    mutationFn: (value: string | null) =>
      apiRequest<{ telegramChatId: string | null }>('/api/v1/auth/me/telegram', {
        method: 'PUT',
        body: JSON.stringify({ chatId: value }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['me-telegram'], data);
      setChatId(data.telegramChatId ?? '');
      setFormError(null);
      setSuccess(
        data.telegramChatId
          ? 'Chat ID Telegram tersimpan.'
          : 'Tautan Telegram dihapus. Notifikasi Telegram tidak akan dikirim ke akun ini.',
      );
    },
    onError: (error) => {
      setSuccess(null);
      setFormError(error instanceof Error ? error.message : 'Gagal menyimpan Chat ID Telegram.');
    },
  });

  function saveChatId() {
    const value = chatId.trim();
    if (!/^-?\d{5,20}$/.test(value)) {
      setSuccess(null);
      setFormError('Chat ID Telegram harus berupa angka 5 sampai 20 digit.');
      return;
    }
    setFormError(null);
    mutation.mutate(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveChatId();
  }

  function handleUnlink() {
    setFormError(null);
    mutation.mutate(null);
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-bold text-ink-950">Notifikasi Telegram</h2>
      </div>
      <p className="mt-1 text-xs text-ink-400">
        Hubungkan Chat ID Telegram pribadi agar notifikasi reservasi bisa dikirim ke akun Anda. Chat ID
        bukan username; kirim pesan ke bot Telegram untuk melihat ID-nya.
      </p>
      <form className="mt-4 space-y-3.5" onSubmit={handleSubmit}>
        <Field label="Chat ID Telegram" hint="Contoh format: 123456789 atau -1001234567890.">
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder={current.isLoading ? 'Memuat…' : '123456789'}
            value={chatId}
            onChange={(event) => setChatId(event.target.value)}
            disabled={current.isLoading}
          />
        </Field>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" loading={mutation.isPending} className="flex-1">
            Simpan Chat ID
          </Button>
          {current.data?.telegramChatId ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handleUnlink}
              disabled={mutation.isPending}
            >
              Hapus tautan
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] leading-5 text-ink-400">
          Notifikasi Telegram baru benar-benar terkirim setelah administrator mengaktifkan kanal
          Telegram di pengaturan sistem.
        </p>
      </form>
    </Card>
  );
}

export function CrewProfilePage() {
  const { me } = useAuth();
  if (!me) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Profil Saya"
        title="Identitas dan akses"
        description="Informasi ini berasal dari sesi dan master karyawan yang tersinkronisasi. Perubahan data dikelola administrator."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="hero-grain relative px-6 py-7 text-white">
            <div className="login-pattern absolute inset-0 opacity-25" aria-hidden />
            <div className="relative flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold ring-1 ring-white/20">
                {initials(me.user.displayName)}
              </span>
              <div>
                <p className="text-xl font-bold">{me.user.displayName}</p>
                <p className="mt-1 text-sm text-white/60">{me.user.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="success">{me.user.status === 'ACTIVE' ? 'Akun aktif' : me.user.status}</Badge>
                  <Badge tone="neutral" className="border-white/15 bg-white/10 text-white/70">
                    {me.session.authMode === 'mock'
                      ? 'Demo auth'
                      : me.session.authMode === 'password'
                        ? 'Login email'
                        : 'SSO KCIC'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                Karyawan terhubung
              </p>
              <p className="mt-1.5 text-sm font-semibold text-ink-900">
                {me.user.employeeName ?? 'Belum terhubung'}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Employee ID: {me.user.employeeId ? me.user.employeeId.slice(0, 8) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                Sesi berlaku hingga
              </p>
              <p className="mt-1.5 text-sm font-semibold text-ink-900">
                {formatDateTime(me.session.expiresAt)}
              </p>
              <p className="mt-1 text-xs text-ink-400">Sesi berakhir otomatis</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                User ID
              </p>
              <p className="mt-1.5 font-mono text-xs text-ink-600">{me.user.id}</p>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-ink-950">Peran & scope</h2>
            </div>
            <div className="mt-4 space-y-2.5">
              {me.roles.map((role) => (
                <div
                  key={`${role.roleCode}-${role.scopeType}-${role.scopeId ?? ''}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/50 px-3.5 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <UserRound className="h-4 w-4 text-ink-400" />
                    <div>
                      <p className="text-xs font-semibold text-ink-800">{ROLE_LABELS[role.roleCode]}</p>
                      <p className="text-[10px] text-ink-400">{role.roleCode}</p>
                    </div>
                  </div>
                  <Badge tone="brand">{SCOPE_LABELS[role.scopeType]}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-ink-950">Izin efektif</h2>
            </div>
            <p className="mt-1 text-xs text-ink-400">{me.permissions.length} izin aktif</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {me.permissions.map((permission) => (
                <span
                  key={permission}
                  className="rounded-md bg-ink-100 px-1.5 py-1 font-mono text-[10px] text-ink-600"
                >
                  {permission}
                </span>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-5 text-emerald-800">
              <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Izin diverifikasi ulang oleh server pada setiap permintaan API.
            </p>
          </Card>

          {me.session.authMode === 'password' ? <ChangePasswordCard /> : null}
          <TelegramLinkCard />
        </div>
      </div>
    </div>
  );
}
