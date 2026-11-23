import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ERROR_CODES,
  allocateReservationSchema,
  cancelReservationSchema,
  createReservationSchema,
  dateOnlySchema,
  paginationQuerySchema,
  rejectReservationSchema,
  RESERVATION_STATUSES,
  type PaginationMeta,
  type ReservationDetail,
  type ReservationSummary,
  type ReservationsSummary,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errors.js';
import { hasPermission } from '../auth/types.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';
import { readableReservationWhere } from '../../lib/scope.js';
import {
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
  todayInJakarta,
} from '../../lib/dates.js';
import { findAvailableBeds } from '../availability/service.js';
import { notifyDormitoryManagers, notifyEmployees } from '../notifications/service.js';

export const reservationsRouter = Router();

const reservationInclude = {
  primaryEmployee: true,
  dormitory: true,
  guests: { include: { employee: true } },
  allocations: {
    include: {
      bed: {
        include: {
          room: {
            include: {
              floor: { include: { building: { include: { dormitory: true } } } },
            },
          },
        },
      },
    },
    orderBy: { stayStart: 'asc' },
  },
  events: { orderBy: { createdAt: 'asc' } },
  checkins: { include: { employee: true } },
  checkouts: { include: { employee: true } },
} satisfies Prisma.ReservationInclude;

type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>;

function allocationLabel(reservation: ReservationWithRelations): string | null {
  const active = reservation.allocations.filter((item) => item.status === 'HELD' || item.status === 'ACTIVE');
  if (!active.length) return null;
  return active
    .map(
      (item) =>
        `${item.bed.room.floor.building.dormitory.name} · ${item.bed.room.roomNumber}/${item.bed.bedCode}`,
    )
    .join(', ');
}

function mapSummary(reservation: ReservationWithRelations): ReservationSummary {
  return {
    id: reservation.id,
    bookingCode: reservation.bookingCode,
    status: reservation.status,
    approvalStatus: reservation.approvalStatus,
    source: reservation.source,
    primaryEmployeeId: reservation.primaryEmployeeId,
    employeeName: reservation.primaryEmployee?.fullName ?? 'Unknown',
    dormitoryId: reservation.dormitoryId,
    dormitoryName: reservation.dormitory.name,
    checkInDate: formatDateOnly(reservation.checkInDate),
    checkOutDate: formatDateOnly(reservation.checkOutDate),
    occupantCount: reservation.occupantCount,
    purpose: reservation.purpose,
    createdAt: reservation.createdAt.toISOString(),
    confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
    checkedInAt: reservation.checkins[0]?.checkedInAt.toISOString() ?? null,
    checkedOutAt: reservation.checkouts[0]?.checkedOutAt.toISOString() ?? null,
    allocationSummary: allocationLabel(reservation),
  };
}

function mapDetail(reservation: ReservationWithRelations, principalId: string): ReservationDetail {
  const summary = mapSummary(reservation);
  const isOwner =
    reservation.primaryEmployeeId === principalId ||
    reservation.guests.some((guest) => guest.employeeId === principalId);
  const canCancel =
    isOwner &&
    ['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED'].includes(reservation.status) &&
    reservation.checkInDate > todayDateOnly();
  return {
    ...summary,
    cancellationReason: reservation.cancellationReason,
    allocations: reservation.allocations.map((allocation) => ({
      id: allocation.id,
      bedId: allocation.bedId,
      bedCode: allocation.bed.bedCode,
      roomNumber: allocation.bed.room.roomNumber,
      buildingName: allocation.bed.room.floor.building.name,
      dormitoryName: allocation.bed.room.floor.building.dormitory.name,
      stayStart: formatDateOnly(allocation.stayStart),
      stayEnd: formatDateOnly(allocation.stayEnd),
      status: allocation.status,
    })),
    events: reservation.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
    guests: reservation.guests.map((guest) => ({
      id: guest.id,
      employeeId: guest.employeeId,
      employeeName: guest.employee.fullName,
      guestRole: guest.guestRole,
    })),
    checkins: reservation.checkins.map((record) => ({
      employeeId: record.employeeId,
      employeeName: record.employee.fullName,
      checkedInAt: record.checkedInAt.toISOString(),
    })),
    checkouts: reservation.checkouts.map((record) => ({
      employeeId: record.employeeId,
      employeeName: record.employee.fullName,
      checkedOutAt: record.checkedOutAt.toISOString(),
    })),
    canCheckIn: reservation.status === 'CONFIRMED',
    canCheckOut: reservation.status === 'CHECKED_IN',
    canCancel,
  };
}

