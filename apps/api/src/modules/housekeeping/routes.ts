import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  assignHousekeepingSchema,
  createHousekeepingTaskSchema,
  createPaginationQuerySchema,
  housekeepingActionSchema,
  type HousekeepingSummary,
  type HousekeepingTaskSummary,
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
import { logger } from '../../lib/logger.js';

export const housekeepingRouter = Router();

const idSchema = z.uuid();

function housekeepingScopeFilters(
  access: AccessScope,
  userId: string,
): Prisma.HousekeepingTaskWhereInput[] {
  if (access.global) return [];
  if (access.dormitoryIds.length || access.buildingIds.length) {
    return [{ room: readableRoomWhere(access) }];
  }
  if (access.assignedTaskOnly || access.selfOnly) return [{ assignedTo: userId }];
  return [];
}

const taskInclude = {
  room: {
    include: {
      floor: { include: { building: { include: { dormitory: true } } } },
    },
  },
  bed: true,
  assignedToUser: true,
  checklistItems: { orderBy: { itemLabel: 'asc' } },
} satisfies Prisma.HousekeepingTaskInclude;

type TaskWithRelations = Prisma.HousekeepingTaskGetPayload<{ include: typeof taskInclude }>;

function mapTask(task: TaskWithRelations): HousekeepingTaskSummary {
  return {
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    roomId: task.roomId,
    roomNumber: task.room.roomNumber,
    dormitoryName: task.room.floor.building.dormitory.name,
    bedId: task.bedId,
    bedCode: task.bed?.bedCode ?? null,
    assignedTo: task.assignedTo,
    assignedToName: task.assignedToUser?.displayName ?? null,
    scheduledAt: task.scheduledAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    verifiedAt: task.verifiedAt?.toISOString() ?? null,
    notes: task.notes,
    checklist: task.checklistItems.map((item) => ({
      id: item.id,
      itemLabel: item.itemLabel,
      isCompleted: item.isCompleted,
    })),
  };
}

async function loadTask(id: string): Promise<TaskWithRelations> {
  const task = await prisma.housekeepingTask.findUnique({ where: { id }, include: taskInclude });
  if (!task) throw new NotFoundError('Housekeeping task not found');
  return task;
}

function assertTaskScope(
  access: { global: boolean; dormitoryIds: string[]; buildingIds: string[]; selfOnly?: boolean; assignedTaskOnly?: boolean },
  task: TaskWithRelations,
  opts?: { userId?: string; allowAssigned?: boolean },
): void {
  if (canManageDormitory(access, task.room.floor.building.dormitoryId, task.room.floor.buildingId)) {
    return;
  }
  if (
    opts?.allowAssigned &&
    opts.userId &&
    task.assignedTo === opts.userId &&
    (access.assignedTaskOnly || access.selfOnly)
  ) {
    return;
  }
  throw new ForbiddenError('Housekeeping task is outside your scope');
}

