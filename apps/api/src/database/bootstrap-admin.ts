import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { writeAudit } from '../modules/audit/audit.js';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

const MIN_PASSWORD_LENGTH = 12;

async function main(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const displayName = (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrator').trim() || 'Administrator';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL wajib diisi dengan alamat email yang valid.');
  }
  if (email.endsWith('@demo.whoosh-stay.local')) {
    throw new Error('Akun bootstrap tidak boleh menggunakan domain demo.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(
      `User ${email} sudah ada. Bootstrap tidak menimpa kredensial atau peran akun existing.`,
    );
  }

  const provided = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (provided !== undefined && provided.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  }
  const generated = provided === undefined;
  const password = provided ?? randomBytes(18).toString('base64url');

  const role = await prisma.role.findUnique({ where: { code: 'SYSTEM_ADMIN' } });
  if (!role) {
    throw new Error('Role SYSTEM_ADMIN belum tersedia. Jalankan seed basis (db:seed) terlebih dahulu.');
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        displayName,
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    });
    await tx.userRole.create({
      data: { userId: created.id, roleId: role.id, scopeType: 'GLOBAL', scopeId: null },
    });
    return created;
  });

  await writeAudit({
    actorUserId: user.id,
    action: 'ADMIN_BOOTSTRAP',
    entityType: 'USER',
    entityId: user.id,
    afterData: { email, roleCode: 'SYSTEM_ADMIN', scopeType: 'GLOBAL' },
  });

  console.log(`[bootstrap] admin dibuat: ${email} (SYSTEM_ADMIN, cakupan GLOBAL)`);
  if (generated) {
    console.log(`[bootstrap] password (hanya ditampilkan sekali): ${password}`);
    console.log('[bootstrap] Simpan password ini di tempat aman; tidak dapat ditampilkan ulang.');
  } else {
    console.log('[bootstrap] password diambil dari BOOTSTRAP_ADMIN_PASSWORD (tidak ditampilkan).');
  }
}

main()
  .catch((error) => {
    console.error('[bootstrap] gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });