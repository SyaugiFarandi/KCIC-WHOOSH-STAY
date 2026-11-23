import { Router } from 'express';
import {
  ERROR_CODES,
  changePasswordSchema,
  demoLoginSchema,
  loginDevSchema,
  passwordLoginSchema,
  telegramChatLinkSchema,
  type AuthConfig,
  type AuthMe,
  type PermissionCode,
  type RoleCode,
  type ScopeType,
} from '@whoosh/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import {
  demoUsernameToEmail,
  hashDemoPassword,
  verifyDemoPassword,
} from '../../lib/demo-password.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  loginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess,
} from '../../lib/login-throttle.js';
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../middleware/errors.js';
import { requireAuth } from './middleware.js';
import {
  attachSessionCookie,
  clearSessionCookie,
  createSession,
  resolveRequestSession,
  resolveSessionToken,
  revokeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session.js';
import type { Principal } from './types.js';
import { beginOidcLogin, completeOidcLogin, OIDC_STATE_COOKIE } from './oidc.js';
import { writeAudit } from '../audit/audit.js';
import { getRequestContext } from '../../lib/context.js';
import { logger } from '../../lib/logger.js';

export const authRouter = Router();

const DEMO_ONLY = env.AUTH_MODE === 'mock' && env.NODE_ENV !== 'production';
const PASSWORD_LOGIN_ENABLED = env.AUTH_MODE === 'password' || DEMO_ONLY;
let dummyPasswordHashPromise: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyPasswordHashPromise ??= hashDemoPassword('demo-login-placeholder');
  return dummyPasswordHashPromise;
}

function toAuthMe(principal: Principal): AuthMe {
  return {
    user: {
      id: principal.user.id,
      email: principal.user.email,
      displayName: principal.user.displayName,
      status: principal.user.status as AuthMe['user']['status'],
      employeeId: principal.user.employeeId,
      employeeName: principal.user.employeeName,
    },
    roles: principal.roles.map((role) => ({
      roleCode: role.roleCode as RoleCode,
      scopeType: role.scopeType as ScopeType,
      scopeId: role.scopeId,
    })),
    permissions: principal.permissions as PermissionCode[],
    session: {
      expiresAt: principal.session.expiresAt.toISOString(),
      authMode: env.AUTH_MODE,
    },
  };
}

authRouter.get('/config', async (_req, res) => {
  const config: AuthConfig = { mode: env.AUTH_MODE };

  if (env.AUTH_MODE === 'mock' && env.NODE_ENV !== 'production') {
    const demoUsers = await prisma.user.findMany({
      where: { status: 'ACTIVE', email: { endsWith: '@demo.whoosh-stay.local' } },
      include: { roles: { include: { role: true } } },
      orderBy: { email: 'asc' },
    });
    config.demoAccounts = demoUsers.map((user) => ({
      email: user.email,
      displayName: user.displayName,
      roleCodes: user.roles.map((assignment) => assignment.role.code as RoleCode),
    }));
  }

  sendSuccess(res, config);
});

authRouter.get('/me', requireAuth, async (req, res) => {
  sendSuccess(res, toAuthMe(req.auth!));
});

