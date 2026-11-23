import { Router } from 'express';
import type { CalendarDay, CalendarReservationEvent, OccupancyCalendarResult } from '@whoosh/shared';
import { calendarQuerySchema } from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ForbiddenError, ValidationError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { readableDormitoryWhere, readableReservationWhere } from '../../lib/scope.js';
import { addDays, formatDateOnly, parseDateOnly } from '../../lib/dates.js';

export const calendarRouter = Router();

const MAX_RANGE_DAYS = 62;

calendarRouter.get('/calendar', requirePermission('reservations.read'), async (req, res) => {
  const query = validate(calendarQuerySchema, req.query);
  const access = req.access!;
  if (access.selfOnly) {
    throw new ForbiddenError('Occupancy calendar requires a management scope');
  }

  const from = parseDateOnly(query.from);
  const to = parseDateOnly(query.to);
  const rangeDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
    throw new ValidationError([
      { path: ['to'], message: `Range must be between 1 and ${MAX_RANGE_DAYS} days` },
    ]);
  }

  const dormitoryScope = readableDormitoryWhere(access);
  const buildingOnly = access.buildingIds.length > 0 && access.dormitoryIds.length === 0;
  const dormitories = await prisma.dormitory.findMany({
    where: {
      status: 'ACTIVE',
      ...dormitoryScope,
      ...(query.dormitoryId ? { id: query.dormitoryId } : {}),
    },
    include: {
      buildings: {
        ...(buildingOnly ? { where: { id: { in: access.buildingIds } } } : {}),
        include: {
          floors: {
            include: { rooms: { include: { beds: { where: { status: 'ACTIVE' } } } } },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  if (query.dormitoryId && dormitories.length === 0) {
    throw new ForbiddenError('Dormitory is outside your scope');
  }
  const dormitoryIds = dormitories.map((dormitory) => dormitory.id);
  const totalBeds = dormitories.reduce(
    (dormitorySum, dormitory) =>
      dormitorySum +
      dormitory.buildings.reduce(
        (buildingSum, building) =>
          buildingSum +
          building.floors.reduce(
            (floorSum, floor) =>
              floorSum + floor.rooms.reduce((roomSum, room) => roomSum + room.beds.length, 0),
            0,
          ),
        0,
      ),
    0,
  );

  if (dormitoryIds.length === 0) {
    sendSuccess(res, {
      from: query.from,
      to: query.to,
      dormitoryId: query.dormitoryId ?? null,
      totalBeds: 0,
      days: buildEmptyDays(query.from, rangeDays, 0, [], []),
    } satisfies OccupancyCalendarResult);
    return;
  }

  const [allocations, reservations] = await Promise.all([
    prisma.bedAllocation.findMany({
      where: {
        status: { in: ['HELD', 'ACTIVE'] },
        stayStart: { lt: to },
        stayEnd: { gt: from },
        bed: {
          room: {
            floor: {
              building: { dormitoryId: { in: dormitoryIds } },
              ...(buildingOnly ? { buildingId: { in: access.buildingIds } } : {}),
            },
          },
        },
      },
      select: { bedId: true, stayStart: true, stayEnd: true },
    }),
    prisma.reservation.findMany({
      where: {
        dormitoryId: { in: dormitoryIds },
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        AND: [
          readableReservationWhere(access),
          {
            OR: [{ checkInDate: { gte: from, lt: to } }, { checkOutDate: { gte: from, lt: to } }],
          },
        ],
      },
      select: {
        id: true,
        bookingCode: true,
        checkInDate: true,
        checkOutDate: true,
        status: true,
        occupantCount: true,
        dormitory: { select: { name: true } },
        primaryEmployee: { select: { fullName: true } },
      },
    }),
  ]);

  const toEvent = (reservation: (typeof reservations)[number]): CalendarReservationEvent => ({
    id: reservation.id,
    bookingCode: reservation.bookingCode,
    employeeName: reservation.primaryEmployee?.fullName ?? 'Unknown',
    dormitoryName: reservation.dormitory.name,
    status: reservation.status,
    guestCount: reservation.occupantCount,
  });
  const arrivals = reservations.map((reservation) => ({
    date: formatDateOnly(reservation.checkInDate),
    event: toEvent(reservation),
  }));
  const departures = reservations.map((reservation) => ({
    date: formatDateOnly(reservation.checkOutDate),
    event: toEvent(reservation),
  }));

  const days: CalendarDay[] = [];
  for (let index = 0; index < rangeDays; index += 1) {
    const dayStart = addDays(from, index);
    const dayEnd = addDays(dayStart, 1);
    const date = formatDateOnly(dayStart);
    const occupiedBeds = new Set(
      allocations
        .filter((allocation) => allocation.stayStart < dayEnd && allocation.stayEnd > dayStart)
        .map((allocation) => allocation.bedId),
    ).size;
    days.push({
      date,
      totalBeds,
      occupiedBeds,
      availableBeds: Math.max(0, totalBeds - occupiedBeds),
      occupancyRate: totalBeds
        ? Number(((occupiedBeds / totalBeds) * 100).toFixed(1))
        : 0,
      arrivals: arrivals.filter((item) => item.date === date).map((item) => item.event),
      departures: departures.filter((item) => item.date === date).map((item) => item.event),
    });
  }

  sendSuccess(res, {
    from: query.from,
    to: query.to,
    dormitoryId: query.dormitoryId ?? null,
    totalBeds,
    days,
  } satisfies OccupancyCalendarResult);
});

function buildEmptyDays(
  from: string,
  rangeDays: number,
  totalBeds: number,
  arrivals: Array<{ date: string; event: CalendarReservationEvent }>,
  departures: Array<{ date: string; event: CalendarReservationEvent }>,
): CalendarDay[] {
  return Array.from({ length: rangeDays }, (_, index) => {
    const date = formatDateOnly(addDays(parseDateOnly(from), index));
    return {
      date,
      totalBeds,
      occupiedBeds: 0,
      availableBeds: totalBeds,
      occupancyRate: 0,
      arrivals: arrivals.filter((item) => item.date === date).map((item) => item.event),
      departures: departures.filter((item) => item.date === date).map((item) => item.event),
    };
  });
}
