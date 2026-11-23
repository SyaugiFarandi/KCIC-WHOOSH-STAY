import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  assignRolesSchema,
  bulkUserStatusSchema,
  ERROR_CODES,
  paginationQuerySchema,
  ROLE_CODES,
  updateUserSchema,
  USER_STATUSES,
  type AuditLogEntry,
  type PaginationMeta,
  type RoleCode,
  type RoleSummary,
  type ScopeType,
  type UserStatus,
  type UserSummary,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';

export const adminUsersRouter = Router();

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    employee: true;
    roles: { include: { role: true } };
  };
}>;

function mapUser(user: UserWithRelations): UserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status as UserSummary['status'],
    employeeId: user.employeeId,
    employeeName: user.employee?.fullName ?? null,
    roles: user.roles.map((assignment) => ({
      roleCode: assignment.role.code as RoleCode,
      scopeType: assignment.scopeType as ScopeType,
      scopeId: assignment.scopeId,
    })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

function auditShape(user: UserSummary) {
  return {
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    employeeId: user.employeeId,
    roles: user.roles,
  };
}

async function loadUser(id: string): Promise<UserWithRelations> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { employee: true, roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

adminUsersRouter.get('/users', requirePermission('users.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('User administration requires global scope');
  }

  const query = validate(paginationQuerySchema, req.query);
  const roleCode = typeof req.query.role === 'string' ? req.query.role : undefined;
  if (roleCode && !ROLE_CODES.includes(roleCode as RoleCode)) {
    throw new ValidationError([{ path: ['role'], message: 'Unknown role code' }]);
  }
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  if (status && !USER_STATUSES.includes(status as UserStatus)) {
    throw new ValidationError([{ path: ['status'], message: 'Unknown user status' }]);
  }

  const sortMap: Record<string, Prisma.UserOrderByWithRelationInput> = {
    email: { email: 'asc' },
    displayName: { displayName: 'asc' },
    createdAt: { createdAt: 'desc' },
    lastLoginAt: { lastLoginAt: 'desc' },
  };
  const primaryOrder = sortMap[query.sort ?? 'createdAt'] ?? sortMap.createdAt;
  const orderBy: Prisma.UserOrderByWithRelationInput[] = [primaryOrder, { id: 'asc' }];

  const where: Prisma.UserWhereInput = {
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { employee: { is: { fullName: { contains: query.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
    ...(roleCode ? { roles: { some: { role: { code: roleCode } } } } : {}),
    ...(status ? { status } : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { employee: true, roles: { include: { role: true } } },
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(res, { items: users.map(mapUser), pagination }, { pagination });
});

adminUsersRouter.get('/users/:id', requirePermission('users.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('User administration requires global scope');
  }
  const user = await loadUser(String(req.params.id));
  sendSuccess(res, mapUser(user));
});

adminUsersRouter.patch('/users/:id', requirePermission('users.manage'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('User administration requires global scope');
  }

  const input = validate(updateUserSchema, req.body);
  if (Object.keys(input).length === 0) {
    throw new ValidationError([{ path: [], message: 'At least one field must be provided' }]);
  }

  const target = await loadUser(String(req.params.id));
  if (target.id === req.auth!.user.id && input.status && input.status !== 'ACTIVE') {
    throw new ForbiddenError('You cannot deactivate your own account');
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include: { employee: true, roles: { include: { role: true } } },
  });

  const before = mapUser(target);
  const after = mapUser(updated);
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'USER_UPDATE',
    entityType: 'USER',
    entityId: updated.id,
    beforeData: auditShape(before),
    afterData: auditShape(after),
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  sendSuccess(res, after);
});

adminUsersRouter.post('/users/bulk-status', requirePermission('users.manage'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('User administration requires global scope');
  }
  const input = validate(bulkUserStatusSchema, req.body);
  const ids = [...new Set(input.userIds)];

  if (input.status !== 'ACTIVE' && ids.includes(req.auth!.user.id)) {
    throw new ForbiddenError('You cannot deactivate or suspend your own account');
  }

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    include: { roles: { include: { role: true } }, employee: true },
  });
  if (targets.length !== ids.length) {
    throw new ValidationError([{ path: ['userIds'], message: 'One or more users were not found' }]);
  }

  if (input.status !== 'ACTIVE') {
    const affectedAdmins = targets.filter(
      (target) =>
        target.status === 'ACTIVE' &&
        target.roles.some((assignment) => assignment.role.code === 'SYSTEM_ADMIN'),
    );
    if (affectedAdmins.length > 0) {
      const otherAdmins = await prisma.user.count({
        where: {
          status: 'ACTIVE',
          id: { notIn: ids },
          roles: { some: { role: { code: 'SYSTEM_ADMIN' } } },
        },
      });
      if (otherAdmins === 0) {
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'Bulk update would leave no active SYSTEM_ADMIN',
        );
      }
    }
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: ids }, status: { not: input.status } },
    data: { status: input.status },
  });

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'USER_BULK_STATUS_UPDATE',
    entityType: 'USER',
    entityId: null,
    beforeData: targets.map((target) => ({ id: target.id, status: target.status })),
    afterData: { status: input.status, userIds: ids },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  sendSuccess(res, { updated: result.count, status: input.status, userIds: ids });
});