authRouter.post('/dev-login', async (req, res) => {
  if (env.AUTH_MODE !== 'mock' || env.NODE_ENV === 'production') {
    throw new NotFoundError('Endpoint not available');
  }

  const input = validate(loginDevSchema, req.body);
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { employee: true, roles: { include: { role: true } } },
  });

  if (!user) throw new UnauthorizedError('Invalid demo account');
  if (user.status !== 'ACTIVE') throw new ForbiddenError('Account is not active');

  const session = await createSession(user.id, {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  attachSessionCookie(res, session.token, session.expiresAt);

  await writeAudit({
    actorUserId: user.id,
    action: 'AUTH_LOGIN',
    entityType: 'USER',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  const principal = await resolveSessionToken(session.token);
  if (!principal) throw new UnauthorizedError();

  sendSuccess(res, toAuthMe(principal));
});

authRouter.post('/demo-login', async (req, res) => {
  if (!DEMO_ONLY) {
    throw new NotFoundError('Endpoint not available');
  }

  const input = validate(demoLoginSchema, req.body);
  const email = demoUsernameToEmail(input.username);
  const isDemoDomain = email.endsWith('@demo.whoosh-stay.local');
  const user = isDemoDomain
    ? await prisma.user.findUnique({
        where: { email },
        include: { employee: true, roles: { include: { role: true } } },
      })
    : null;

  const passwordValid = await verifyDemoPassword(
    input.password,
    user?.demoPasswordHash ?? (await dummyPasswordHash()),
  );

  if (!isDemoDomain || !user || !passwordValid) {
    await writeAudit({
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'USER',
      entityId: user?.id ?? null,
      reason: 'Invalid demo credentials',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    throw new UnauthorizedError('Username atau password salah.');
  }

  if (user.status !== 'ACTIVE') throw new ForbiddenError('Akun tidak aktif.');

  const session = await createSession(user.id, {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  attachSessionCookie(res, session.token, session.expiresAt);

  await writeAudit({
    actorUserId: user.id,
    action: 'AUTH_LOGIN',
    entityType: 'USER',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  const principal = await resolveSessionToken(session.token);
  if (!principal) throw new UnauthorizedError();

  sendSuccess(res, toAuthMe(principal));
});

authRouter.post('/login', async (req, res) => {
  if (!PASSWORD_LOGIN_ENABLED) {
    throw new NotFoundError('Endpoint not available');
  }

  const input = validate(passwordLoginSchema, req.body);
  const email = input.email.trim().toLowerCase();
  const retryAfter = loginRetryAfterSeconds(email);
  if (retryAfter !== null) {
    res.set('Retry-After', String(retryAfter));
    throw new AppError(
      429,
      ERROR_CODES.RATE_LIMITED,
      'Terlalu banyak percobaan login untuk akun ini. Coba lagi nanti.',
    );
  }
  const user = await prisma.user.findUnique({
    where: { email },
    include: { employee: true, roles: { include: { role: true } } },
  });

  const passwordValid = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await dummyPasswordHash()),
  );

  if (!user || !user.passwordHash || !passwordValid) {
    recordLoginFailure(email);
    await writeAudit({
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'USER',
      entityId: user?.id ?? null,
      reason: 'Invalid password credentials',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    throw new UnauthorizedError('Email atau password salah.');
  }

  if (user.status !== 'ACTIVE') {
    recordLoginFailure(email);
    throw new ForbiddenError('Akun tidak aktif.');
  }

  recordLoginSuccess(email);
  const session = await createSession(user.id, {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  attachSessionCookie(res, session.token, session.expiresAt);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await writeAudit({
    actorUserId: user.id,
    action: 'AUTH_LOGIN',
    entityType: 'USER',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  const principal = await resolveSessionToken(session.token);
  if (!principal) throw new UnauthorizedError();

  sendSuccess(res, toAuthMe(principal));
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  if (!PASSWORD_LOGIN_ENABLED) {
    throw new NotFoundError('Endpoint not available');
  }

  const input = validate(changePasswordSchema, req.body);
  const principal = req.auth!;
  const user = await prisma.user.findUnique({ where: { id: principal.user.id } });

  if (!user?.passwordHash) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Akun ini tidak memiliki password lokal. Hubungi administrator.',
    );
  }

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    await writeAudit({
      actorUserId: user.id,
      action: 'AUTH_PASSWORD_CHANGE_FAILED',
      entityType: 'USER',
      entityId: user.id,
      reason: 'Current password mismatch',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    throw new UnauthorizedError('Password saat ini salah.');
  }

  if (input.newPassword === input.currentPassword) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Password baru tidak boleh sama dengan password saat ini.',
    );
  }

  const nextPasswordHash = await hashPassword(input.newPassword);
  const { count: otherSessionsRevoked } = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: nextPasswordHash },
    });
    const revoked = await tx.session.updateMany({
      where: { userId: user.id, id: { not: principal.session.id }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'AUTH_PASSWORD_CHANGE',
        entityType: 'USER',
        entityId: user.id,
        requestId: getRequestContext()?.requestId ?? null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    });
    return revoked;
  });

  sendSuccess(res, { changed: true, otherSessionsRevoked });
});

authRouter.get('/me/telegram', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.user.id },
    select: { telegramChatId: true },
  });

  if (!user) throw new NotFoundError('User not found');

  sendSuccess(res, { telegramChatId: user.telegramChatId });
});

authRouter.put('/me/telegram', requireAuth, async (req, res) => {
  const input = validate(telegramChatLinkSchema, req.body);
  const principal = req.auth!;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: principal.user.id },
      data: { telegramChatId: input.chatId },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: principal.user.id,
        action: 'USER_TELEGRAM_CHAT_UPDATED',
        entityType: 'USER',
        entityId: principal.user.id,
        afterData: { telegramLinked: input.chatId !== null },
        requestId: getRequestContext()?.requestId ?? null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    });
  });

  sendSuccess(res, { telegramChatId: input.chatId });
});

