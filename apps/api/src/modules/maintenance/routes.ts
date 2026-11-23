import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  createMaintenanceTicketSchema,
  createPaginationQuerySchema,
  updateMaintenanceSchema,
  type MaintenanceSummary,
  type MaintenanceTicketSummary,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import type { AccessScope } from '../auth/types.js';
import { writeAudit } from '../audit/audit.js';
import { canManageDormitory, readableRoomWhere } from '../../lib/scope.js';
import { createNotification } from '../notifications/service.js';

export const maintenanceRouter = Router();

const idSchema = z.uuid();

function maintenanceScopeFilter(
  access: AccessScope,
  userId: string,
): Prisma.MaintenanceTicketWhereInput[] {
  if (access.global) return [];
  if (access.dormitoryIds.length || access.buildingIds.length) {
    return [
      {
        OR: [
          { room: readableRoomWhere(access) },
          { bed: { room: readableRoomWhere(access) } },
        ],
      },
    ];
  }
  if (access.selfOnly) return [{ reportedBy: userId }];
  if (access.assignedTaskOnly) return [{ assignedTo: userId }];
  return [];
}

const ticketInclude = {
  room: {
    include: {
      floor: { include: { building: { include: { dormitory: true } } } },
    },
  },
  bed: {
    include: {
      room: { include: { floor: { include: { building: { include: { dormitory: true } } } } } },
    },
  },
  reporter: true,
  assignee: true,
} satisfies Prisma.MaintenanceTicketInclude;

type TicketWithRelations = Prisma.MaintenanceTicketGetPayload<{
  include: typeof ticketInclude;
}>;

function mapTicket(ticket: TicketWithRelations): MaintenanceTicketSummary {
  const room = ticket.room ?? ticket.bed?.room ?? null;
  const bed = ticket.bed ?? null;
  return {
    id: ticket.id,
    ticketCode: ticket.ticketCode,
    category: ticket.category,
    priority: ticket.priority,
    description: ticket.description,
    status: ticket.status,
    blocksInventory: ticket.blocksInventory,
    roomId: room?.id ?? null,
    roomNumber: room?.roomNumber ?? null,
    bedId: bed?.id ?? null,
    bedCode: bed?.bedCode ?? null,
    dormitoryName: room?.floor.building.dormitory.name ?? null,
    reportedByName: ticket.reporter.displayName,
    assignedTo: ticket.assignedTo,
    assignedToName: ticket.assignee?.displayName ?? null,
    reportedAt: ticket.reportedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    resolutionNotes: ticket.resolutionNotes,
  };
}

async function loadTicket(id: string): Promise<TicketWithRelations> {
  const ticket = await prisma.maintenanceTicket.findUnique({ where: { id }, include: ticketInclude });
  if (!ticket) throw new NotFoundError('Maintenance ticket not found');
  return ticket;
}

function ticketDormitory(ticket: TicketWithRelations): { dormitoryId: string; buildingId: string } {
  const room = ticket.room ?? ticket.bed?.room;
  if (!room) throw new NotFoundError('Ticket has no room association');
  return {
    dormitoryId: room.floor.building.dormitoryId,
    buildingId: room.floor.buildingId,
  };
}

function assertTicketScope(
  access: { global: boolean; dormitoryIds: string[]; buildingIds: string[] },
  ticket: TicketWithRelations,
): void {
  const scope = ticketDormitory(ticket);
  if (!canManageDormitory(access, scope.dormitoryId, scope.buildingId)) {
    throw new ForbiddenError('Maintenance ticket is outside your scope');
  }
}

