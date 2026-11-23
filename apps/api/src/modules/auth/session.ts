import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { setContextUser } from '../../lib/context.js';
import type { PermissionCode, RoleCode, ScopeType } from '@whoosh/shared';
import type { Principal, PrincipalRole } from './types.js';

export const SESSION_COOKIE = 'whoosh_stay_session';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sessionCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 45),
      userAgent: meta.userAgent?.slice(0, 500),
    },
  });

  return { token, expiresAt, sessionId: session.id };
}

type SessionWithUser = NonNullable<
  Awaited<ReturnType<typeof findSessionByTokenHash>>
>;

async function findSessionByTokenHash(tokenHash: string) {
  return prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          employee: true,
          roles: {
            include: {
              role: {
                include: {
                  rolePermissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

function mapSession(session: SessionWithUser): Principal | null {
  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  const roles: PrincipalRole[] = session.user.roles.map((assignment) => ({
    roleCode: assignment.role.code as RoleCode,
    scopeType: assignment.scopeType as ScopeType,
    scopeId: assignment.scopeId,
    permissions: assignment.role.rolePermissions.map(
      (entry) => entry.permission.code as PermissionCode,
    ),
  }));

  const permissions = [...new Set(roles.flatMap((role) => role.permissions))];

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      status: session.user.status,
      employeeId: session.user.employeeId,
      employeeName: session.user.employee?.fullName ?? null,
    },
    roles,
    permissions,
    session: { id: session.id, expiresAt: session.expiresAt },
  };
}

export async function resolveSessionToken(token: string): Promise<Principal | null> {
  const session = await findSessionByTokenHash(hashToken(token));
  return session ? mapSession(session) : null;
}

export async function resolveRequestSession(req: Request): Promise<Principal | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string') return null;

  const principal = await resolveSessionToken(token);
  if (!principal) return null;

  setContextUser(principal.user.id, principal.session.id);

  const lastSeen = await prisma.session.findUnique({
    where: { id: principal.session.id },
    select: { lastSeenAt: true },
  });
  if (lastSeen && Date.now() - lastSeen.lastSeenAt.getTime() > 5 * 60 * 1000) {
    prisma.session
      .update({ where: { id: principal.session.id }, data: { lastSeenAt: new Date() } })
      .catch((error) => logger.warn({ err: error }, 'failed to update session lastSeenAt'));
  }

  return principal;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function attachSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}