authRouter.post('/logout', async (req, res) => {
  const principal = await resolveRequestSession(req);
  if (principal) {
    await revokeSession(principal.session.id);
    await writeAudit({
      actorUserId: principal.user.id,
      action: 'AUTH_LOGOUT',
      entityType: 'USER',
      entityId: principal.user.id,
    });
  }
  clearSessionCookie(res);
  sendSuccess(res, { loggedOut: true });
});

authRouter.get('/login', async (req, res) => {
  if (env.AUTH_MODE !== 'oidc') throw new NotFoundError('OIDC authentication is not enabled');

  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  const { redirectUrl, stateCookie } = await beginOidcLogin(returnTo);
  res.cookie(OIDC_STATE_COOKIE, stateCookie, {
    ...sessionCookieOptions(new Date(Date.now() + 10 * 60 * 1000)),
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(redirectUrl);
});

authRouter.get('/callback', async (req, res) => {
  if (env.AUTH_MODE !== 'oidc') throw new NotFoundError('OIDC authentication is not enabled');

  const currentUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
  const stateCookie = req.cookies?.[OIDC_STATE_COOKIE] as string | undefined;

  try {
    const identity = await completeOidcLogin(currentUrl, stateCookie, req.query.state as string | undefined);
    clearSessionCookie(res);
    res.clearCookie(OIDC_STATE_COOKIE, sessionCookieOptions());

    let user = await prisma.user.findFirst({
      where: { oidcIssuer: identity.issuer, oidcSubject: identity.subject },
    });
    if (!user && identity.emailVerified) {
      // Only link by email when the issuer asserts the address is verified;
      // an unverified email claim must not grant access to an existing account.
      user = await prisma.user.findUnique({ where: { email: identity.email } });
    }
    if (!user) {
      res.redirect(`${env.WEB_ORIGIN}/login?error=account_not_provisioned`);
      return;
    }
    if (user.status !== 'ACTIVE') {
      res.redirect(`${env.WEB_ORIGIN}/login?error=account_inactive`);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        oidcIssuer: identity.issuer,
        oidcSubject: identity.subject,
        lastLoginAt: new Date(),
        ...(identity.name && !user.displayName ? { displayName: identity.name } : {}),
      },
    });

    const session = await createSession(user.id, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    attachSessionCookie(res, session.token, session.expiresAt);

    await writeAudit({
      actorUserId: user.id,
      action: 'AUTH_LOGIN_OIDC',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.redirect(`${env.WEB_ORIGIN}${identity.returnTo}`);
  } catch (error) {
    logger.warn({ err: error }, 'OIDC callback failed');
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.clearCookie(OIDC_STATE_COOKIE, sessionCookieOptions());
    const code =
      error instanceof AppError ? error.code : ERROR_CODES.AUTH_REQUIRED;
    res.redirect(`${env.WEB_ORIGIN}/login?error=${encodeURIComponent(code)}`);
  }
});