housekeepingRouter.get(
  '/housekeeping/tasks',
  requirePermission('housekeeping.read'),
  async (req, res) => {
    const access = req.access!;
    const query = validate(createPaginationQuerySchema({ pageSize: 50 }), req.query);
    const { page, pageSize } = query;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
    const dormitoryId = typeof req.query.dormitoryId === 'string' ? req.query.dormitoryId : undefined;
    const mine = req.query.mine === 'true';
    const open = req.query.open === 'true';

    const filters: Prisma.HousekeepingTaskWhereInput[] = [];
    if (status) filters.push({ status });
    if (open) filters.push({ status: { in: ['PENDING', 'IN_PROGRESS'] } });
    if (roomId) filters.push({ roomId });
    if (mine) filters.push({ assignedTo: req.auth!.user.id });
    if (dormitoryId) filters.push({ room: { floor: { building: { dormitoryId } } } });

    const scopeFilters = housekeepingScopeFilters(access, req.auth!.user.id);

    const where: Prisma.HousekeepingTaskWhereInput = {
      AND: [...filters, ...scopeFilters],
    };

    const [total, tasks] = await Promise.all([
      prisma.housekeepingTask.count({ where }),
      prisma.housekeepingTask.findMany({
        where,
        include: taskInclude,
        orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const pagination = paginationMeta(total, page, pageSize);
    sendSuccess(res, { items: tasks.map(mapTask), pagination }, { pagination });
  },
);

housekeepingRouter.get(
  '/housekeeping/summary',
  requirePermission('housekeeping.read'),
  async (req, res) => {
    const where: Prisma.HousekeepingTaskWhereInput = {
      AND: housekeepingScopeFilters(req.access!, req.auth!.user.id),
    };
    const [total, statusRows, typeRows] = await Promise.all([
      prisma.housekeepingTask.count({ where }),
      prisma.housekeepingTask.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.housekeepingTask.groupBy({ by: ['taskType'], where, _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row._count._all]));
    const byType = Object.fromEntries(typeRows.map((row) => [row.taskType, row._count._all]));
    const summary: HousekeepingSummary = {
      total,
      open: (byStatus.PENDING ?? 0) + (byStatus.IN_PROGRESS ?? 0),
      byStatus,
      byType,
      generatedAt: new Date().toISOString(),
    };
    sendSuccess(res, summary);
  },
);

housekeepingRouter.get(
  '/housekeeping/readiness',
  requirePermission('housekeeping.read'),
  async (req, res) => {
    const access = req.access!;
    const dormitoryId = typeof req.query.dormitoryId === 'string' ? req.query.dormitoryId : undefined;
    const rooms = await prisma.room.findMany({
      where: {
        ...(dormitoryId ? { floor: { building: { dormitoryId } } } : {}),
        ...readableRoomWhere(access),
      },
      include: {
        floor: { include: { building: { include: { dormitory: true } } } },
        beds: { orderBy: { bedCode: 'asc' } },
        housekeepingTasks: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] } },
          select: { id: true, status: true, taskType: true },
        },
      },
      orderBy: [{ floor: { floorNumber: 'asc' } }, { roomNumber: 'asc' }],
      take: 500,
    });

    sendSuccess(res, {
      items: rooms.map((room) => ({
        roomId: room.id,
        roomNumber: room.roomNumber,
        dormitoryName: room.floor.building.dormitory.name,
        buildingName: room.floor.building.name,
        floorNumber: room.floor.floorNumber,
        roomStatus: room.operationalStatus,
        housekeepingStatus: room.housekeepingStatus,
        openTasks: room.housekeepingTasks.length,
        beds: room.beds.map((bed) => ({
          id: bed.id,
          bedCode: bed.bedCode,
          status: bed.status,
          housekeepingStatus: bed.housekeepingStatus,
        })),
      })),
    });
  },
);

housekeepingRouter.post(
  '/housekeeping/tasks',
  requirePermission('housekeeping.assign'),
  async (req, res) => {
    const input = validate(createHousekeepingTaskSchema, req.body);
    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
      include: { floor: { include: { building: true } } },
    });
    if (!room) throw new NotFoundError('Room not found');
    if (
      !canManageDormitory(req.access!, room.floor.building.dormitoryId, room.floor.buildingId)
    ) {
      throw new ForbiddenError('Room is outside your scope');
    }
    if (input.bedId) {
      const bed = await prisma.bed.findUnique({ where: { id: input.bedId } });
      if (!bed || bed.roomId !== room.id) throw new NotFoundError('Bed not found in room');
    }
    if (input.assignedTo) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedTo } });
      if (!user || user.status !== 'ACTIVE') throw new NotFoundError('Assignee not found');
    }

    const task = await prisma.housekeepingTask.create({
      data: {
        roomId: input.roomId,
        bedId: input.bedId,
        taskType: input.taskType,
        status: 'PENDING',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
        assignedTo: input.assignedTo,
        notes: input.notes,
        checklistItems: {
          create: [
            { itemLabel: 'Ganti linen dan handuk' },
            { itemLabel: 'Bersihkan kamar mandi' },
            { itemLabel: 'Periksa fasilitas kamar' },
          ],
        },
      },
      include: taskInclude,
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'HOUSEKEEPING_TASK_CREATE',
      entityType: 'HOUSEKEEPING_TASK',
      entityId: task.id,
      afterData: { roomId: task.roomId, bedId: task.bedId, taskType: task.taskType },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (task.assignedTo) {
      try {
        await createNotification({
          userId: task.assignedTo,
          eventCode: 'HOUSEKEEPING_ASSIGNED',
          title: 'Tugas housekeeping baru',
          body: `Tugas ${task.taskType} untuk kamar ${task.room.roomNumber} ditugaskan kepada Anda.`,
          referenceType: 'HOUSEKEEPING_TASK',
          referenceId: task.id,
        });
      } catch (error) {
        logger.warn({ err: error, taskId: task.id }, 'housekeeping notification failed');
      }
    }
    sendSuccess(res, mapTask(task), { status: 201 });
  },
);

housekeepingRouter.post(
  '/housekeeping/tasks/:id/assign',
  requirePermission('housekeeping.assign'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const task = await loadTask(id);
    assertTaskScope(req.access!, task);
    const input = validate(assignHousekeepingSchema, req.body);
    if (input.assignedTo) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedTo } });
      if (!user || user.status !== 'ACTIVE') throw new NotFoundError('Assignee not found');
    }
    const updated = await prisma.housekeepingTask.update({
      where: { id },
      data: { assignedTo: input.assignedTo },
      include: taskInclude,
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'HOUSEKEEPING_TASK_ASSIGN',
      entityType: 'HOUSEKEEPING_TASK',
      entityId: id,
      beforeData: { assignedTo: task.assignedTo },
      afterData: { assignedTo: input.assignedTo },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (input.assignedTo) {
      try {
        await createNotification({
          userId: input.assignedTo,
          eventCode: 'HOUSEKEEPING_ASSIGNED',
          title: 'Tugas housekeeping ditugaskan',
          body: `Tugas untuk kamar ${updated.room.roomNumber} ditugaskan kepada Anda.`,
          referenceType: 'HOUSEKEEPING_TASK',
          referenceId: id,
        });
      } catch (error) {
        logger.warn({ err: error, taskId: id }, 'housekeeping notification failed');
      }
    }
    sendSuccess(res, mapTask(updated));
  },
);

