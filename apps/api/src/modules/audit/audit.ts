import { prisma } from '../../lib/prisma.js';
import { getRequestContext } from '../../lib/context.js';
import type { Prisma } from '@prisma/client';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const context = getRequestContext();
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? context?.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeData: input.beforeData,
      afterData: input.afterData,
      reason: input.reason ?? null,
      requestId: input.requestId ?? context?.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