async function loadReservation(id: string): Promise<ReservationWithRelations> {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: reservationInclude,
  });
  if (!reservation) throw new NotFoundError('Reservation not found');
  return reservation;
}

function assertReservationAccess(
  req: { auth?: { user: { employeeId: string | null } }; access?: { global: boolean; selfOnly: boolean; dormitoryIds: string[]; buildingIds: string[] } },
  reservation: ReservationWithRelations,
): void {
  const access = req.access!;
  if (access.global) return;
  if (access.selfOnly) {
    const employeeId = req.auth?.user.employeeId;
    if (
      employeeId &&
      (reservation.primaryEmployeeId === employeeId ||
        reservation.guests.some((guest) => guest.employeeId === employeeId))
    ) {
      return;
    }
    throw new ForbiddenError('Reservation belongs to another crew member');
  }
  const canReadDormitory =
    access.dormitoryIds.includes(reservation.dormitoryId) ||
    access.buildingIds.includes(
      reservation.allocations[0]?.bed.room.floor.buildingId ?? '',
    );
  if (!canReadDormitory) throw new ForbiddenError('Reservation is outside your scope');
}

function reservationScopeWhere(req: {
  auth?: { user: { employeeId: string | null } };
  access?: { global: boolean; selfOnly: boolean };
}): Prisma.ReservationWhereInput {
  const access = req.access!;
  if (access.global) return {};
  if (access.selfOnly) {
    const employeeId = req.auth?.user.employeeId;
    if (!employeeId) return { id: { equals: '00000000-0000-0000-0000-000000000000' } };
    return {
      OR: [{ primaryEmployeeId: employeeId }, { guests: { some: { employeeId } } }],
    };
  }
  return readableReservationWhere(access as never);
}