housekeepingRouter.post(
  '/housekeeping/tasks/:id/actions',
  requirePermission('housekeeping.read'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const input = validate(housekeepingActionSchema, req.body);
    const task = await loadTask(id);
    const isExecute = input.action === 'START' || input.action === 'COMPLETE';
    assertTaskScope(req.access!, task, {
      userId: req.auth!.user.id,
      allowAssigned: isExecute,
    });
    const permissions = req.auth!.permissions;
    if (isExecute && !permissions.includes('housekeeping.execute')) {
      throw new ForbiddenError('housekeeping.execute permission is required');
    }
    if (input.action === 'VERIFY' && !permissions.includes('housekeeping.verify')) {
      throw new ForbiddenError('housekeeping.verify permission is required');
    }

    if (input.action === 'START') {
      if (task.status !== 'PENDING') {
        throw new ConflictError('CONFLICT', 'Only pending tasks can be started');
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.room.update({
          where: { id: task.roomId },
          data: { housekeepingStatus: 'CLEANING' },
        });
        if (task.bedId) {
          await tx.bed.update({
            where: { id: task.bedId },
            data: { housekeepingStatus: 'CLEANING' },
          });
        }
        return tx.housekeepingTask.update({
          where: { id },
          data: { status: 'IN_PROGRESS', startedAt: new Date(), notes: input.notes ?? task.notes },
          include: taskInclude,
        });
      });
      await writeAudit({
        actorUserId: req.auth!.user.id,
        action: 'HOUSEKEEPING_TASK_START',
        entityType: 'HOUSEKEEPING_TASK',
        entityId: id,
        afterData: { status: 'IN_PROGRESS' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      sendSuccess(res, mapTask(updated));
      return;
    }

    if (input.action === 'COMPLETE') {
      if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
        throw new ConflictError('CONFLICT', 'Only pending or in-progress tasks can be completed');
      }
      const checklistIds = input.checklistItemIds?.length
        ? input.checklistItemIds
        : task.checklistItems.map((item) => item.id);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.housekeepingChecklistItem.updateMany({
          where: { id: { in: checklistIds }, taskId: task.id },
          data: { isCompleted: true, completedBy: req.auth!.user.id, completedAt: new Date() },
        });
        await tx.room.update({
          where: { id: task.roomId },
          data: { housekeepingStatus: 'INSPECTION_REQUIRED' },
        });
        if (task.bedId) {
          await tx.bed.update({
            where: { id: task.bedId },
            data: { housekeepingStatus: 'INSPECTION_REQUIRED' },
          });
        }
        return tx.housekeepingTask.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            notes: input.notes ?? task.notes,
          },
          include: taskInclude,
        });
      });
      await writeAudit({
        actorUserId: req.auth!.user.id,
        action: 'HOUSEKEEPING_TASK_COMPLETE',
        entityType: 'HOUSEKEEPING_TASK',
        entityId: id,
        afterData: { status: 'COMPLETED' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      sendSuccess(res, mapTask(updated));
      return;
    }

    if (task.status !== 'COMPLETED') {
      throw new ConflictError('CONFLICT', 'Only completed tasks can be verified');
    }
    const otherOpen = await prisma.housekeepingTask.count({
      where: {
        roomId: task.roomId,
        bedId: task.bedId,
        id: { not: task.id },
        status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] },
      },
    });
    const updated = await prisma.$transaction(async (tx) => {
      if (otherOpen === 0) {
        await tx.room.update({
          where: { id: task.roomId },
          data: { housekeepingStatus: 'READY' },
        });
        if (task.bedId) {
          await tx.bed.update({
            where: { id: task.bedId },
            data: { housekeepingStatus: 'READY' },
          });
        }
      }
      return tx.housekeepingTask.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          verifiedBy: req.auth!.user.id,
          verifiedAt: new Date(),
          notes: input.notes ?? task.notes,
        },
        include: taskInclude,
      });
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'HOUSEKEEPING_TASK_VERIFY',
      entityType: 'HOUSEKEEPING_TASK',
      entityId: id,
      afterData: { status: 'VERIFIED', roomReady: otherOpen === 0 },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (task.assignedTo) {
      await createNotification({
        userId: task.assignedTo,
        eventCode: 'HOUSEKEEPING_VERIFIED',
        title: 'Tugas housekeeping terverifikasi',
        body: `Tugas kamar ${task.room.roomNumber} telah diverifikasi.`,
        referenceType: 'HOUSEKEEPING_TASK',
        referenceId: id,
      });
    }
    sendSuccess(res, mapTask(updated));
  },
);
