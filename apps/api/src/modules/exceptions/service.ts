import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  RESERVATION_EXCEPTION_OPEN_STATUSES,
  type ReservationExceptionCounts,
  type ReservationExceptionDetail,
  type ReservationExceptionListQuery,
  type ReservationExceptionSeverity,
  type ReservationExceptionType,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { logger } from '../../lib/logger.js';
import { writeAudit } from '../audit/audit.js';
import type { AccessScope } from '../auth/types.js';

const exceptionInclude = {
  dormitory: { select: { code: true, name: true } },
  reservation: { select: { bookingCode: true, status: true } },
  room: { select: { roomNumber: true } },
  bed: { select: { bedCode: true, label: true } },
  assignee: { select: { id: true, displayName: true } },
  resolver: { select: { id: true, displayName: true } },
} satisfies Prisma.ReservationExceptionInclude;

type ExceptionRow = Prisma.ReservationExceptionGetPayload<{ include: typeof exceptionInclude }>;

function mapException(row: ExceptionRow): ReservationExceptionDetail {
  return {
    id: row.id,
    type: row.exceptionType as ReservationExceptionType,
    severity: row.severity as ReservationExceptionSeverity,
    status: row.status as ReservationExceptionDetail['status'],
    dormitoryId: row.dormitoryId,
    dormitoryCode: row.dormitory.code,
    dormitoryName: row.dormitory.name,
    reservationId: row.reservationId,
    bookingCode: row.reservation?.bookingCode ?? null,
    reservationStatus: row.reservation?.status ?? null,
    roomId: row.roomId,
    roomLabel: row.room?.roomNumber ?? null,
    bedId: row.bedId,
    bedLabel: row.bed?.label ?? row.bed?.bedCode ?? null,
    title: row.title,
    description: row.description,
    evidence: (row.evidence as Record<string, unknown> | null) ?? null,
    occurrenceCount: row.occurrenceCount,
    assignedTo: row.assignee ? { id: row.assignee.id, displayName: row.assignee.displayName } : null,
    detectedAt: row.detectedAt.toISOString(),
    lastDetectedAt: row.lastDetectedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    resolvedBy: row.resolver ? { id: row.resolver.id, displayName: row.resolver.displayName } : null,
  };
}

async function visibleDormitoryIds(access: AccessScope): Promise<string[] | null> {
  if (access.global) return null;
  if (access.selfOnly) {
    throw new ForbiddenError('Reservation exceptions are only available to accommodation staff');
  }
  const ids = new Set(access.dormitoryIds);
  if (access.buildingIds.length) {
    const buildings = await prisma.building.findMany({
      where: { id: { in: access.buildingIds } },
      select: { dormitoryId: true },
    });
    for (const building of buildings) ids.add(building.dormitoryId);
  }
  if (!ids.size) throw new ForbiddenError('No accommodation scope is available');
  return [...ids];
}

