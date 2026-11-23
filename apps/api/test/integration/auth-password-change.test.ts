import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import { app } from './helpers.js';

const PREFIX = 'e2e-pwc';
const PASSWORD = 'Kata-Sandi-Uji!2026-panjang';
const NEW_PASSWORD = 'Sandi-Baru-Uji!2026-panjang';
const RUN = Date.now().toString(36);

async function createRealUser(suffix: string, options: { password?: string | null } = {}) {
  const email = `${PREFIX}-${suffix}-${RUN}@whoosh-stay.test`;
  return prisma.user.create({
    data: {
      email,
      displayName: `Penguji ${suffix}`,
      status: 'ACTIVE',
      passwordHash:
        options.password === null ? null : await hashPassword(options.password ?? PASSWORD),
    },
  });
}

afterEach(async () => {
  const rows = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  // audit_logs append-only: aktor yang tercatat audit tidak bisa dihapus (FK SetNull akan UPDATE baris audit).
  const actors = await prisma.auditLog.findMany({
    where: { actorUserId: { in: ids } },
    distinct: ['actorUserId'],
    select: { actorUserId: true },
  });
  const actorIds = actors
    .map((entry) => entry.actorUserId)
    .filter((id): id is string => id !== null);
  const deletable = ids.filter((id) => !actorIds.includes(id));
  if (deletable.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: deletable } } });
  }
  if (actorIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: actorIds } },
      data: { status: 'DISABLED', passwordHash: null, demoPasswordHash: null },
    });
  }
});

describe('password change endpoint', () => {
  it('changes the password, revokes other sessions, keeps the current one and audits it', async () => {
    const user = await createRealUser('ok');
    const current = request.agent(app);
    const other = request.agent(app);
    for (const agent of [current, other]) {
      const login = await agent
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD });
      expect(login.status).toBe(200);
    }

    const response = await current
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.data.changed).toBe(true);
    expect(response.body.data.otherSessionsRevoked).toBeGreaterThanOrEqual(1);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.passwordHash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(stored?.passwordHash).not.toContain(NEW_PASSWORD);
    expect(await verifyPassword(PASSWORD, stored?.passwordHash ?? null)).toBe(false);
    expect(await verifyPassword(NEW_PASSWORD, stored?.passwordHash ?? null)).toBe(true);

    const meCurrent = await current.get('/api/v1/auth/me');
    expect(meCurrent.status).toBe(200);
    const meOther = await other.get('/api/v1/auth/me');
    expect(meOther.status).toBe(401);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'AUTH_PASSWORD_CHANGE', entityId: user.id },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects a wrong current password and writes a failure audit', async () => {
    const user = await createRealUser('wrongcur');
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    const response = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'sandi-salah-total', newPassword: NEW_PASSWORD });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Password saat ini salah.');

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword(PASSWORD, stored?.passwordHash ?? null)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'AUTH_PASSWORD_CHANGE_FAILED', entityId: user.id },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects short new passwords and reuse of the current password', async () => {
    const user = await createRealUser('invalid');
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    const short = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'pendek' });
    expect(short.status).toBe(400);

    const same = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword(PASSWORD, stored?.passwordHash ?? null)).toBe(true);
  });

  it('requires an authenticated session', async () => {
    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(401);
  });

  it('refuses accounts without a local password hash', async () => {
    const user = await createRealUser('hashless', { password: null });
    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/dev-login').send({ email: user.email });
    expect(login.status).toBe(200);

    const response = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(400);
  });
});