function generateTicketCode(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
  return `WS-MT-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function resolveRoomAndBed(input: { roomId?: string; bedId?: string }) {
  if (input.bedId) {
    const bed = await prisma.bed.findUnique({
      where: { id: input.bedId },
      include: { room: { include: { floor: { include: { building: true } } } } },
    });
    if (!bed) throw new NotFoundError('Bed not found');
    return { room: bed.room, bedId: bed.id };
  }
  const room = await prisma.room.findUnique({
    where: { id: input.roomId },
    include: { floor: { include: { building: true } } },
  });
  if (!room) throw new NotFoundError('Room not found');
  return { room, bedId: null };
}

maintenanceRouter.get(
  '/maintenance/tickets',
  requirePermission('maintenance.read'),
  async (req, res) => {
    const access = req.access!;
    const query = validate(createPaginationQuerySchema({ pageSize: 50 }), req.query);
    const { page, pageSize } = query;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
    const dormitoryId = typeof req.query.dormitoryId === 'string' ? req.query.dormitoryId : undefined;
    const open = req.query.open === 'true';

    const filters: Prisma.MaintenanceTicketWhereInput[] = [];
    if (status) filters.push({ status });
    if (open) filters.push({ status: { in: ['OPEN', 'IN_REVIEW', 'IN_PROGRESS'] } });
    if (priority) filters.push({ priority });
    if (dormitoryId) {
      filters.push({
        OR: [
          { room: { floor: { building: { dormitoryId } } } },
          { bed: { room: { floor: { building: { dormitoryId } } } } },
        ],
      });
    }

    const scopeFilter = maintenanceScopeFilter(access, req.auth!.user.id);

    const where: Prisma.MaintenanceTicketWhereInput = { AND: [...filters, ...scopeFilter] };
    const [total, tickets] = await Promise.all([
      prisma.maintenanceTicket.count({ where }),
      prisma.maintenanceTicket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ status: 'asc' }, { reportedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const pagination = paginationMeta(total, page, pageSize);
    sendSuccess(res, { items: tickets.map(mapTicket), pagination }, { pagination });
  },
);

maintenanceRouter.get(
  '/maintenance/summary',
  requirePermission('maintenance.read'),
  async (req, res) => {
    const where: Prisma.MaintenanceTicketWhereInput = {
      AND: maintenanceScopeFilter(req.access!, req.auth!.user.id),
    };
    const [total, statusRows, priorityRows] = await Promise.all([
      prisma.maintenanceTicket.count({ where }),
      prisma.maintenanceTicket.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.maintenanceTicket.groupBy({ by: ['priority'], where, _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row._count._all]));
    const byPriority = Object.fromEntries(
      priorityRows.map((row) => [row.priority, row._count._all]),
    );
    const summary: MaintenanceSummary = {
      total,
      open:
        (byStatus.OPEN ?? 0) + (byStatus.IN_REVIEW ?? 0) + (byStatus.IN_PROGRESS ?? 0),
      byStatus,
      byPriority,
      generatedAt: new Date().toISOString(),
    };
    sendSuccess(res, summary);
  },
);

maintenanceRouter.post(
  '/maintenance/tickets',
  requirePermission('maintenance.create'),
  async (req, res) => {
    const input = validate(createMaintenanceTicketSchema, req.body);
    const { room, bedId } = await resolveRoomAndBed(input);
    if (!canManageDormitory(req.access!, room.floor.building.dormitoryId, room.floor.buildingId)) {
      throw new ForbiddenError('Room is outside your scope');
    }
    if (input.blocksInventory && !req.auth!.permissions.includes('maintenance.block_inventory')) {
      throw new ForbiddenError('maintenance.block_inventory permission is required');
    }

    const blockStart = input.blockStartAt ? new Date(input.blockStartAt) : null;
    const blockEnd = input.blockEndAt ? new Date(input.blockEndAt) : null;
    if (blockStart && blockEnd && blockEnd <= blockStart) {
      throw new ConflictError('CONFLICT', 'Block end must be after block start');
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.maintenanceTicket.create({
        data: {
          ticketCode: generateTicketCode(),
          roomId: room.id,
          bedId,
          category: input.category,
          priority: input.priority,
          description: input.description,
          status: 'OPEN',
          blocksInventory: input.blocksInventory,
          reportedBy: req.auth!.user.id,
        },
        include: ticketInclude,
      });
      if (input.blocksInventory && blockStart && blockEnd) {
        await tx.inventoryBlock.create({
          data: {
            roomId: bedId ? null : room.id,
            bedId,
            startAt: blockStart,
            endAt: blockEnd,
            blockType: 'MAINTENANCE',
            reason: `Maintenance ${created.ticketCode}: ${input.description.slice(0, 150)}`,
            sourceTicketId: created.id,
            createdBy: req.auth!.user.id,
          },
        });
      }
      return created;
    });

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'MAINTENANCE_TICKET_CREATE',
      entityType: 'MAINTENANCE_TICKET',
      entityId: ticket.id,
      afterData: {
        ticketCode: ticket.ticketCode,
        priority: ticket.priority,
        blocksInventory: ticket.blocksInventory,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, mapTicket(ticket), { status: 201 });
  },
);

maintenanceRouter.post(
  '/maintenance/tickets/:id/assign',
  requirePermission('maintenance.assign'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const ticket = await loadTicket(id);
    assertTicketScope(req.access!, ticket);
    const input = validate(z.object({ assignedTo: z.uuid().nullable() }), req.body);
    if (input.assignedTo) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedTo } });
      if (!user || user.status !== 'ACTIVE') throw new NotFoundError('Assignee not found');
    }
    const updated = await prisma.maintenanceTicket.update({
      where: { id },
      data: { assignedTo: input.assignedTo },
      include: ticketInclude,
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'MAINTENANCE_TICKET_ASSIGN',
      entityType: 'MAINTENANCE_TICKET',
      entityId: id,
      beforeData: { assignedTo: ticket.assignedTo },
      afterData: { assignedTo: input.assignedTo },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (input.assignedTo) {
      await createNotification({
        userId: input.assignedTo,
        eventCode: 'MAINTENANCE_ASSIGNED',
        title: 'Tiket maintenance ditugaskan',
        body: `Tiket ${updated.ticketCode} ditugaskan kepada Anda.`,
        referenceType: 'MAINTENANCE_TICKET',
        referenceId: id,
      });
    }
    sendSuccess(res, mapTicket(updated));
  },
);

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_REVIEW: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

maintenanceRouter.patch(
  '/maintenance/tickets/:id',
  requirePermission('maintenance.update'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const ticket = await loadTicket(id);
    assertTicketScope(req.access!, ticket);
    const input = validate(updateMaintenanceSchema, req.body);
    if (!Object.keys(input).length) throw new ConflictError('CONFLICT', 'No changes supplied');

    if (input.status) {
      const allowed = ALLOWED_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new ConflictError(
          'CONFLICT',
          `Cannot move ticket from ${ticket.status} to ${input.status}`,
        );
      }
      if (input.status === 'CLOSED' && !req.auth!.permissions.includes('maintenance.close')) {
        throw new ForbiddenError('maintenance.close permission is required');
      }
    }
    if (input.assignedTo !== undefined && !req.auth!.permissions.includes('maintenance.assign')) {
      throw new ForbiddenError('maintenance.assign permission is required');
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.maintenanceTicket.update({
        where: { id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.priority ? { priority: input.priority } : {}),
          ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
          ...(input.resolutionNotes ? { resolutionNotes: input.resolutionNotes } : {}),
          ...(input.status === 'RESOLVED' || input.status === 'CLOSED'
            ? { resolvedAt: ticket.resolvedAt ?? now }
            : {}),
          ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
        },
        include: ticketInclude,
      });
      if (input.status === 'RESOLVED' || input.status === 'CLOSED') {
        // Blocks that have not started can be removed outright; clamping them to `now`
        // would leave startAt >= endAt and violate inventory_blocks_dates_check.
        await tx.inventoryBlock.deleteMany({
          where: { sourceTicketId: id, startAt: { gte: now } },
        });
        await tx.inventoryBlock.updateMany({
          where: { sourceTicketId: id, startAt: { lt: now }, endAt: { gt: now } },
          data: { endAt: now },
        });
      }
      return result;
    });

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'MAINTENANCE_TICKET_UPDATE',
      entityType: 'MAINTENANCE_TICKET',
      entityId: id,
      beforeData: { status: ticket.status, priority: ticket.priority, assignedTo: ticket.assignedTo },
      afterData: {
        status: updated.status,
        priority: updated.priority,
        assignedTo: updated.assignedTo,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (input.status === 'RESOLVED' || input.status === 'CLOSED') {
      await createNotification({
        userId: ticket.reportedBy,
        eventCode: 'MAINTENANCE_UPDATED',
        title: `Tiket ${updated.ticketCode} ${input.status === 'CLOSED' ? 'ditutup' : 'diselesaikan'}`,
        body: `Tiket maintenance kamar ${updated.room?.roomNumber ?? updated.bed?.room.roomNumber ?? '-'} telah ${
          input.status === 'CLOSED' ? 'ditutup' : 'diselesaikan'
        }.`,
        referenceType: 'MAINTENANCE_TICKET',
        referenceId: id,
      });
    }
    sendSuccess(res, mapTicket(updated));
  },
);