function buildFilterWhere(
  dormitoryIds: string[] | null,
  query: ReservationExceptionListQuery,
  userId: string,
): Prisma.ReservationExceptionWhereInput {
  const filters: Prisma.ReservationExceptionWhereInput[] = [];
  if (dormitoryIds) filters.push({ dormitoryId: { in: dormitoryIds } });
  if (query.dormitoryId) filters.push({ dormitoryId: query.dormitoryId });
  if (query.severity) filters.push({ severity: query.severity });
  if (query.type) filters.push({ exceptionType: query.type });
  if (query.assignedToMe === 'true') filters.push({ assignedTo: userId });
  if (query.q) {
    filters.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { reservation: { bookingCode: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  return filters.length ? { AND: filters } : {};
}

function statusWhere(query: ReservationExceptionListQuery): Prisma.ReservationExceptionWhereInput {
  if (query.status) return { status: query.status };
  if (query.openOnly === 'true') return { status: { in: RESERVATION_EXCEPTION_OPEN_STATUSES } };
  return {};
}

export interface ReservationExceptionListPayload {
  items: ReservationExceptionDetail[];
  counts: ReservationExceptionCounts;
  total: number;
}

export async function listReservationExceptions(
  access: AccessScope,
  query: ReservationExceptionListQuery,
  userId: string,
): Promise<ReservationExceptionListPayload> {
  const dormitoryIds = await visibleDormitoryIds(access);
  const filterWhere = buildFilterWhere(dormitoryIds, query, userId);
  const listWhere: Prisma.ReservationExceptionWhereInput = {
    AND: [filterWhere, statusWhere(query)],
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.reservationException.findMany({
      where: listWhere,
      include: exceptionInclude,
      orderBy: [{ lastDetectedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.reservationException.count({ where: listWhere }),
    prisma.reservationException.groupBy({
      by: ['status', 'severity'],
      where: filterWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: ReservationExceptionCounts = {
    open: 0,
    acknowledged: 0,
    resolved: 0,
    dismissed: 0,
    criticalOpen: 0,
  };
  for (const group of grouped) {
    const amount = group._count._all;
    if (group.status === 'OPEN') counts.open += amount;
    if (group.status === 'ACKNOWLEDGED') counts.acknowledged += amount;
    if (group.status === 'RESOLVED') counts.resolved += amount;
    if (group.status === 'DISMISSED') counts.dismissed += amount;
    if (group.status === 'OPEN' && group.severity === 'CRITICAL') counts.criticalOpen += amount;
  }

  return { items: rows.map(mapException), counts, total };
}

async function loadException(id: string, access: AccessScope): Promise<ExceptionRow> {
  const row = await prisma.reservationException.findUnique({
    where: { id },
    include: exceptionInclude,
  });
  if (!row) throw new NotFoundError('Reservation exception not found');
  if (!access.global) {
    const dormitoryIds = await visibleDormitoryIds(access);
    if (dormitoryIds && !dormitoryIds.includes(row.dormitoryId)) {
      throw new NotFoundError('Reservation exception not found');
    }
  }
  return row;
}

export async function getReservationException(
  id: string,
  access: AccessScope,
): Promise<ReservationExceptionDetail> {
  return mapException(await loadException(id, access));
}

export async function assignReservationException(
  id: string,
  input: { assignedToUserId?: string | null; assignToSelf?: true },
  actor: { userId: string; ipAddress?: string | null; userAgent?: string | null },
  access: AccessScope,
): Promise<ReservationExceptionDetail> {
  const row = await loadException(id, access);
  if (row.status !== 'OPEN' && row.status !== 'ACKNOWLEDGED') {
    throw new ConflictError(ERROR_CODES.EXCEPTION_STATE_INVALID, 'Exception is already closed');
  }

  const targetUserId = input.assignToSelf ? actor.userId : input.assignedToUserId ?? null;
  if (targetUserId) {
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!target) throw new NotFoundError('Assignee not found or inactive');
  }

  const unassigning = targetUserId === null;
  const updated = await prisma.reservationException.update({
    where: { id },
    data: {
      assignedTo: targetUserId,
      ...(unassigning
        ? { status: 'OPEN', acknowledgedAt: null }
        : { status: 'ACKNOWLEDGED', acknowledgedAt: row.acknowledgedAt ?? new Date() }),
    },
    include: exceptionInclude,
  });

  await writeAudit({
    actorUserId: actor.userId,
    action: 'EXCEPTION_ASSIGN',
    entityType: 'RESERVATION_EXCEPTION',
    entityId: id,
    beforeData: { assignedTo: row.assignedTo, status: row.status },
    afterData: { assignedTo: updated.assignedTo, status: updated.status },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return mapException(updated);
}

export async function resolveReservationException(
  id: string,
  input: { status: 'RESOLVED' | 'DISMISSED'; resolutionNote: string },
  actor: { userId: string; ipAddress?: string | null; userAgent?: string | null },
  access: AccessScope,
): Promise<ReservationExceptionDetail> {
  const row = await loadException(id, access);
  if (row.status !== 'OPEN' && row.status !== 'ACKNOWLEDGED') {
    throw new ConflictError(ERROR_CODES.EXCEPTION_STATE_INVALID, 'Exception is already closed');
  }

  const updated = await prisma.reservationException.update({
    where: { id },
    data: {
      status: input.status,
      resolutionNote: input.resolutionNote,
      resolvedBy: actor.userId,
      resolvedAt: new Date(),
    },
    include: exceptionInclude,
  });

  await writeAudit({
    actorUserId: actor.userId,
    action: input.status === 'RESOLVED' ? 'EXCEPTION_RESOLVE' : 'EXCEPTION_DISMISS',
    entityType: 'RESERVATION_EXCEPTION',
    entityId: id,
    beforeData: { status: row.status },
    afterData: { status: updated.status, resolutionNote: input.resolutionNote },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return mapException(updated);
}

export interface RecordExceptionInput {
  dedupeKey: string;
  type: ReservationExceptionType;
  severity: ReservationExceptionSeverity;
  dormitoryId: string;
  reservationId?: string | null;
  roomId?: string | null;
  bedId?: string | null;
  title: string;
  description: string;
  evidence?: Prisma.InputJsonValue;
  actorUserId?: string | null;
}

export async function recordReservationException(
  input: RecordExceptionInput,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const row = await db.reservationException.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      dedupeKey: input.dedupeKey,
      exceptionType: input.type,
      severity: input.severity,
      dormitoryId: input.dormitoryId,
      reservationId: input.reservationId ?? null,
      roomId: input.roomId ?? null,
      bedId: input.bedId ?? null,
      title: input.title,
      description: input.description,
      evidence: input.evidence,
      createdBy: input.actorUserId ?? null,
    },
    update: {
      occurrenceCount: { increment: 1 },
      lastDetectedAt: new Date(),
      severity: input.severity,
      title: input.title,
      description: input.description,
      evidence: input.evidence,
      reservationId: input.reservationId ?? null,
      roomId: input.roomId ?? null,
      bedId: input.bedId ?? null,
    },
    select: { id: true, status: true },
  });

  if (row.status === 'RESOLVED' || row.status === 'DISMISSED') {
    await db.reservationException.update({
      where: { id: row.id },
      data: {
        status: 'OPEN',
        assignedTo: null,
        acknowledgedAt: null,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      },
    });
  }
}

// Conflict handling must never mask the original 409 response.
export async function safeRecordReservationException(
  input: RecordExceptionInput,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  try {
    await recordReservationException(input, db);
  } catch (error) {
    logger.warn(
      { err: error, dedupeKey: input.dedupeKey },
      'failed to record reservation exception',
    );
  }
}

export function allocationConflictKey(
  dormitoryId: string,
  checkIn: string,
  checkOut: string,
  bedIds: string[],
): string {
  const bedHash = createHash('sha256')
    .update([...bedIds].sort().join(','))
    .digest('hex')
    .slice(0, 20);
  return `ALLOCATION_CONFLICT:${dormitoryId}:${checkIn}:${checkOut}:${bedHash}`;
}

export function overbookingKey(
  dormitoryId: string,
  checkIn: string,
  checkOut: string,
  occupantCount: number,
): string {
  return `OVERBOOKING:${dormitoryId}:${checkIn}:${checkOut}:${occupantCount}`;
}