function generateBookingCode(): string {
  const date = todayInJakarta().replaceAll('-', '').slice(2);
  return `WS-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function isAllocationConflict(error: unknown): boolean {
  const anyError = error as { code?: string; message?: string; meta?: unknown };
  return (
    anyError?.code === '23P01' ||
    anyError?.code === 'P2010' ||
    (typeof anyError?.message === 'string' &&
      (anyError.message.includes('23P01') || anyError.message.includes('bed_allocations_no_overlap')))
  );
}

function parseStatusFilter(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 30 ? value : undefined;
}

function parseStatusesFilter(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.length > 120) return undefined;
  const list = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!list.length) return undefined;
  if (list.some((item) => !(RESERVATION_STATUSES as readonly string[]).includes(item))) {
    return undefined;
  }
  return list;
}

function parseDateFilter(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const text = validate(dateOnlySchema, value);
  const parsed = parseDateOnly(text);
  if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== text) {
    throw new ValidationError([{ path: [field], message: 'Tanggal tidak valid.' }]);
  }
  return parsed;
}

reservationsRouter.get('/reservations', requirePermission('reservations.read'), async (req, res) => {
  const query = validate(paginationQuerySchema, req.query);
  const status = parseStatusFilter(req.query.status);
  const statuses = status ? undefined : parseStatusesFilter(req.query.statuses);
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const scopeWhere = reservationScopeWhere(req);
  const fromDate = parseDateFilter(from, 'from');
  const toDate = parseDateFilter(to, 'to');
  const where: Prisma.ReservationWhereInput = {
    AND: [
      scopeWhere,
      ...(status ? [{ status }] : statuses ? [{ status: { in: statuses } }] : []),
      ...(fromDate ? [{ checkOutDate: { gt: fromDate } }] : []),
      ...(toDate ? [{ checkInDate: { lt: toDate } }] : []),
      ...(query.q
        ? [
            {
              OR: [
                { bookingCode: { contains: query.q, mode: 'insensitive' as const } },
                {
                  primaryEmployee: {
                    is: { fullName: { contains: query.q, mode: 'insensitive' as const } },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  const [total, items] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: reservationInclude,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(res, { items: items.map(mapSummary), pagination }, { pagination });
});

reservationsRouter.get(
  '/reservations/summary',
  requirePermission('reservations.read'),
  async (req, res) => {
    const scopeWhere = reservationScopeWhere(req);
    const today = todayDateOnly();
    const activeStatuses = { notIn: ['CANCELLED', 'REJECTED'] };
    const [total, statusRows, arrivingToday, departingToday] = await Promise.all([
      prisma.reservation.count({ where: scopeWhere }),
      prisma.reservation.groupBy({ by: ['status'], where: scopeWhere, _count: { _all: true } }),
      prisma.reservation.count({
        where: { AND: [scopeWhere, { checkInDate: today, status: activeStatuses }] },
      }),
      prisma.reservation.count({
        where: { AND: [scopeWhere, { checkOutDate: today, status: activeStatuses }] },
      }),
    ]);
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row._count._all]));
    const summary: ReservationsSummary = {
      total,
      pendingApproval: byStatus.PENDING_APPROVAL ?? 0,
      byStatus,
      arrivingToday,
      departingToday,
      generatedAt: new Date().toISOString(),
    };
    sendSuccess(res, summary);
  },
);

reservationsRouter.get(
  '/reservations/:id',
  requirePermission('reservations.read'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const reservation = await loadReservation(id);
    assertReservationAccess(req, reservation);
    sendSuccess(res, mapDetail(reservation, req.auth!.user.employeeId ?? ''));
  },
);

reservationsRouter.post(
  '/reservations',
  requirePermission('reservations.create'),
  async (req, res) => {
    const input = validate(createReservationSchema, req.body);
    const access = req.access!;
    const canCreateForOthers = hasPermission(req.auth!, 'reservations.create_for_others');

    if (input.idempotencyKey) {
      const existing = await prisma.reservation.findFirst({
        where: { idempotencyKey: input.idempotencyKey, createdBy: req.auth!.user.id },
        include: reservationInclude,
      });
      if (existing) {
        sendSuccess(res, mapDetail(existing, req.auth!.user.employeeId ?? ''));
        return;
      }
    }

    let employeeIds: string[] = [];
    if (input.employeeId || input.employeeIds?.length) {
      if (!canCreateForOthers) {
        throw new ForbiddenError('Creating reservations for other employees is not allowed');
      }
      employeeIds = input.employeeIds?.length ? input.employeeIds : [input.employeeId!];
    } else {
      if (!req.auth!.user.employeeId) {
        throw new ConflictError(ERROR_CODES.EMPLOYEE_NOT_ELIGIBLE, 'Your user account has no employee record');
      }
      employeeIds = [req.auth!.user.employeeId];
    }
    employeeIds = [...new Set(employeeIds)];
    if (employeeIds.length !== input.occupantCount) {
      throw new ValidationError([
        { path: ['occupantCount'], message: 'occupantCount must match the number of employees' },
      ]);
    }

    const today = todayInJakarta();
    if (input.checkInDate < today) {
      throw new ValidationError([{ path: ['checkInDate'], message: 'Check-in date cannot be in the past' }]);
    }
    const nights = Math.round(
      (parseDateOnly(input.checkOutDate).getTime() - parseDateOnly(input.checkInDate).getTime()) /
        86_400_000,
    );
    if (nights > 14) {
      throw new ValidationError([{ path: ['checkOutDate'], message: 'Maximum stay is 14 nights' }]);
    }

    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } });
    if (employees.length !== employeeIds.length) throw new NotFoundError('Employee not found');
    const ineligible = employees.find(
      (employee) =>
        employee.employmentStatus !== 'ACTIVE' || employee.eligibilityStatus === 'INELIGIBLE',
    );
    if (ineligible) {
      throw new ConflictError(
        ERROR_CODES.EMPLOYEE_NOT_ELIGIBLE,
        `${ineligible.fullName} is not eligible for accommodation`,
      );
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'reservation.defaultApprovalMode' },
    });
    const approvalRequiredByPolicy = setting?.value !== 'NOT_REQUIRED';
    const canApprove = hasPermission(req.auth!, 'reservations.approve');
    const autoConfirm = Boolean(input.autoConfirm && canApprove);
    const requiresApproval = approvalRequiredByPolicy && !autoConfirm;
    const initialStatus = requiresApproval ? 'PENDING_APPROVAL' : 'CONFIRMED';
    const source = access.selfOnly ? 'CREW' : 'MANAGEMENT';

    let reservation: ReservationWithRelations;
    try {
      reservation = await prisma.$transaction(
        async (tx) => {
          const available = await findAvailableBeds(
            tx,
            {
              checkIn: input.checkInDate,
              checkOut: input.checkOutDate,
              dormitoryId: input.dormitoryId,
              ...(input.bedIds ? { bedIds: [...new Set(input.bedIds)] } : {}),
            },
            access,
          );
          const chosen = input.bedIds
            ? input.bedIds.map((bedId) => available.find((bed) => bed.id === bedId))
            : available.slice(0, input.occupantCount);
          if (chosen.length !== input.occupantCount || chosen.some((bed) => !bed)) {
            throw new ConflictError(
              ERROR_CODES.ROOM_UNAVAILABLE,
              'The selected bed is no longer available for these dates',
            );
          }
          if (new Set(chosen.map((bed) => bed!.id)).size !== chosen.length) {
            throw new ValidationError([{ path: ['bedIds'], message: 'Selected beds must be unique' }]);
          }

          const bedIds = chosen.map((bed) => bed!.id);
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM beds WHERE id IN (${Prisma.join(
              bedIds.map((id) => Prisma.sql`${id}::uuid`),
            )}) ORDER BY id FOR UPDATE`,
          );

          const created = await tx.reservation.create({
            data: {
              bookingCode: generateBookingCode(),
              primaryEmployeeId: employeeIds[0]!,
              dormitoryId: input.dormitoryId,
              source,
              idempotencyKey: input.idempotencyKey ?? null,
              checkInDate: parseDateOnly(input.checkInDate),
              checkOutDate: parseDateOnly(input.checkOutDate),
              occupantCount: employeeIds.length,
              purpose: input.purpose ?? null,
              status: initialStatus,
              approvalStatus: requiresApproval ? 'PENDING' : 'NOT_REQUIRED',
              confirmedAt: requiresApproval ? null : new Date(),
              createdBy: req.auth!.user.id,
              guests: {
                create: employeeIds.map((employeeId, index) => ({
                  employeeId,
                  guestRole: index === 0 ? 'PRIMARY' : 'COMPANION',
                })),
              },
              events: {
                create: {
                  eventType: 'CREATED',
                  toStatus: initialStatus,
                  actorUserId: req.auth!.user.id,
                  metadata: { source },
                },
              },
              ...(requiresApproval
                ? {
                    approvals: {
                      create: {
                        stepNumber: 1,
                        approverRoleCode: 'DORMITORY_MANAGER',
                        status: 'PENDING',
                      },
                    },
                  }
                : {}),
            },
            include: { guests: true },
          });

          for (const [index, guest] of created.guests.entries()) {
            await tx.bedAllocation.create({
              data: {
                reservationId: created.id,
                reservationGuestId: guest.id,
                bedId: bedIds[index]!,
                stayStart: parseDateOnly(input.checkInDate),
                stayEnd: parseDateOnly(input.checkOutDate),
                status: 'HELD',
                allocatedBy: req.auth!.user.id,
              },
            });
          }

          return tx.reservation.findUniqueOrThrow({
            where: { id: created.id },
            include: reservationInclude,
          });
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (isAllocationConflict(error)) {
        throw new ConflictError(
          ERROR_CODES.BED_ALLOCATION_CONFLICT,
          'The selected bed was allocated by another request',
        );
      }
      throw error;
    }

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'RESERVATION_CREATE',
      entityType: 'RESERVATION',
      entityId: reservation.id,
      afterData: {
        bookingCode: reservation.bookingCode,
        status: reservation.status,
        dormitoryId: reservation.dormitoryId,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    await notifyEmployees(employeeIds, {
      eventCode: 'RESERVATION_CREATED',
      title: 'Reservasi akomodasi dibuat',
      body: `Reservasi ${reservation.bookingCode} untuk ${input.checkInDate} sampai ${input.checkOutDate} telah dibuat.`,
      referenceType: 'RESERVATION',
      referenceId: reservation.id,
      channels: ['EMAIL', 'TELEGRAM'],
    });
    if (requiresApproval) {
      await notifyDormitoryManagers(reservation.dormitoryId, {
        eventCode: 'RESERVATION_APPROVAL_REQUIRED',
        title: 'Reservasi menunggu persetujuan',
        body: `Reservasi ${reservation.bookingCode} oleh ${reservation.primaryEmployee?.fullName ?? 'Unknown'} menunggu validasi.`,
        referenceType: 'RESERVATION',
        referenceId: reservation.id,
      });
    }

    sendSuccess(res, mapDetail(reservation, req.auth!.user.employeeId ?? ''), {
      status: 201,
    });
  },
);

