import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (/whoosh_stay_(test|e2e)/.test(databaseUrl)) {
  throw new Error('Rotasi password tidak boleh dijalankan terhadap database test/e2e.');
}

async function main(): Promise<void> {
  const email = (process.argv[2] ?? process.env.ROTATE_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Berikan email akun sebagai argumen: npm run rotate:admin -- <email>');
  }
  if (email.endsWith('@demo.whoosh-stay.local')) {
    throw new Error('Akun domain demo tidak boleh dirotasi menjadi akun operasional.');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User ${email} tidak ditemukan.`);
  if (user.status !== 'ACTIVE') throw new Error(`User ${email} tidak aktif; rotasi dibatalkan.`);

  const password = randomBytes(18).toString('base64url');

  const revoked = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
    const sessions = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'ADMIN_PASSWORD_ROTATION',
        entityType: 'USER',
        entityId: user.id,
        reason: 'Exposed bootstrap credential rotated via CLI',
        afterData: { email, sessionsRevoked: sessions.count },
      },
    });
    return sessions.count;
  });

  const root = existsSync(resolve(process.cwd(), 'apps/api'))
    ? process.cwd()
    : resolve(process.cwd(), '../..');
  const secretsDir = resolve(root, '.secrets');
  mkdirSync(secretsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const secretFile = resolve(secretsDir, `admin-password-${stamp}.txt`);
  writeFileSync(secretFile, `${email}\n${password}\n`, { mode: 0o600 });

  console.log(`[rotate] password ${email} dirotasi; ${revoked} sesi dicabut.`);
  console.log(`[rotate] password baru disimpan di: ${secretFile}`);
  console.log('[rotate] File tersebut di-ignore git. Login dengan password itu, lalu segera ganti');
  console.log('[rotate] melalui halaman Profil > Keamanan Akun dan hapus file setelahnya.');
}

main()
  .catch((error) => {
    console.error('[rotate] gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });