import { execFileSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import { app, DEMO_ACCOUNTS } from './helpers.js';

const PREFIX = 'e2e-pw';
const PASSWORD = 'Kata-Sandi-Uji!2026-panjang';
const RUN = Date.now().toString(36);

async function createRealUser(
  suffix: string,
  options: { password?: string | null; status?: string; role?: boolean } = {},
) {
  const email = `${PREFIX}-${suffix}-${RUN}@whoosh-stay.test`;
  const role = options.role === false ? null : await prisma.role.findUnique({ where: { code: 'SYSTEM_ADMIN' } });
  const user = await prisma.user.create({
    data: {
      email,
      displayName: `Penguji ${suffix}`,
      status: options.status ?? 'ACTIVE',
      passwordHash:
        options.password === null ? null : await hashPassword(options.password ?? PASSWORD),
      ...(role
        ? { roles: { create: { roleId: role.id, scopeType: 'GLOBAL', scopeId: null } } }
        : {}),
    },
  });
  return user;
}

function runBootstrap(env: Record<string, string | undefined>) {
  const apiDir = resolve(__dirname, '../..');
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  try {
    const stdout = execFileSync(
      process.execPath,
      [resolve(apiDir, '../../node_modules/tsx/dist/cli.mjs'), 'src/database/bootstrap-admin.ts'],
      { cwd: apiDir, env: merged, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { status: 0, stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
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

describe('real password authentication', () => {
  it('logs in a real account, persists the session and updates lastLoginAt', async () => {
    const user = await createRealUser('login');
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/login')
      .send({ email: user.email.toUpperCase(), password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(user.email);
    expect(response.body.data.roles[0]).toMatchObject({ roleCode: 'SYSTEM_ADMIN', scopeType: 'GLOBAL' });
    expect(response.body.data.permissions.length).toBeGreaterThan(0);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.id).toBe(user.id);

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.lastLoginAt).toBeTruthy();
  });

  it('rejects wrong passwords and unknown emails with the same generic error', async () => {
    const user = await createRealUser('wrongpass');
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'password-salah-total' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Email atau password salah.');

    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `${PREFIX}-hantu-${RUN}@whoosh-stay.test`, password: PASSWORD });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe('Email atau password salah.');

    const audit = await prisma.auditLog.findMany({
      where: { action: 'AUTH_LOGIN_FAILED', entityId: user.id },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('refuses demo accounts and accounts without a password hash', async () => {
    const demo = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: DEMO_ACCOUNTS.admin, password: 'WhooshDemo!2026' });
    expect(demo.status).toBe(401);

    const hashless = await createRealUser('hashless', { password: null });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: hashless.email, password: PASSWORD });
    expect(response.status).toBe(401);
  });

  it('rejects inactive accounts and malformed payloads', async () => {
    const inactive = await createRealUser('inactive', { status: 'SUSPENDED' });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: inactive.email, password: PASSWORD });
    expect(response.status).toBe(403);

    const malformed = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bukan-email', password: PASSWORD });
    expect(malformed.status).toBe(400);

    const invalidJson = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.body.error.message).toBe('Body JSON tidak valid');
  });

  it('throttles repeated failed logins for the same account', async () => {
    const user = await createRealUser('throttle');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'salah-terus' });
      expect(response.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeTruthy();
  });

  it('hashes passwords with scrypt and never stores plaintext', async () => {
    const user = await createRealUser('hashcheck');
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.passwordHash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(stored?.passwordHash).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored?.passwordHash ?? null)).toBe(true);
    expect(await verifyPassword('salah', stored?.passwordHash ?? null)).toBe(false);
  });

  it('still verifies legacy scrypt hashes without recorded parameters', async () => {
    const salt = randomBytes(16).toString('hex');
    const legacy = `scrypt$${salt}$${scryptSync(PASSWORD, salt, 64).toString('hex')}`;
    expect(await verifyPassword(PASSWORD, legacy)).toBe(true);
    expect(await verifyPassword('salah', legacy)).toBe(false);
  });
});

describe('secure admin bootstrap CLI', () => {
  it('creates a GLOBAL SYSTEM_ADMIN with the provided password and audits it', async () => {
    const email = `${PREFIX}-boot-${RUN}@whoosh-stay.test`;
    const result = runBootstrap({
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_NAME: 'Admin Bootstrap Uji',
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(PASSWORD);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    expect(user?.displayName).toBe('Admin Bootstrap Uji');
    expect(user?.roles[0]).toMatchObject({ scopeType: 'GLOBAL', scopeId: null });
    expect(user?.roles[0].role.code).toBe('SYSTEM_ADMIN');
    expect(await verifyPassword(PASSWORD, user?.passwordHash ?? null)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ADMIN_BOOTSTRAP', entityId: user?.id },
    });
    expect(audit).toBeTruthy();

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('generates a one-time password when none is provided', async () => {
    const email = `${PREFIX}-bootgen-${RUN}@whoosh-stay.test`;
    const result = runBootstrap({
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: undefined,
    });
    expect(result.status).toBe(0);
    const match = result.stdout.match(/password \(hanya ditampilkan sekali\): (\S+)/);
    expect(match).toBeTruthy();
    const generated = match![1];
    expect(generated.length).toBeGreaterThanOrEqual(12);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: generated });
    expect(login.status).toBe(200);
  });

  it('never overwrites an existing account and rejects weak or demo input', async () => {
    const email = `${PREFIX}-bootdup-${RUN}@whoosh-stay.test`;
    const first = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: PASSWORD });
    expect(first.status).toBe(0);
    const before = await prisma.user.findUnique({ where: { email } });

    const second = runBootstrap({
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: 'Password-Baru!2026-xyz',
    });
    expect(second.status).toBe(1);
    const after = await prisma.user.findUnique({ where: { email } });
    expect(after?.passwordHash).toBe(before?.passwordHash);

    const weak = runBootstrap({
      BOOTSTRAP_ADMIN_EMAIL: `${PREFIX}-bootweak-${RUN}@whoosh-stay.test`,
      BOOTSTRAP_ADMIN_PASSWORD: 'pendek',
    });
    expect(weak.status).toBe(1);

    const demoDomain = runBootstrap({
      BOOTSTRAP_ADMIN_EMAIL: `${PREFIX}-bootdemo-${RUN}@demo.whoosh-stay.local`,
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    });
    expect(demoDomain.status).toBe(1);

    const missingEmail = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: undefined });
    expect(missingEmail.status).toBe(1);
  });
});