reservationsRouter.post(
  '/reservations/:id/approve',
  requirePermission('reservations.approve'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const reservation = await loadReservation(id);
    assertReservationAccess(req, reservation);
    if (reservation.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation is not awaiting approval');
    }
    if (reservation.createdBy === req.auth!.user.id) {
      throw new ForbiddenError('You cannot approve a reservation you created');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: {
          status: 'CONFIRMED',
          approvalStatus: 'APPROVED',
          approvedBy: req.auth!.user.id,
          approvedAt: new Date(),
          confirmedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          ERROR_CODES.RESERVATION_STATE_INVALID,
          'Reservation is no longer awaiting approval',
        );
      }
      await tx.reservationApproval.updateMany({
        where: { reservationId: id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approverUserId: req.auth!.user.id,
          decisionAt: new Date(),
          comments: typeof req.body?.comment === 'string' ? req.body.comment : null,
        },
      });
      await tx.reservationEvent.create({
        data: {
          reservationId: id,
          eventType: 'APPROVED',
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'CONFIRMED',
          actorUserId: req.auth!.user.id,
        },
      });
      return tx.reservation.findUniqueOrThrow({ where: { id }, include: reservationInclude });
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'RESERVATION_APPROVE',
      entityType: 'RESERVATION',
      entityId: id,
      beforeData: { status: 'PENDING_APPROVAL' },
      afterData: { status: 'CONFIRMED' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    await notifyEmployees(
      updated.guests.map((guest) => guest.employeeId),
      {
        eventCode: 'RESERVATION_CONFIRMED',
        title: 'Reservasi disetujui',
        body: `Reservasi ${updated.bookingCode} telah dikonfirmasi.`,
        referenceType: 'RESERVATION',
        referenceId: updated.id,
        channels: ['EMAIL', 'TELEGRAM'],
      },
    );
    sendSuccess(res, mapDetail(updated, req.auth!.user.employeeId ?? ''));
  },
);

reservationsRouter.post(
  '/reservations/:id/reject',
  requirePermission('reservations.reject'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(rejectReservationSchema, req.body);
    const reservation = await loadReservation(id);
    assertReservationAccess(req, reservation);
    if (reservation.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation is not awaiting approval');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED', approvalStatus: 'REJECTED' },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          ERROR_CODES.RESERVATION_STATE_INVALID,
          'Reservation is no longer awaiting approval',
        );
      }
      await tx.bedAllocation.updateMany({
        where: { reservationId: id, status: 'HELD' },
        data: { status: 'CANCELLED', releasedAt: new Date() },
      });
      await tx.reservationApproval.updateMany({
        where: { reservationId: id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          approverUserId: req.auth!.user.id,
          decisionAt: new Date(),
          comments: input.reason,
        },
      });
      await tx.reservationEvent.create({
        data: {
          reservationId: id,
          eventType: 'REJECTED',
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'REJECTED',
          reason: input.reason,
          actorUserId: req.auth!.user.id,
        },
      });
      return tx.reservation.findUniqueOrThrow({ where: { id }, include: reservationInclude });
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'RESERVATION_REJECT',
      entityType: 'RESERVATION',
      entityId: id,
      afterData: { status: 'REJECTED', reason: input.reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    await notifyEmployees(
      updated.guests.map((guest) => guest.employeeId),
      {
        eventCode: 'RESERVATION_REJECTED',
        title: 'Reservasi ditolak',
        body: `Reservasi ${updated.bookingCode} ditolak: ${input.reason}`,
        referenceType: 'RESERVATION',
        referenceId: updated.id,
        channels: ['EMAIL', 'TELEGRAM'],
      },
    );
    sendSuccess(res, mapDetail(updated, req.auth!.user.employeeId ?? ''));
  },
);

