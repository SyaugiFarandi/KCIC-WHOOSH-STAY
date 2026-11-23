import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ERROR_CODES,
  checkInSchema,
  checkOutSchema,
  createPaginationQuerySchema,
  validateQrSchema,
  type ReservationDetail,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, requestId, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { readableReservationWhere } from '../../lib/scope.js';
import { writeAudit } from '../audit/audit.js';
import { safeRecordReservationException } from '../exceptions/service.js';
import { formatDateOnly, nightsBetween, todayInJakarta } from '../../lib/dates.js';
import { notifyEmployees } from '../notifications/service.js';
import { evaluateAndEnforce } from '../policies/service.js';
import { minutesSinceJakartaStartOfDay } from '../policies/integration.js';

export const staysRouter = Router();

const stayInclude = {
  primaryEmployee: true,
  dormitory: true,
  guests: { include: { employee: true } },
  allocations: {
    include: {
      bed: {
        include: {
          room: {
            include: { floor: { include: { building: { include: { dormitory: true } } } } },
          },
        },
      },
    },
  },
  checkins: { include: { employee: true } },
  checkouts: { include: { employee: true } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ReservationInclude;

type StayReservation = Prisma.ReservationGetPayload<{ include: typeof stayInclude }>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function loadStay(id: string): Promise<StayReservation> {
  const reservation = await prisma.reservation.findUnique({ where: { id }, include: stayInclude });
  if (!reservation) throw new NotFoundError('Reservation not found');
  return reservation;
}

function assertStayAccess(
  access: { global: boolean; selfOnly: boolean; dormitoryIds: string[]; buildingIds: string[] },
  employeeId: string | null,
  reservation: StayReservation,
): void {
  if (access.global) return;
  if (access.selfOnly) {
    if (
      employeeId &&
      (reservation.primaryEmployeeId === employeeId ||
        reservation.guests.some((guest) => guest.employeeId === employeeId))
    ) {
      return;
    }
    throw new ForbiddenError('Reservation belongs to another crew member');
  }
  if (
    !access.dormitoryIds.includes(reservation.dormitoryId) &&
    !reservation.allocations.some((allocation) =>
      access.buildingIds.includes(allocation.bed.room.floor.buildingId),
    )
  ) {
    throw new ForbiddenError('Reservation is outside your scope');
  }
}

function activeAllocation(reservation: StayReservation) {
  return reservation.allocations.find(
    (allocation) => allocation.status === 'HELD' || allocation.status === 'ACTIVE',
  );
}

function stayCategoryTags(reservation: StayReservation): string[] {
  return [
    ...new Set(
      reservation.guests.flatMap((guest) => [
        ...(guest.employee.departmentCode ? [`dept:${guest.employee.departmentCode}`] : []),
        ...(guest.employee.divisionCode ? [`div:${guest.employee.divisionCode}`] : []),
        ...(guest.employee.positionCode ? [`pos:${guest.employee.positionCode}`] : []),
      ]),
    ),
  ];
}

function mapStayDetail(reservation: StayReservation): ReservationDetail {
  const primaryAllocation = activeAllocation(reservation);
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
    allocationSummary: primaryAllocation
      ? `${primaryAllocation.bed.room.roomNumber}/${primaryAllocation.bed.bedCode}`
      : null,
    isEmergency: reservation.isEmergency,
    emergencyReason: reservation.emergencyReason,
    priority: reservation.priority,
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
    canCancel: false,
  };
}

async function assertReadyForStay(
  reservation: StayReservation,
  actorUserId: string | null,
): Promise<void> {
  const allocation = activeAllocation(reservation);
  if (!allocation) {
    await safeRecordReservationException({
      dedupeKey: `ALLOCATION_MISSING:${reservation.id}`,
      type: 'ALLOCATION_MISSING',
      severity: 'HIGH',
      dormitoryId: reservation.dormitoryId,
      reservationId: reservation.id,
      title: 'Check-in tanpa alokasi tempat tidur',
      description: `Reservasi ${reservation.bookingCode} belum memiliki alokasi tempat tidur saat percobaan check-in.`,
      evidence: {
        bookingCode: reservation.bookingCode,
        checkInDate: formatDateOnly(reservation.checkInDate),
        checkOutDate: formatDateOnly(reservation.checkOutDate),
      },
      actorUserId,
    });
    throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation has no bed allocation');
  }
  const now = new Date();
  const blocking = await prisma.inventoryBlock.findFirst({
    where: {
      startAt: { lte: now },
      endAt: { gt: now },
      OR: [{ bedId: allocation.bedId }, { roomId: allocation.bed.roomId }],
    },
    select: { id: true },
  });
  const reasons: string[] = [];
  if (blocking) reasons.push(`inventory_block:${blocking.id}`);
  if (allocation.bed.status !== 'ACTIVE') reasons.push(`bed_status:${allocation.bed.status}`);
  if (allocation.bed.housekeepingStatus !== 'READY') {
    reasons.push(`bed_housekeeping:${allocation.bed.housekeepingStatus}`);
  }
  if (allocation.bed.room.operationalStatus !== 'ACTIVE') {
    reasons.push(`room_status:${allocation.bed.room.operationalStatus}`);
  }
  if (allocation.bed.room.housekeepingStatus !== 'READY') {
    reasons.push(`room_housekeeping:${allocation.bed.room.housekeepingStatus}`);
  }
  if (reasons.length) {
    await safeRecordReservationException({
      dedupeKey: `READINESS_FAILURE:${reservation.id}:${allocation.bedId}`,
      type: 'READINESS_FAILURE',
      severity: 'HIGH',
      dormitoryId: reservation.dormitoryId,
      reservationId: reservation.id,
      roomId: allocation.bed.roomId,
      bedId: allocation.bedId,
      title: 'Check-in gagal karena kesiapan kamar',
      description: `Kamar ${allocation.bed.room.roomNumber} / tempat tidur ${allocation.bed.bedCode} belum siap untuk check-in.`,
      evidence: {
        reasons,
        bedStatus: allocation.bed.status,
        bedHousekeepingStatus: allocation.bed.housekeepingStatus,
        roomOperationalStatus: allocation.bed.room.operationalStatus,
        roomHousekeepingStatus: allocation.bed.room.housekeepingStatus,
        inventoryBlockId: blocking?.id ?? null,
      },
      actorUserId,
    });
    throw new ConflictError(ERROR_CODES.ROOM_UNAVAILABLE, 'Room or bed is not operationally ready');
  }
}

staysRouter.post('/reservations/:id/qr', requirePermission('stays.read'), async (req, res) => {
  const id = validate(z.uuid(), req.params.id);
  const reservation = await loadStay(id);
  assertStayAccess(req.access!, req.auth!.user.employeeId, reservation);
  if (reservation.status !== 'CONFIRMED') {
    throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'QR is only issued for confirmed reservations');
  }

  const employeeId =
    typeof req.body?.employeeId === 'string' ? req.body.employeeId : reservation.primaryEmployeeId;
  if (!reservation.guests.some((guest) => guest.employeeId === employeeId)) {
    throw new NotFoundError('Guest not found on reservation');
  }
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const maxExpiry = new Date(Date.now() + 7 * 86_400_000);
  const stayEnd = new Date(`${formatDateOnly(reservation.checkOutDate)}T23:59:59+07:00`);
  const expiresAt = stayEnd < maxExpiry ? stayEnd : maxExpiry;

  await prisma.$transaction(async (tx) => {
    await tx.qrToken.updateMany({
      where: { reservationId: id, employeeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.qrToken.create({
      data: { reservationId: id, employeeId, tokenHash, expiresAt },
    });
  });

  sendSuccess(res, {
    token,
    expiresAt: expiresAt.toISOString(),
    reservationId: reservation.id,
    bookingCode: reservation.bookingCode,
  });
});

staysRouter.post('/stays/validate-qr', requirePermission('stays.check_in'), async (req, res) => {
  const input = validate(validateQrSchema, req.body);
  const tokenHash = hashToken(input.token);
  const qr = await prisma.qrToken.findUnique({ where: { tokenHash } });
  if (!qr) throw new ConflictError(ERROR_CODES.QR_INVALID, 'QR code is not recognized');
  if (qr.consumedAt) throw new ConflictError(ERROR_CODES.QR_ALREADY_USED, 'QR code was already used');
  if (qr.expiresAt < new Date()) throw new ConflictError(ERROR_CODES.QR_EXPIRED, 'QR code has expired');

  const reservation = await loadStay(qr.reservationId);
  assertStayAccess(req.access!, req.auth!.user.employeeId, reservation);
  const today = todayInJakarta();
  const checkIn = formatDateOnly(reservation.checkInDate);
  const checkOut = formatDateOnly(reservation.checkOutDate);
  const canCheckIn =
    reservation.status === 'CONFIRMED' && today >= checkIn && today < checkOut;

  sendSuccess(res, {
    valid: true,
    canCheckIn,
    expiresAt: qr.expiresAt.toISOString(),
    reservation: mapStayDetail(reservation),
  });
});

staysRouter.post('/stays/check-in', requirePermission('stays.check_in'), async (req, res) => {
  const input = validate(checkInSchema, req.body);
  let reservationId = input.reservationId;
  let qrId: string | null = null;
  let qrEmployeeId: string | null = null;

  if (input.token) {
    const qr = await prisma.qrToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!qr) throw new ConflictError(ERROR_CODES.QR_INVALID, 'QR code is not recognized');
    if (qr.consumedAt) throw new ConflictError(ERROR_CODES.QR_ALREADY_USED, 'QR code was already used');
    if (qr.expiresAt < new Date()) throw new ConflictError(ERROR_CODES.QR_EXPIRED, 'QR code has expired');
    if (input.reservationId && input.reservationId !== qr.reservationId) {
      throw new ConflictError(ERROR_CODES.QR_INVALID, 'QR code belongs to another reservation');
    }
    if (input.employeeId && input.employeeId !== qr.employeeId) {
      throw new ForbiddenError('QR code belongs to another guest');
    }
    reservationId = qr.reservationId;
    qrId = qr.id;
    qrEmployeeId = qr.employeeId;
  }

  const reservation = await loadStay(reservationId!);
  assertStayAccess(req.access!, req.auth!.user.employeeId, reservation);
  if (reservation.status !== 'CONFIRMED') {
    throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Only confirmed reservations can check in');
  }
  const today = todayInJakarta();
  const checkIn = formatDateOnly(reservation.checkInDate);
  const checkOut = formatDateOnly(reservation.checkOutDate);
  if (today < checkIn || today >= checkOut) {
    throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Check-in is outside the reservation date range');
  }
  await assertReadyForStay(reservation, req.auth!.user.id);

  const targetEmployees = qrEmployeeId
    ? [qrEmployeeId]
    : input.employeeId
      ? [input.employeeId]
      : reservation.guests.map((guest) => guest.employeeId);
  if (targetEmployees.some((id) => !reservation.guests.some((guest) => guest.employeeId === id))) {
    throw new NotFoundError('Guest not found on reservation');
  }

  await evaluateAndEnforce(
    {
      workflow: 'CHECK_IN',
      asOfDate: today,
      dormitoryId: reservation.dormitoryId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      nights: nightsBetween(checkIn, checkOut),
      occupantCount: reservation.occupantCount,
      priority: reservation.priority,
      isEmergency: reservation.isEmergency,
      earlyCheckInMinutes: 0,
      beforeScheduledDate: today < checkIn,
      employeeCategories: stayCategoryTags(reservation),
      subjectType: 'STAY',
      subjectId: reservation.id,
    },
    {
      actorUserId: req.auth!.user.id,
      requestId: requestId(),
      subjectType: 'STAY',
      subjectId: reservation.id,
    },
  );

  const updated = await prisma.$transaction(async (tx) => {
    // Serialize concurrent check-ins on the same reservation and re-validate state
    // under the row lock so a QR token cannot be spent twice (TOCTOU).
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservation.id}::uuid FOR UPDATE`;
    const locked = await tx.reservation.findUnique({
      where: { id: reservation.id },
      select: { status: true },
    });
    if (!locked || locked.status !== 'CONFIRMED') {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Only confirmed reservations can check in');
    }
    if (qrId) {
      await tx.$queryRaw`SELECT id FROM qr_tokens WHERE id = ${qrId}::uuid FOR UPDATE`;
      const qrNow = await tx.qrToken.findUnique({
        where: { id: qrId },
        select: { consumedAt: true, expiresAt: true },
      });
      if (!qrNow || qrNow.consumedAt) {
        throw new ConflictError(ERROR_CODES.QR_ALREADY_USED, 'QR code was already used');
      }
      if (qrNow.expiresAt < new Date()) {
        throw new ConflictError(ERROR_CODES.QR_EXPIRED, 'QR code has expired');
      }
    }
    for (const guest of reservation.guests.filter((item) =>
      targetEmployees.includes(item.employeeId),
    )) {
      const existing = await tx.checkinRecord.findUnique({
        where: {
          reservationId_employeeId: { reservationId: reservation.id, employeeId: guest.employeeId },
        },
      });
      if (!existing) {
        await tx.checkinRecord.create({
          data: {
            reservationId: reservation.id,
            employeeId: guest.employeeId,
            verifiedBy: req.auth!.user.id,
            verificationMethod: input.token ? 'QR' : 'MANUAL',
            notes: input.notes ?? null,
          },
        });
      }
      await tx.bedAllocation.updateMany({
        where: {
          reservationId: reservation.id,
          reservationGuestId: guest.id,
          status: 'HELD',
        },
        data: { status: 'ACTIVE' },
      });
    }
    if (qrId) {
      await tx.qrToken.update({ where: { id: qrId }, data: { consumedAt: new Date() } });
    }
    return tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'CHECKED_IN',
        events: {
          create: {
            eventType: 'CHECKED_IN',
            fromStatus: 'CONFIRMED',
            toStatus: 'CHECKED_IN',
            actorUserId: req.auth!.user.id,
            metadata: { method: input.token ? 'QR' : 'MANUAL' },
          },
        },
      },
      include: stayInclude,
    });
  });

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'STAY_CHECK_IN',
    entityType: 'RESERVATION',
    entityId: reservation.id,
    afterData: { method: input.token ? 'QR' : 'MANUAL' },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  await notifyEmployees(targetEmployees, {
    eventCode: 'STAY_CHECKED_IN',
    title: 'Check-in berhasil',
    body: `Check-in reservasi ${reservation.bookingCode} berhasil diproses.`,
    referenceType: 'RESERVATION',
    referenceId: reservation.id,
  });

  sendSuccess(res, mapStayDetail(updated));
});

staysRouter.post('/stays/check-out', requirePermission('stays.check_out'), async (req, res) => {
  const input = validate(checkOutSchema, req.body);
  const reservation = await loadStay(input.reservationId);
  assertStayAccess(req.access!, req.auth!.user.employeeId, reservation);
  if (reservation.status !== 'CHECKED_IN') {
    throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation is not checked in');
  }

  if (input.employeeId) {
    if (!reservation.guests.some((guest) => guest.employeeId === input.employeeId)) {
      throw new NotFoundError('Guest not found on reservation');
    }
    if (!reservation.checkins.some((record) => record.employeeId === input.employeeId)) {
      throw new ConflictError(
        ERROR_CODES.RESERVATION_STATE_INVALID,
        'Guest has not checked in',
      );
    }
    if (reservation.checkouts.some((record) => record.employeeId === input.employeeId)) {
      throw new ConflictError(
        ERROR_CODES.RESERVATION_STATE_INVALID,
        'Guest already checked out',
      );
    }
  }

  const employeeIds = input.employeeId
    ? [input.employeeId]
    : reservation.guests
        .filter((guest) => reservation.checkins.some((record) => record.employeeId === guest.employeeId))
        .filter((guest) => !reservation.checkouts.some((record) => record.employeeId === guest.employeeId))
        .map((guest) => guest.employeeId);
  if (!employeeIds.length) {
    throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'No checked-in guests remain');
  }

  const today = todayInJakarta();
  const checkInDate = formatDateOnly(reservation.checkInDate);
  const checkOutDate = formatDateOnly(reservation.checkOutDate);
  await evaluateAndEnforce(
    {
      workflow: 'CHECK_OUT',
      asOfDate: today,
      dormitoryId: reservation.dormitoryId,
      checkInDate,
      checkOutDate,
      nights: nightsBetween(checkInDate, checkOutDate),
      occupantCount: reservation.occupantCount,
      priority: reservation.priority,
      isEmergency: reservation.isEmergency,
      lateCheckOutMinutes:
        today > checkOutDate ? minutesSinceJakartaStartOfDay(checkOutDate) : 0,
      beforeScheduledCheckout: today < checkOutDate,
      employeeCategories: stayCategoryTags(reservation),
      subjectType: 'STAY',
      subjectId: reservation.id,
    },
    {
      actorUserId: req.auth!.user.id,
      requestId: requestId(),
      subjectType: 'STAY',
      subjectId: reservation.id,
    },
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservation.id}::uuid FOR UPDATE`;
    const locked = await tx.reservation.findUnique({
      where: { id: reservation.id },
      select: { status: true },
    });
    if (!locked || locked.status !== 'CHECKED_IN') {
      throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Reservation is not checked in');
    }
    for (const employeeId of employeeIds) {
      const existing = await tx.checkoutRecord.findUnique({
        where: { reservationId_employeeId: { reservationId: reservation.id, employeeId } },
      });
      if (existing) continue;
      const checkin = await tx.checkinRecord.findUnique({
        where: { reservationId_employeeId: { reservationId: reservation.id, employeeId } },
        select: { id: true },
      });
      if (!checkin) {
        throw new ConflictError(ERROR_CODES.RESERVATION_STATE_INVALID, 'Guest has not checked in');
      }
      await tx.checkoutRecord.create({
        data: {
          reservationId: reservation.id,
          employeeId,
          verifiedBy: req.auth!.user.id,
          roomCondition: input.roomCondition,
          notes: input.notes ?? null,
        },
      });
      const guest = reservation.guests.find((item) => item.employeeId === employeeId);
      const allocation = reservation.allocations.find(
        (item) => item.reservationGuestId === guest?.id && item.status === 'ACTIVE',
      );
      if (allocation) {
        await tx.bedAllocation.update({
          where: { id: allocation.id },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });
        await tx.bed.update({
          where: { id: allocation.bedId },
          data: { housekeepingStatus: 'DIRTY', statusReason: 'Checked out, awaiting housekeeping' },
        });
        await tx.room.update({
          where: { id: allocation.bed.roomId },
          data: { housekeepingStatus: 'DIRTY', statusReason: 'Checked out, awaiting housekeeping' },
        });
        const existingTask = await tx.housekeepingTask.findFirst({
          where: {
            reservationId: reservation.id,
            roomId: allocation.bed.roomId,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        });
        if (!existingTask) {
          await tx.housekeepingTask.create({
            data: {
              roomId: allocation.bed.roomId,
              bedId: allocation.bedId,
              reservationId: reservation.id,
              taskType: 'CLEANING',
              status: 'PENDING',
              scheduledAt: new Date(),
              notes: 'Otomatis dibuat setelah check-out',
              checklistItems: {
                create: [
                  { itemLabel: 'Ganti linen dan handuk' },
                  { itemLabel: 'Bersihkan kamar mandi' },
                  { itemLabel: 'Periksa fasilitas kamar' },
                ],
              },
            },
          });
        }
      }
    }

    const checkedInCount = await tx.checkinRecord.count({
      where: { reservationId: reservation.id },
    });
    const checkoutCount = await tx.checkoutRecord.count({
      where: { reservationId: reservation.id },
    });
    const complete = checkedInCount > 0 && checkoutCount >= checkedInCount;
    return tx.reservation.update({
      where: { id: reservation.id },
      data: {
        ...(complete ? { status: 'CHECKED_OUT' } : {}),
        events: {
          create: {
            eventType: 'CHECKED_OUT',
            fromStatus: 'CHECKED_IN',
            toStatus: complete ? 'CHECKED_OUT' : 'CHECKED_IN',
            actorUserId: req.auth!.user.id,
          },
        },
      },
      include: stayInclude,
    });
  });

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'STAY_CHECK_OUT',
    entityType: 'RESERVATION',
    entityId: reservation.id,
    afterData: { employees: employeeIds, roomCondition: input.roomCondition },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  await notifyEmployees(employeeIds, {
    eventCode: 'STAY_CHECKED_OUT',
    title: 'Check-out selesai',
    body: `Check-out reservasi ${reservation.bookingCode} telah dicatat.`,
    referenceType: 'RESERVATION',
    referenceId: reservation.id,
  });

  sendSuccess(res, mapStayDetail(updated));
});

staysRouter.get('/stays/active', requirePermission('stays.read'), async (req, res) => {
  const access = req.access!;
  const query = validate(
    createPaginationQuerySchema({ pageSize: 50, maxPageSize: 200 }),
    req.query,
  );
  const where: Prisma.ReservationWhereInput = {
    status: 'CHECKED_IN',
    ...(access.global
      ? {}
      : access.selfOnly
        ? req.auth!.user.employeeId
          ? {
              OR: [
                { primaryEmployeeId: req.auth!.user.employeeId },
                { guests: { some: { employeeId: req.auth!.user.employeeId } } },
              ],
            }
          : { id: '00000000-0000-0000-0000-000000000000' }
        : readableReservationWhere(access)),
  };
  const [total, reservations] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: stayInclude,
      orderBy: [{ checkInDate: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const pagination = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(res, {
    items: reservations.map((reservation) => {
      const allocation = activeAllocation(reservation);
      return {
        reservationId: reservation.id,
        bookingCode: reservation.bookingCode,
        employeeName: reservation.primaryEmployee?.fullName ?? 'Unknown',
        dormitoryName: reservation.dormitory.name,
        roomBeds: allocation
          ? `${allocation.bed.room.roomNumber}/${allocation.bed.bedCode}`
          : '—',
        checkInDate: formatDateOnly(reservation.checkInDate),
        checkOutDate: formatDateOnly(reservation.checkOutDate),
        status: reservation.status,
        checkedInAt: reservation.checkins[0]?.checkedInAt.toISOString() ?? null,
        hasCheckedOut: reservation.checkouts.length > 0,
      };
    }),
    pagination,
  }, { pagination });
});

staysRouter.get('/stays/lookup', requirePermission('stays.read'), async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  if (!code) throw new NotFoundError('Booking code is required');
  const reservation = await prisma.reservation.findFirst({
    where: { bookingCode: { equals: code, mode: 'insensitive' } },
    include: stayInclude,
  });
  if (!reservation) throw new NotFoundError('Reservation not found');
  assertStayAccess(req.access!, req.auth!.user.employeeId, reservation);
  sendSuccess(res, mapStayDetail(reservation));
});
