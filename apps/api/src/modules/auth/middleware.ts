import type { RequestHandler } from 'express';
import { ERROR_CODES, type PermissionCode, type RoleCode } from '@whoosh/shared';
import { UnauthorizedError, ForbiddenError } from '../../middleware/errors.js';
import { resolveAccessScope, hasPermission, hasAnyPermission, hasRole, scopeIsEmpty } from './types.js';
import { resolveRequestSession } from './session.js';

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  if (!req.auth) {
    try {
      const principal = await resolveRequestSession(req);
      if (principal) req.auth = principal;
    } catch {
      // Invalid or expired session cookies are treated as anonymous here.
    }
  }
  next();
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const principal = req.auth ?? (await resolveRequestSession(req));
  if (!principal) {
    throw new UnauthorizedError();
  }
  req.auth = principal;
  next();
};

export function requirePermission(permission: PermissionCode): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!hasPermission(req.auth, permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
    const scope = resolveAccessScope(req.auth, permission);
    if (scopeIsEmpty(scope) && permission !== 'dashboard.read') {
      throw new ForbiddenError(`No data scope grants permission: ${permission}`);
    }
    req.access = scope;
    next();
  };
}

export function requireAnyPermission(permissions: readonly PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!hasAnyPermission(req.auth, permissions)) {
      throw new ForbiddenError('Missing required permission');
    }
    req.access = resolveAccessScope(req.auth, permissions[0]);
    next();
  };
}

export function requireRole(...roles: RoleCode[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!hasRole(req.auth, ...roles)) {
      throw new ForbiddenError('Missing required role');
    }
    next();
  };
}

export const authCodes = { AUTH_REQUIRED: ERROR_CODES.AUTH_REQUIRED };