reservationsRouter.post(
  '/reservations/:id/cancel',
  requirePermission('reservations.cancel'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(cancelReservationSchema, req.body);
    const reservation = await loadReservation(id);
    assertReservationAccess(req, reservation);
    if (!['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED'].includes(reservation.status)) {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation cannot be cancelled');
    }
    if (reservation.checkInDate <= todayDateOnly()) {
      throw new ConflictError(
        ERROR_CODES.RESERVATION_STATE_INVALID,
        'Same-day or started reservations must be handled by front desk',
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({
        where: { id, status: reservation.status },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: input.reason,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          ERROR_CODES.RESERVATION_STATE_INVALID,
          'Reservation status changed; reload before cancelling',
        );
      }
      await tx.bedAllocation.updateMany({
        where: { reservationId: id, status: 'HELD' },
        data: { status: 'CANCELLED', releasedAt: new Date() },
      });
      await tx.reservationEvent.create({
        data: {
          reservationId: id,
          eventType: 'CANCELLED',
          fromStatus: reservation.status,
          toStatus: 'CANCELLED',
          reason: input.reason,
          actorUserId: req.auth!.user.id,
        },
      });
      return tx.reservation.findUniqueOrThrow({ where: { id }, include: reservationInclude });
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'RESERVATION_CANCEL',
      entityType: 'RESERVATION',
      entityId: id,
      afterData: { status: 'CANCELLED', reason: input.reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    await notifyEmployees(
      updated.guests.map((guest) => guest.employeeId),
      {
        eventCode: 'RESERVATION_CANCELLED',
        title: 'Reservasi dibatalkan',
        body: `Reservasi ${updated.bookingCode} dibatalkan.`,
        referenceType: 'RESERVATION',
        referenceId: updated.id,
      },
    );
    sendSuccess(res, mapDetail(updated, req.auth!.user.employeeId ?? ''));
  },
);

reservationsRouter.post(
  '/reservations/:id/no-show',
  requirePermission('reservations.no_show'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const reservation = await loadReservation(id);
    assertReservationAccess(req, reservation);
    if (reservation.status !== 'CONFIRMED' || reservation.checkInDate > todayDateOnly()) {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Only started confirmed reservations can be marked no-show');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({
        where: { id, status: 'CONFIRMED' },
        data: { status: 'NO_SHOW' },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          ERROR_CODES.RESERVATION_STATE_INVALID,
          'Reservation status changed; reload before marking no-show',
        );
      }
      await tx.bedAllocation.updateMany({
        where: { reservationId: id, status: 'HELD' },
        data: { status: 'CANCELLED', releasedAt: new Date() },
      });
      await tx.reservationEvent.create({
        data: {
          reservationId: id,
          eventType: 'NO_SHOW',
          fromStatus: 'CONFIRMED',
          toStatus: 'NO_SHOW',
          actorUserId: req.auth!.user.id,
        },
      });
      return tx.reservation.findUniqueOrThrow({ where: { id }, include: reservationInclude });
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'RESERVATION_NO_SHOW',
      entityType: 'RESERVATION',
      entityId: id,
      afterData: { status: 'NO_SHOW' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, mapDetail(updated, req.auth!.user.employeeId ?? ''));
  },
);

reservationsRouter.post(
  '/reservations/:id/allocate',
  requirePermission('allocations.execute'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(allocateReservationSchema, req.body);
    const reservation = await loadReservation(id);
    assertReservationAccess(req, reservation);
    if (!['PENDING_APPROVAL', 'CONFIRMED'].includes(reservation.status)) {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation is not allocatable');
    }
    if (reservation.allocations.some((item) => item.status === 'HELD' || item.status === 'ACTIVE')) {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation already has active allocations');
    }
    if (input.bedIds.length !== reservation.guests.length) {
      throw new ValidationError([{ path: ['bedIds'], message: 'One bed is required per guest' }]);
    }

    const checkIn = formatDateOnly(reservation.checkInDate);
    const checkOut = formatDateOnly(reservation.checkOutDate);
    const available = await findAvailableBeds(
      prisma,
      { checkIn, checkOut, dormitoryId: reservation.dormitoryId, bedIds: input.bedIds },
      req.access!,
    );
    if (available.length !== input.bedIds.length) {
      throw new ConflictError(ERROR_CODES.ROOM_UNAVAILABLE, 'One or more beds are unavailable');
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const [index, guest] of reservation.guests.entries()) {
          await tx.bedAllocation.create({
            data: {
              reservationId: id,
              reservationGuestId: guest.id,
              bedId: input.bedIds[index]!,
              stayStart: reservation.checkInDate,
              stayEnd: reservation.checkOutDate,
              status: 'HELD',
              allocatedBy: req.auth!.user.id,
            },
          });
        }
        await tx.reservationEvent.create({
          data: {
            reservationId: id,
            eventType: 'ALLOCATION_EXECUTED',
            actorUserId: req.auth!.user.id,
            metadata: { bedIds: input.bedIds },
          },
        });
      });
    } catch (error) {
      if (isAllocationConflict(error)) {
        throw new ConflictError(ERROR_CODES.BED_ALLOCATION_CONFLICT, 'Bed allocation conflict');
      }
      throw error;
    }

    const updated = await loadReservation(id);
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ALLOCATION_EXECUTE',
      entityType: 'RESERVATION',
      entityId: id,
      afterData: { bedIds: input.bedIds },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, mapDetail(updated, req.auth!.user.employeeId ?? ''));
  },
);

reservationsRouter.get('/my/summary', requirePermission('reservations.read'), async (req, res) => {
  const employeeId = req.auth!.user.employeeId;
  if (!employeeId) {
    sendSuccess(res, { upcoming: null, active: 0, history: 0 });
    return;
  }
  const today = todayDateOnly();
  const [upcoming, active, history] = await Promise.all([
    prisma.reservation.findFirst({
      where: {
        primaryEmployeeId: employeeId,
        status: { in: ['PENDING_APPROVAL', 'CONFIRMED'] },
        checkOutDate: { gt: today },
      },
      include: reservationInclude,
      orderBy: { checkInDate: 'asc' },
    }),
    prisma.reservation.count({
      where: { primaryEmployeeId: employeeId, status: 'CHECKED_IN' },
    }),
    prisma.reservation.count({
      where: {
        primaryEmployeeId: employeeId,
        status: { in: ['CHECKED_OUT', 'CANCELLED', 'REJECTED', 'NO_SHOW'] },
      },
    }),
  ]);
  sendSuccess(res, {
    upcoming: upcoming ? mapSummary(upcoming) : null,
    active,
    history,
  });
});