adminUsersRouter.put('/users/:id/roles', requirePermission('roles.manage'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('Role administration requires global scope');
  }

  const input = validate(assignRolesSchema, req.body);
  const target = await loadUser(String(req.params.id));

  if (target.id === req.auth!.user.id) {
    throw new ForbiddenError('You cannot change your own role assignments');
  }

  for (const assignment of input.assignments) {
    if (assignment.roleCode === 'SYSTEM_ADMIN' && assignment.scopeType !== 'GLOBAL') {
      throw new ValidationError([
        { path: ['assignments'], message: 'SYSTEM_ADMIN must use GLOBAL scope' },
      ]);
    }
    if (assignment.scopeType === 'DORMITORY' && assignment.scopeId) {
      const exists = await prisma.dormitory.findUnique({
        where: { id: assignment.scopeId },
        select: { id: true },
      });
      if (!exists) {
        throw new ValidationError([
          { path: ['assignments'], message: `Unknown dormitory scope ${assignment.scopeId}` },
        ]);
      }
    }
    if (assignment.scopeType === 'BUILDING' && assignment.scopeId) {
      const exists = await prisma.building.findUnique({
        where: { id: assignment.scopeId },
        select: { id: true },
      });
      if (!exists) {
        throw new ValidationError([
          { path: ['assignments'], message: `Unknown building scope ${assignment.scopeId}` },
        ]);
      }
    }
  }

  const roles = await prisma.role.findMany({
    where: { code: { in: input.assignments.map((assignment) => assignment.roleCode) } },
  });
  const roleByCode = new Map(roles.map((role) => [role.code, role]));

  const currentlyAdmin = target.roles.some((assignment) => assignment.role.code === 'SYSTEM_ADMIN');
  const remainsAdmin = input.assignments.some(
    (assignment) => assignment.roleCode === 'SYSTEM_ADMIN',
  );
  if (currentlyAdmin && !remainsAdmin) {
    const otherAdmins = await prisma.user.count({
      where: {
        status: 'ACTIVE',
        id: { not: target.id },
        roles: { some: { role: { code: 'SYSTEM_ADMIN' } } },
      },
    });
    if (otherAdmins === 0) {
      throw new ConflictError(
        ERROR_CODES.CONFLICT,
        'Cannot remove the last active SYSTEM_ADMIN assignment',
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: target.id } });
    if (input.assignments.length > 0) {
      await tx.userRole.createMany({
        data: input.assignments.map((assignment) => {
          const role = roleByCode.get(assignment.roleCode);
          if (!role) {
            throw new ValidationError([
              { path: ['assignments'], message: `Unknown role ${assignment.roleCode}` },
            ]);
          }
          return {
            userId: target.id,
            roleId: role.id,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId ?? null,
          };
        }),
      });
    }
  });

  const updated = await loadUser(target.id);
  const before = mapUser(target);
  const after = mapUser(updated);
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'USER_ROLES_UPDATE',
    entityType: 'USER',
    entityId: updated.id,
    beforeData: auditShape(before),
    afterData: auditShape(after),
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  sendSuccess(res, after);
});

adminUsersRouter.get('/roles', requirePermission('users.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('Role administration requires global scope');
  }
  const roles = await prisma.role.findMany({
    include: { rolePermissions: { include: { permission: true } } },
    orderBy: { code: 'asc' },
  });
  const result: RoleSummary[] = roles.map((role) => ({
    code: role.code as RoleCode,
    name: role.name,
    description: role.description,
    permissions: role.rolePermissions.map((entry) => entry.permission.code),
  }));
  sendSuccess(res, { items: result });
});

adminUsersRouter.get('/permissions', requirePermission('users.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('Permission catalog requires global scope');
  }
  const permissions = await prisma.permission.findMany({ orderBy: { code: 'asc' } });
  sendSuccess(res, { permissions: permissions.map((permission) => permission.code) });
});

adminUsersRouter.get('/scope-options', requirePermission('users.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('Scope options require global scope');
  }
  const [dormitories, buildings] = await Promise.all([
    prisma.dormitory.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.building.findMany({
      select: { id: true, code: true, name: true, dormitoryId: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  sendSuccess(res, { dormitories, buildings });
});

adminUsersRouter.get('/audit-logs', requirePermission('audit.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('Audit access requires global scope');
  }
  const query = validate(paginationQuerySchema, req.query);
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
  const actorUserId =
    typeof req.query.actorUserId === 'string' && req.query.actorUserId
      ? validate(z.uuid(), req.query.actorUserId)
      : undefined;
  const from =
    typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : undefined;
  const to =
    typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : undefined;
  if (from && Number.isNaN(from.getTime())) {
    throw new ValidationError([{ path: ['from'], message: 'Invalid start date' }]);
  }
  if (to && Number.isNaN(to.getTime())) {
    throw new ValidationError([{ path: ['to'], message: 'Invalid end date' }]);
  }

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { action: { contains: query.q, mode: 'insensitive' } },
            { entityType: { contains: query.q, mode: 'insensitive' } },
            { actor: { displayName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const items: AuditLogEntry[] = logs.map((log) => ({
    id: log.id,
    actorUserId: log.actorUserId,
    actorName: log.actor?.displayName ?? null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    reason: log.reason,
    requestId: log.requestId,
    beforeData: log.beforeData ?? undefined,
    afterData: log.afterData ?? undefined,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }));

  const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(res, { items, pagination }, { pagination });
});

adminUsersRouter.get('/audit-logs/:id', requirePermission('audit.read'), async (req, res) => {
  if (!req.access?.global) {
    throw new ForbiddenError('Audit access requires global scope');
  }
  const id = validate(z.uuid(), req.params.id);
  const log = await prisma.auditLog.findUnique({ where: { id }, include: { actor: true } });
  if (!log) throw new NotFoundError('Audit log not found');
  sendSuccess(res, {
    id: log.id,
    actorUserId: log.actorUserId,
    actorName: log.actor?.displayName ?? null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    reason: log.reason,
    requestId: log.requestId,
    beforeData: log.beforeData,
    afterData: log.afterData,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  } satisfies AuditLogEntry & { userAgent?: string | null });
});
